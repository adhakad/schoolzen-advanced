/**
 * Classes & Sections — a school's own class/stream/section configuration, and the source
 * data behind every Class/Stream/Section filter in the modules built after this one.
 *
 * Reference: docs/schoolzen-planning/v1/academic-setup/classes-sections.html
 *
 * The template is that reference's markup — same nesting, same class names, in the same
 * order — with Angular bindings layered on top. That is why the toolbar, table and modals
 * are inline markup here rather than app-data-toolbar / app-data-table: those emit a flex
 * grid, and every reference in this package renders a real <table>. app-confirm-modal,
 * app-form-modal, app-dd and app-pagination-bar ARE used — each of them is the reference's
 * own markup, built once.
 *
 * Three rules this page exists to honour, all easy to undo by accident:
 *
 *   1. The Streams and Sections cells are a CLICKABLE TAG that opens a read-only Details
 *      modal — never the names inline in the table, which would make the column width move
 *      as a school grows. "— not applicable" and "Set per stream" are the two absence
 *      states, and they read as absence rather than as a value.
 *   2. The streams toggle is structural, not cosmetic: a class either keeps its sections
 *      directly, or keeps them under each stream. The form swaps whole regions, and the
 *      validator refuses a payload that populates both halves.
 *   3. Nothing destructive fires on a click. Every delete — one row or a whole selection —
 *      goes through the confirm modal and needs DELETE typed before the button enables.
 *
 * DEVIATION from the reference, deliberate: the reference's Class Name field is a free-text
 * <input> ("9th"). Here it is an app-dd of the standard class names this school has not
 * configured yet, because `class` is a NUMBER (200/201/202 being the Nursery/LKG/UKG
 * sentinels) that student.class and every other class-keyed collection joins on — free text
 * would break every one of those joins. Everything else on the page matches the reference.
 *
 * This is configuration, not a record of something that happened, so deletes are hard
 * deletes with no grace period. What makes a delete heavy is the students it strands —
 * counts come from the list response, so no confirmation costs an extra request.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassSuffixPipe } from 'src/app/pipes/class-suffix.pipe';
import { StreamTitleCasePipe } from 'src/app/pipes/stream-title-case.pipe';
import { ApiError, ApiErrorResponse } from 'src/app/shared/models/api-error.model';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ClassesSectionsService } from 'src/app/shared/services/academic-setup/classes-sections.service';
import {
  AcademicClass, ClassFormValue, ClassNameOption, ClassPayload, StreamDraft
} from 'src/app/shared/models/academic-setup/class.model';

/** One stream's worth of the Details modal: a heading and its section chips. */
interface DetailGroup {
  name: string;
  sections: string[];
}

/** One table row, fully precomputed: the template calls no functions and no pipes. */
interface ClassRow {
  _id: string;
  classNumber: number;
  /** "9th" — used in confirmations and the Details modal title. */
  className: string;
  /** The Fraunces numeral and its suffix, rendered as two spans per the reference. */
  classNum: string;
  classSuffix: string;
  studentCount: number;

  /** Streams cell: the clickable tag, or the "— not applicable" fallback. */
  showStreamTag: boolean;
  streamTagLabel: string;

  /** Sections cell: a slate tag with a real count, or a muted "Set per stream" tag. */
  sectionTagLabel: string;
  sectionTagMuted: boolean;

  /** Matched against the search box — on names the cells only ever show as a count. */
  searchText: string;

  source: AcademicClass;
}

const EMPTY_FORM: ClassFormValue = {
  id: null,
  class: null,
  hasStreams: false,
  sections: [],
  streams: []
};

const normalise = (name: string): string => (name || '').trim().toLowerCase();

/** The fields this modal renders a message slot for; anything else lands on formError. */
const KNOWN_FIELDS: readonly string[] = ['class', 'sections', 'streams'];

const countLabel = (count: number, noun: string): string =>
  count + ' ' + noun + (count === 1 ? '' : 's');

