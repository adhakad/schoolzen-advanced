/**
 * Subject Groups — one named bundle of subjects per class, or per stream where streams
 * apply. A student picks one group and that decides their whole subject set for the year.
 *
 * Reference: docs/schoolzen-planning/v1/academic-setup/subject-groups.html
 *
 * TWO toolbar rows here, unlike its two siblings: row 1 is search + the buttons, row 2 is
 * the Class and Stream filters. That is this page's own shape, taken from its own .html —
 * design-system.md is explicit that a page's row-split is never copied from another page.
 *
 * Two behaviours this page exists to get right:
 *
 *   1. The Stream control is a DEPENDENT filter, not a conditional one. It is always in the
 *      DOM and merely disabled until a class is chosen — a pill that disappears changes the
 *      toolbar's shape, which is a bug that has been caught here before. Its hint says why
 *      it is disabled: "Select a class first", or "This class has no streams" once a
 *      streamless class is chosen.
 *   2. The modal's subject checklist is LIVE. Form options are re-fetched every time the
 *      modal opens, so a subject renamed or deactivated on the Subjects page shows through
 *      immediately. subject-groups.md: "this checklist must always reflect the current
 *      Subjects list, never a stale copy."
 *
 * The rows' Class, Stream and subject names are resolved in the backend's own aggregation.
 * This page never fetches classes and subjects separately to join them in the browser —
 * that was a confirmed real anti-pattern in the legacy codebase.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject as RxSubject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassSuffixPipe } from 'src/app/pipes/class-suffix.pipe';
import { StreamTitleCasePipe } from 'src/app/pipes/stream-title-case.pipe';
import { ApiError, ApiErrorResponse } from 'src/app/shared/models/api-error.model';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { SubjectGroupsService } from 'src/app/shared/services/academic-setup/subject-groups.service';
import {
  FormOptionClass, SubjectGroup, SubjectGroupFormOptions, SubjectGroupFormValue,
  SubjectGroupPayload, SubjectGroupSubject, SubjectGroupSummary
} from 'src/app/shared/models/academic-setup/subject-group.model';

/** One table row, fully precomputed: the template calls no functions and no pipes. */
interface GroupRow {
  _id: string;
  name: string;
  /** "9th" — the class column, and the text confirmations use. */
  className: string;
  /** "Science", or null for a class with no streams (the "— not applicable" cell). */
  streamName: string | null;
  subjects: SubjectGroupSubject[];
  source: SubjectGroup;
}

const ALL_CLASSES: DdOption = { value: '', label: 'All classes' };
const ALL_STREAMS: DdOption = { value: '', label: 'All streams' };
const NO_SELECTION: DdOption = { value: '', label: '— Select —' };

const EMPTY_FORM: SubjectGroupFormValue = {
  id: null,
  classId: '',
  streamId: '',
  name: '',
  subjectIds: new Set<string>()
};

/** The fields this modal renders a message slot for; anything else lands on formError. */
const KNOWN_FIELDS: readonly string[] = ['classId', 'streamId', 'name', 'subjectIds'];