@Component({
  selector: 'app-classes-sections',
  templateUrl: './classes-sections.component.html',
  styleUrls: ['./classes-sections.component.css'],
  // Provided directly rather than through SharedPipeModule: the pipes are used here in
  // TypeScript to build the row view model, so the template stays free of pipe calls too.
  providers: [ClassSuffixPipe, StreamTitleCasePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClassesSectionsComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  search = '';

  /**
   * The academic session the shell header is showing. The class/stream/section STRUCTURE
   * does not belong to a session — a school runs 11th Science whichever year it is — but
   * the Students column beside it does, so switching the selector refetches and only those
   * numbers move.
   */
  session = '';

  /** Everything the server returned, and the filtered/paged view model the table renders. */
  private classes: AcademicClass[] = [];
  private filtered: ClassRow[] = [];
  rows: ClassRow[] = [];

  // Client-side paging: a school configures at most fifteen classes, so the whole list
  // arrives in one read and a round-trip per page would buy nothing. The bar itself is the
  // shared component either way.
  page = 1;
  limit = 10;
  get total(): number {
    return this.filtered.length;
  }

  /** Checked rows, by id. A Set, not an array scan — O(1) per row render. */
  selected = new Set<string>();

  /** The side card's four counts, recomputed with the list. */
  stats = { classes: 0, sections: 0, streams: 0, students: 0 };

  classOptions: ClassNameOption[] = [];
  classDdOptions: DdOption[] = [];
  formOpen = false;
  saving = false;
  formTitle = 'Add Class';
  form: ClassFormValue = { ...EMPTY_FORM };
  /** Field -> message, straight from a ValidationError's fields. */
  fieldErrors: Record<string, string> = {};
  /**
   * A rejection that names no field this modal renders (the validator's 'form' marker, or
   * a field the form has no slot for). Without somewhere to put it, a rejected save left
   * the modal sitting there looking like Submit had done nothing at all.
   */
  formError = '';

  /** Read-only Streams & Sections breakdown, opened from a cell's tag. */
  detailsOpen = false;
  detailsTitle = '';
  detailsGroups: DetailGroup[] = [];
  detailsSections: string[] = [];

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  /** Which action the open confirmation is gating. */
  private pending: 'delete' | 'save' | null = null;
  private deleteIds: string[] = [];

  private destroyed$ = new Subject<void>();

  constructor(
    private academicSetup: ClassesSectionsService,
    private adminAuthService: AdminAuthService,
    private shellContext: ShellContextService,
    private classSuffix: ClassSuffixPipe,
    private streamTitleCase: StreamTitleCasePipe,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Same source the legacy admin pages read it from: the id on the decoded access token.
    // The route is admin-only, so there is no teacher branch to consider.
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) {
      this.loading = false;
      return;
    }

    // The session the header is showing drives the fetch, so the first load and every
    // later switch go through one path. distinctUntilChanged is what stops the other
    // things the context emits (the school, a teacher's permissions) from refetching this
    // page for no reason.
    this.shellContext.context
      .pipe(
        map((context) => context.activeSession),
        distinctUntilChanged(),
        takeUntil(this.destroyed$)
      )
      .subscribe((session) => {
        this.session = session;
        this.fetchClasses();
      });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- list ---------------------------------------------------------------------------

  private fetchClasses(): void {
    this.loading = true;
    this.academicSetup.getClasses(this.adminId, this.session)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.classes = res || [];
        // A row that no longer exists must not stay selected and re-arm Delete Selected.
        const live = new Set(this.classes.map((item) => item._id));
        this.selected.forEach((id) => {
          if (!live.has(id)) this.selected.delete(id);
        });
        this.buildRows();
        this.buildStats();
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Rebuilt after every fetch and every keystroke. Filtering happens here rather than on
   * the server: a school configures at most fifteen classes, so a round-trip per keystroke
   * would buy nothing.
   */
  private buildRows(): void {
    const term = normalise(this.search);

    this.filtered = this.classes
      .map((item) => this.toRow(item))
      .filter((row) => !term || row.searchText.indexOf(term) !== -1);

    // Deleting or filtering the last row of the last page must not strand the view on a
    // page that no longer exists.
    const lastPage = Math.max(1, Math.ceil(this.filtered.length / this.limit));
    if (this.page > lastPage) this.page = lastPage;

    const start = (this.page - 1) * this.limit;
    this.rows = this.filtered.slice(start, start + this.limit);
  }

  private buildStats(): void {
    let sections = 0;
    let streams = 0;
    let students = 0;

    this.classes.forEach((item) => {
      students += item.studentCount || 0;
      if (item.hasStreams) {
        streams += (item.streams || []).length;
        // Sections under a streamed class still count as sections the school created.
        (item.streams || []).forEach((stream) => {
          sections += (stream.sections || []).length;
        });
      } else {
        sections += (item.sections || []).length;
      }
    });

    this.stats = { classes: this.classes.length, sections, streams, students };
  }

  private toRow(item: AcademicClass): ClassRow {
    const streamNames = (item.streams || []).map((stream) => this.streamTitleCase.transform(stream.name));
    const sectionNames = (item.sections || []).map((section) => section.name);
    const className = this.classSuffix.transform(item.class) || String(item.class);

    // The reference renders the numeral and its ordinal suffix as two spans at different
    // sizes. Nursery/LKG/UKG have no numeral, so they fall through as a whole word.
    const ordinal = /^(\d+)(st|nd|rd|th)$/.exec(className);

    return {
      _id: item._id,
      classNumber: item.class,
      className,
      classNum: ordinal ? ordinal[1] : className,
      classSuffix: ordinal ? ordinal[2] : '',
      studentCount: item.studentCount || 0,

      showStreamTag: item.hasStreams && streamNames.length > 0,
      streamTagLabel: countLabel(streamNames.length, 'stream'),

      // A streamed class keeps its sections per stream, so the cell says where to look
      // rather than showing a count that would mean nothing at this level.
      sectionTagLabel: item.hasStreams ? 'Set per stream' : countLabel(sectionNames.length, 'section'),
      sectionTagMuted: item.hasStreams,

      searchText: [className, ...streamNames, ...sectionNames].join(' ').toLowerCase(),

      source: item
    };
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.page = 1;
    this.buildRows();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.buildRows();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.page = 1;
    this.buildRows();
  }

  trackByRow = (_index: number, row: ClassRow): string => row._id;
  trackByIndex = (index: number): number => index;
  trackByName = (_index: number, name: string): string => name;
  trackByGroup = (_index: number, group: DetailGroup): string => group.name;

  // --- selection ------------------------------------------------------------------------

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  toggleRow(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  /** Select-all covers the rows currently VISIBLE, which is what the header checkbox sits on. */
  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row._id));
  }

  toggleAll(): void {
    const selectAll = !this.allSelected;
    this.rows.forEach((row) => {
      if (selectAll) this.selected.add(row._id);
      else this.selected.delete(row._id);
    });
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  // --- details modal --------------------------------------------------------------------

  showDetails(row: ClassRow): void {
    const item = row.source;

    if (item.hasStreams) {
      this.detailsTitle = 'Streams & Sections — ' + row.className;
      this.detailsGroups = (item.streams || []).map((stream) => ({
        name: this.streamTitleCase.transform(stream.name),
        sections: (stream.sections || []).map((section) => section.name)
      }));
      this.detailsSections = [];
    } else {
      this.detailsTitle = 'Sections — ' + row.className;
      this.detailsGroups = [];
      this.detailsSections = (item.sections || []).map((section) => section.name);
    }

    this.detailsOpen = true;
  }

  closeDetails(): void {
    this.detailsOpen = false;
  }

  // --- add / edit ---------------------------------------------------------------------

  onAddClass(): void {
    this.formTitle = 'Add Class';
    this.form = { ...EMPTY_FORM, sections: [], streams: [] };
    this.clearErrors();
    this.formOpen = true;
    this.loadClassOptions();
  }

  onEditClass(row: ClassRow): void {
    const item = row.source;
    this.formTitle = 'Edit Class';
    this.form = {
      id: item._id,
      class: item.class,
      hasStreams: item.hasStreams,
      sections: (item.sections || []).map((section) => section.name),
      streams: (item.streams || []).map((stream) => ({
        name: this.streamTitleCase.transform(stream.name),
        sections: (stream.sections || []).map((section) => section.name),
        // Carried into the draft so removing a stream can warn without another request.
        studentCount: stream.studentCount || 0
      }))
    };
    this.clearErrors();
    this.formOpen = true;
    // The dropdown is disabled in edit mode — the class number is the record's identity —
    // so the option list is not needed here.
    this.setClassOptions([{ class: item.class, label: row.className }]);
  }

  private loadClassOptions(): void {
    this.academicSetup.getClassNameOptions(this.adminId)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.setClassOptions(res || []);
        this.cdr.markForCheck();
      });
  }

  private setClassOptions(options: ClassNameOption[]): void {
    this.classOptions = options;
    // app-dd deals in strings; the class number is restored on selection.
    this.classDdOptions = options.map((option) => ({
      value: String(option.class),
      label: option.label
    }));
  }

  get classValue(): string {
    return this.form.class === null ? '' : String(this.form.class);
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  onClassSelected(value: string): void {
    this.form = { ...this.form, class: Number(value) };
    delete this.fieldErrors['class'];
  }

  /** The structural switch: each branch clears the other's data so neither can leak. */
  onStreamsToggled(hasStreams: boolean): void {
    this.form = hasStreams
      ? { ...this.form, hasStreams: true, sections: [] }
      : { ...this.form, hasStreams: false, streams: [] };
    this.clearErrors();
  }

  /** Submit stays disabled until a class is chosen — the reference gates on the name field. */
  get submitDisabled(): boolean {
    return this.saving || this.form.class === null;
  }

  // --- the class's own sections (streams off) -------------------------------------------

  addSection(): void {
    this.form = { ...this.form, sections: this.form.sections.concat(['']) };
  }

  updateSection(index: number, value: string): void {
    this.form = {
      ...this.form,
      sections: this.form.sections.map((name, position) => (position === index ? value : name))
    };
  }

  removeSection(index: number): void {
    this.form = {
      ...this.form,
      sections: this.form.sections.filter((_name, position) => position !== index)
    };
  }

  // --- streams, and each stream's own sections ------------------------------------------
  //
  // A stream is edited in place by index, so its sections and its student count stay
  // attached to it through a rename — the reason the drafts are the list, rather than a
  // separate array of names that would have to be reconciled back onto them.

  addStream(): void {
    const stream: StreamDraft = { name: '', sections: [], studentCount: 0 };
    this.form = { ...this.form, streams: this.form.streams.concat([stream]) };
  }

  updateStreamName(index: number, value: string): void {
    this.patchStream(index, (stream) => ({ ...stream, name: value }));
  }

  removeStream(index: number): void {
    this.form = {
      ...this.form,
      streams: this.form.streams.filter((_stream, position) => position !== index)
    };
  }

  addStreamSection(index: number): void {
    this.patchStream(index, (stream) => ({ ...stream, sections: stream.sections.concat(['']) }));
  }

  updateStreamSection(index: number, sectionIndex: number, value: string): void {
    this.patchStream(index, (stream) => ({
      ...stream,
      sections: stream.sections.map((name, position) => (position === sectionIndex ? value : name))
    }));
  }

  removeStreamSection(index: number, sectionIndex: number): void {
    this.patchStream(index, (stream) => ({
      ...stream,
      sections: stream.sections.filter((_name, position) => position !== sectionIndex)
    }));
  }

  private patchStream(index: number, change: (stream: StreamDraft) => StreamDraft): void {
    this.form = {
      ...this.form,
      streams: this.form.streams.map((stream, position) => (position === index ? change(stream) : stream))
    };
  }

  // --- submit -------------------------------------------------------------------------

  onFormSubmit(): void {
    if (this.saving) return;

    // Removing a stream is only destructive at Submit — until then the modal is a draft.
    const stranded = this.strandedStreams();
    if (stranded.total > 0) {
      this.pending = 'save';
      this.confirmConfig = {
        title: 'Remove ' + (stranded.names.length === 1 ? 'this stream' : 'these streams') + '?',
        message: stranded.names.join(', ') + ' will no longer exist on '
          + (this.classSuffix.transform(this.form.class as number) || 'this class') + '.',
        scopeNote: stranded.total + (stranded.total === 1 ? ' student is' : ' students are')
          + ' in ' + (stranded.names.length === 1 ? 'it' : 'them') + ' and will need reassigning.',
        confirmLabel: 'Save changes',
        cancelLabel: 'Keep editing',
        variant: 'warning',
        typeToConfirm: 'DELETE'
      };
      this.confirmOpen = true;
      return;
    }

    this.save();
  }

  /**
   * Which of the streams this class HAD are not in the pending save any more, and how many
   * students they hold. Turning the toggle off strands every one of them. A rename counts
   * as a removal, which is correct: student.stream joins on the name, so the students of
   * the old name are stranded either way.
   */
  private strandedStreams(): { names: string[]; total: number } {
    const original = this.classes.find((item) => item._id === this.form.id);
    if (!original || !original.hasStreams) return { names: [], total: 0 };

    const kept = new Set(
      this.form.hasStreams ? this.form.streams.map((stream) => normalise(stream.name)) : []
    );

    const dropped = (original.streams || [])
      .filter((stream) => !kept.has(normalise(stream.name)) && (stream.studentCount || 0) > 0);

    return {
      names: dropped.map((stream) => this.streamTitleCase.transform(stream.name)),
      total: dropped.reduce((sum, stream) => sum + (stream.studentCount || 0), 0)
    };
  }

  private clearErrors(): void {
    this.fieldErrors = {};
    this.formError = '';
  }

  private save(): void {
    this.saving = true;
    this.clearErrors();

    const payload: ClassPayload = {
      adminId: this.adminId,
      hasStreams: this.form.hasStreams,
      sections: this.form.hasStreams
        ? []
        : this.form.sections.filter((name) => name.trim()).map((name) => ({ name: name.trim() })),
      streams: this.form.hasStreams
        ? this.form.streams
            .filter((stream) => stream.name.trim())
            .map((stream) => ({
              name: stream.name.trim(),
              sections: stream.sections.filter((name) => name.trim()).map((name) => ({ name: name.trim() }))
            }))
        : []
    };

    // The class number is the identity, so only a create sends it; updateClassSchema
    // forbids it outright.
    const request = this.form.id
      ? this.academicSetup.updateClass(this.form.id, payload)
      : this.academicSetup.createClass({ ...payload, class: this.form.class as number });

    request.pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.saving = false;
      this.formOpen = false;
      this.fetchClasses();
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.saving = false;
      // Every other category is already shaped and surfaced by ErrorInterceptor; only
      // ValidationError is left to the page, so its fields can land beside the inputs.
      this.bindFieldErrors(error);
      this.cdr.markForCheck();
    });
  }

  /**
   * ErrorInterceptor rethrows the SHAPED ApiError, not the HttpErrorResponse it arrived in
   * — by then every other category has been toasted and only ValidationError is left to
   * the page. Reading error.error here (the raw-response shape) therefore found nothing:
   * a rejected save bound no message, raised no toast, and left the modal open looking
   * like Submit had done nothing.
   *
   * Both shapes are accepted — the interceptor's, and the raw HttpErrorResponse a call
   * that bypasses it delivers.
   */
  private bindFieldErrors(error: unknown): void {
    const apiError = this.toApiError(error);
    if (apiError?.category !== 'ValidationError') return;

    const errors: Record<string, string> = {};
    let formError = '';
    (apiError.fields || []).forEach((field) => {
      if (KNOWN_FIELDS.indexOf(field.field) === -1) formError = formError || field.message;
      else errors[field.field] = field.message;
    });

    this.fieldErrors = errors;
    // Something was rejected, so the modal always says so somewhere — even when the field
    // it names is not one this form renders.
    this.formError = formError || (Object.keys(errors).length ? '' : apiError.message);
  }

  private toApiError(error: unknown): ApiError | undefined {
    const candidate = error as (ApiError & Partial<HttpErrorResponse>) | undefined;
    if (candidate && candidate.category) return candidate as ApiError;
    return (candidate?.error as ApiErrorResponse | undefined)?.error;
  }

  // --- delete -------------------------------------------------------------------------

  /** The row's own trash icon — one class, same confirmation as a selection of one. */
  onDeleteClass(row: ClassRow): void {
    this.openDeleteConfirm([row._id]);
  }

  /** "Delete Selected" — whatever is checked, in one request. */
  onDeleteSelected(): void {
    if (!this.selected.size) return;
    this.openDeleteConfirm(Array.from(this.selected));
  }

  private openDeleteConfirm(ids: string[]): void {
    this.pending = 'delete';
    this.deleteIds = ids;

    const chosen = this.classes.filter((item) => ids.indexOf(item._id) !== -1);
    const students = chosen.reduce((sum, item) => sum + (item.studentCount || 0), 0);

    this.confirmConfig = {
      title: 'Delete ' + ids.length + (ids.length === 1 ? ' class?' : ' classes?'),
      message: "This can't be undone. All sections and stream configuration under the "
        + (ids.length === 1 ? 'selected class' : 'selected classes') + ' will be removed.',
      // Real dependent data, from the list response — the confirmation costs no extra request.
      scopeNote: students > 0
        ? students + (students === 1 ? ' student is' : ' students are') + ' enrolled and will need reassigning.'
        : undefined,
      confirmLabel: 'Delete',
      variant: 'warning',
      // Every destructive action on this page types DELETE — classes-sections.md calls this
      // "the pattern for any destructive action in this app".
      typeToConfirm: 'DELETE'
    };

    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const action = this.pending;
    this.pending = null;

    if (action === 'save') {
      this.save();
      return;
    }

    const ids = this.deleteIds;
    this.deleteIds = [];
    if (!ids.length) return;

    this.academicSetup.bulkDelete(this.adminId, ids, true)
      .pipe(takeUntil(this.destroyed$))
      .subscribe(() => {
        ids.forEach((id) => this.selected.delete(id));
        this.fetchClasses();
      });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.pending = null;
    this.deleteIds = [];
  }
}