@Component({
  selector: 'app-subject-groups',
  templateUrl: './subject-groups.component.html',
  styleUrls: ['./subject-groups.component.css'],
  // Provided directly rather than through SharedPipeModule: the pipes are used here in
  // TypeScript to build the row view model, so the template stays free of pipe calls too.
  providers: [ClassSuffixPipe, StreamTitleCasePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubjectGroupsComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  search = '';

  rows: GroupRow[] = [];
  page = 1;
  limit = 10;
  total = 0;
  summary: SubjectGroupSummary = { total: 0, classesCovered: 0, streamsCovered: 0 };

  /** Checked rows, by id. A Set, not an array scan — O(1) per row render. */
  selected = new Set<string>();

  // --- toolbar filters ---
  filterClassId = '';
  filterStreamId = '';
  classFilterOptions: DdOption[] = [ALL_CLASSES];
  streamFilterOptions: DdOption[] = [ALL_STREAMS];

  // --- form ---
  formOpen = false;
  saving = false;
  formTitle = 'Add Subject Group';
  form: SubjectGroupFormValue = { ...EMPTY_FORM, subjectIds: new Set<string>() };
  formClassOptions: DdOption[] = [NO_SELECTION];
  formStreamOptions: DdOption[] = [NO_SELECTION];
  /** The live checklist, re-fetched every time the modal opens. */
  subjectChecklist: SubjectGroupSubject[] = [];
  fieldErrors: Record<string, string> = {};
  formError = '';

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteIds: string[] = [];

  /** Classes with their streams, keyed by id — an O(1) lookup, never an array scan. */
  private classesById = new Map<string, FormOptionClass>();

  private searchInput$ = new RxSubject<string>();
  private destroyed$ = new RxSubject<void>();

  constructor(
    private subjectGroupsService: SubjectGroupsService,
    private adminAuthService: AdminAuthService,
    private classSuffix: ClassSuffixPipe,
    private streamTitleCase: StreamTitleCasePipe,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) {
      this.loading = false;
      return;
    }

    this.searchInput$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroyed$))
      .subscribe((value) => {
        this.search = value;
        this.page = 1;
        this.fetchGroups();
      });

    this.loadFormOptions();
    this.fetchGroups();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- options ---------------------------------------------------------------------------

  /**
   * One call feeds BOTH the toolbar's filters and the modal's inputs. Called on load and
   * again each time the modal opens, which is what keeps the subject checklist live.
   */
  private loadFormOptions(after?: () => void): void {
    this.subjectGroupsService.getFormOptions(this.adminId)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((options: SubjectGroupFormOptions) => {
        this.classesById = new Map(options.classes.map((item) => [item._id, item]));

        const classOptions = options.classes.map((item) => ({
          value: item._id,
          label: item.label || this.classSuffix.transform(item.class) || String(item.class)
        }));
        this.classFilterOptions = [ALL_CLASSES, ...classOptions];
        this.formClassOptions = [NO_SELECTION, ...classOptions];

        this.subjectChecklist = options.subjects || [];

        this.syncFilterStreamOptions();
        this.syncFormStreamOptions();

        if (after) after();
        this.cdr.markForCheck();
      });
  }

  private streamOptionsFor(classId: string, leading: DdOption): DdOption[] {
    const chosen = this.classesById.get(classId);
    if (!chosen) return [leading];
    return [
      leading,
      ...chosen.streams.map((stream) => ({
        value: stream._id,
        label: this.streamTitleCase.transform(stream.name)
      }))
    ];
  }

  private syncFilterStreamOptions(): void {
    this.streamFilterOptions = this.streamOptionsFor(this.filterClassId, ALL_STREAMS);
  }

  private syncFormStreamOptions(): void {
    this.formStreamOptions = this.streamOptionsFor(this.form.classId, NO_SELECTION);
  }

  // --- toolbar ---------------------------------------------------------------------------

  /**
   * The Stream filter is disabled, never hidden: a class has to be chosen first, and a
   * class with no streams has nothing to offer. Both states keep the pill in the toolbar.
   */
  get filterStreamDisabled(): boolean {
    const chosen = this.classesById.get(this.filterClassId);
    return !chosen || !chosen.hasStreams || chosen.streams.length === 0;
  }

  get filterStreamHint(): string {
    if (!this.filterClassId) return 'Select a class first';
    const chosen = this.classesById.get(this.filterClassId);
    return chosen && !chosen.hasStreams ? 'No streams' : 'All streams';
  }

  onFilterClassChange(value: string): void {
    this.filterClassId = value;
    // A stream from the previous class means nothing under the new one.
    this.filterStreamId = '';
    this.syncFilterStreamOptions();
    this.page = 1;
    this.fetchGroups();
  }

  onFilterStreamChange(value: string): void {
    this.filterStreamId = value;
    this.page = 1;
    this.fetchGroups();
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value);
  }

  // --- list ---------------------------------------------------------------------------

  private fetchGroups(): void {
    this.loading = true;
    this.subjectGroupsService
      .getSubjectGroups(this.adminId, {
        classId: this.filterClassId,
        streamId: this.filterStreamId,
        search: this.search,
        page: this.page,
        limit: this.limit
      })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = (res.rows || []).map((row) => this.toRow(row));
        this.total = res.total || 0;
        this.summary = res.summary;
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  private toRow(row: SubjectGroup): GroupRow {
    return {
      _id: row._id,
      name: row.name,
      className: this.classSuffix.transform(row.class) || String(row.class),
      streamName: row.streamName ? this.streamTitleCase.transform(row.streamName) : null,
      subjects: row.subjects || [],
      source: row
    };
  }

  onPageChange(page: number): void {
    this.page = page;
    this.fetchGroups();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.page = 1;
    this.fetchGroups();
  }

  trackByRow = (_index: number, row: GroupRow): string => row._id;
  trackBySubject = (_index: number, subject: SubjectGroupSubject): string => subject._id;

  // --- selection ------------------------------------------------------------------------

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  toggleRow(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

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

  // --- add / edit ---------------------------------------------------------------------

  onAddGroup(): void {
    this.formTitle = 'Add Subject Group';
    this.form = { ...EMPTY_FORM, subjectIds: new Set<string>() };
    this.clearErrors();
    this.formOpen = true;
    // Re-read the options so the checklist reflects the Subjects list as it is NOW.
    this.loadFormOptions(() => this.syncFormStreamOptions());
  }

  onEditGroup(row: GroupRow): void {
    const item = row.source;
    this.formTitle = 'Edit Subject Group';
    this.form = {
      id: item._id,
      classId: item.classId,
      streamId: item.streamId || '',
      name: item.name,
      subjectIds: new Set(item.subjects.map((subject) => subject._id))
    };
    this.clearErrors();
    this.formOpen = true;
    this.loadFormOptions(() => this.syncFormStreamOptions());
  }

  onFormClassChange(value: string): void {
    // A stream belongs to one class, so changing the class clears it rather than carrying
    // over an id that now points into a different class's streams[].
    this.form = { ...this.form, classId: value, streamId: '' };
    this.syncFormStreamOptions();
    delete this.fieldErrors['classId'];
    delete this.fieldErrors['streamId'];
  }

  onFormStreamChange(value: string): void {
    this.form = { ...this.form, streamId: value };
    delete this.fieldErrors['streamId'];
  }

  onFormNameChange(value: string): void {
    this.form = { ...this.form, name: value };
    delete this.fieldErrors['name'];
  }

  isChecked(subjectId: string): boolean {
    return this.form.subjectIds.has(subjectId);
  }

  toggleSubject(subjectId: string): void {
    // The Set is mutated in place and the form object replaced, so OnPush still sees a
    // change without rebuilding the Set on every click.
    if (this.form.subjectIds.has(subjectId)) this.form.subjectIds.delete(subjectId);
    else this.form.subjectIds.add(subjectId);
    this.form = { ...this.form };
    delete this.fieldErrors['subjectIds'];
  }

  /** Stream is disabled until a class is chosen, and for a class that has no streams. */
  get formStreamDisabled(): boolean {
    const chosen = this.classesById.get(this.form.classId);
    return !chosen || !chosen.hasStreams || chosen.streams.length === 0;
  }

  get formStreamHint(): string {
    if (!this.form.classId) return 'Select a class first';
    const chosen = this.classesById.get(this.form.classId);
    return chosen && !chosen.hasStreams ? 'This class has no streams — leave as-is' : '';
  }

  /** Class and Group Name are the two required fields; the reference gates Submit on them. */
  get submitDisabled(): boolean {
    return this.saving || !this.form.classId || !this.form.name.trim();
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  onFormSubmit(): void {
    if (this.submitDisabled) return;

    this.saving = true;
    this.clearErrors();

    const payload: SubjectGroupPayload = {
      adminId: this.adminId,
      classId: this.form.classId,
      // null, not absent — the two cases must never be confused with a dropped field.
      streamId: this.form.streamId || null,
      name: this.form.name.trim(),
      subjectIds: Array.from(this.form.subjectIds)
    };

    const request = this.form.id
      ? this.subjectGroupsService.updateSubjectGroup(this.form.id, payload)
      : this.subjectGroupsService.createSubjectGroup(payload);

    request.pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.saving = false;
      this.formOpen = false;
      this.fetchGroups();
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.saving = false;
      this.bindFieldErrors(error);
      this.cdr.markForCheck();
    });
  }

  private clearErrors(): void {
    this.fieldErrors = {};
    this.formError = '';
  }

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
    this.formError = formError || (Object.keys(errors).length ? '' : apiError.message);
  }

  private toApiError(error: unknown): ApiError | undefined {
    const candidate = error as (ApiError & Partial<HttpErrorResponse>) | undefined;
    if (candidate && candidate.category) return candidate as ApiError;
    return (candidate?.error as ApiErrorResponse | undefined)?.error;
  }

  // --- delete -------------------------------------------------------------------------

  onDeleteGroup(row: GroupRow): void {
    this.openDeleteConfirm([row._id]);
  }

  onDeleteSelected(): void {
    if (!this.selected.size) return;
    this.openDeleteConfirm(Array.from(this.selected));
  }

  private openDeleteConfirm(ids: string[]): void {
    this.deleteIds = ids;
    this.confirmConfig = {
      title: 'Delete ' + ids.length + (ids.length === 1 ? ' group?' : ' groups?'),
      message: "This can't be undone. Students currently on this group will need to be reassigned.",
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE'
    };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const ids = this.deleteIds;
    this.deleteIds = [];
    if (!ids.length) return;

    this.subjectGroupsService.bulkDelete(this.adminId, ids, true)
      .pipe(takeUntil(this.destroyed$))
      .subscribe(() => {
        ids.forEach((id) => this.selected.delete(id));
        this.fetchGroups();
      });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteIds = [];
  }
}
