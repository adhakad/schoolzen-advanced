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
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassSuffixPipe } from 'src/app/pipes/class-suffix.pipe';
import { StreamTitleCasePipe } from 'src/app/pipes/stream-title-case.pipe';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { SubjectGroupsService } from 'src/app/shared/services/academic-setup/subject-groups.service';
import {
  FormOptionClass, SubjectGroup, SubjectGroupFormOptions, SubjectGroupFormValue,
  SubjectGroupPayload, SubjectGroupSubject, SubjectGroupSummary
} from 'src/app/shared/models/academic-setup/subject-group.model';
import { BulkDeleteResult, BulkOutcomeLine } from 'src/app/shared/models/academic-setup/bulk-delete.model';
import { bulkDeleteOutcome, countOf } from 'src/app/shared/utils/academic-setup-bulk-delete.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { inlineFormErrors } from 'src/app/shared/utils/academic-setup-errors.util';

/** What blocks a group's delete, from the count the list already carries. */
const placedMessage = (count: number): string =>
  countOf(count, 'student') + (count === 1 ? ' is' : ' are') + ' placed in this group — reassign them first.';

/** One table row, fully precomputed: the template calls no functions and no pipes. */
interface GroupRow {
  _id: string;
  name: string;
  /** "9th" — the class column, and the text confirmations use. */
  className: string;
  /** "Science", or null for a class with no streams (the "— not applicable" cell). */
  streamName: string | null;
  subjects: SubjectGroupSubject[];
  /**
   * The automatic "General" group: Edit opens the modal with Name/Class locked (its subject
   * checklist stays editable); Delete is shown but disabled; not selectable.
   */
  isSystemGroup: boolean;
  /** Students placed in this group — what blocks its delete, known before the attempt. */
  blockingCount: number;
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
  /** A failed list fetch — rendered distinctly from a genuinely empty result, with a retry. */
  loadError = '';
  search = '';

  rows: GroupRow[] = [];
  /** Every row seen on any page, by id — a selection's names/counts outlive paging. */
  private known = new Map<string, GroupRow>();
  page = 1;
  limit = 10;
  total = 0;
  summary: SubjectGroupSummary = { total: 0, classesCovered: 0, streamsCovered: 0 };
  /** "11th Arts, 12th Commerce" — streams with zero groups; '' hides the warning strip. */
  noGroupStreams = '';

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
  /**
   * Editing an automatic "General" group: Name, Class and Stream are locked (the backend
   * refuses a rename or move with SYSTEM_GROUP_LOCKED); only the subject checklist changes.
   */
  formSystemGroup = false;
  formStreamOptions: DdOption[] = [NO_SELECTION];
  /** The live checklist, re-fetched every time the modal opens. */
  subjectChecklist: SubjectGroupSubject[] = [];
  /**
   * The edited group's own current subjects. Merged into the checklist so one the live list
   * no longer offers (deactivated since) still shows ticked and can be unticked — the edit
   * round-trips exactly what the group holds.
   */
  private editingSubjects: SubjectGroupSubject[] = [];
  /** A failed form-options fetch: the Class/Stream/Subject inputs say so, with a retry. */
  optionsError = '';
  optionsLoading = false;
  fieldErrors: Record<string, string> = {};
  formError = '';
  /** One Idempotency-Key per modal-open, reused by every retry of that same submission. */
  private formKey = '';

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteIds: string[] = [];
  /** Double-submit guard for the delete itself. */
  deleting = false;

  /** Per-row outcome of a delete that did not remove every requested row. */
  bulkResultOpen = false;
  bulkResultSummary = '';
  bulkResultLines: BulkOutcomeLine[] = [];

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
    this.optionsError = '';
    this.optionsLoading = true;
    this.subjectGroupsService.getFormOptions(this.adminId)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((options: SubjectGroupFormOptions) => {
        this.optionsLoading = false;
        const classes = options.classes || [];
        this.classesById = new Map(classes.map((item) => [item._id, item]));

        const classOptions = classes.map((item) => ({
          value: item._id,
          label: item.label || this.classSuffix.transform(item.class) || String(item.class)
        }));
        this.classFilterOptions = [ALL_CLASSES, ...classOptions];
        // The Add/Edit modal only offers STREAMED classes: a class without streams has its
        // automatic "General" group and nothing to add here (subject-groups.md). Editing that
        // General group still has to SHOW its (non-streamed) class, read-only.
        this.formClassOptions = [NO_SELECTION, ...classOptions.filter((option) =>
          this.classesById.get(option.value)?.hasStreams ||
          (this.formSystemGroup && option.value === this.form.classId))];

        const live = options.subjects || [];
        const liveIds = new Set(live.map((subject) => subject._id));
        this.subjectChecklist = live.concat(this.editingSubjects.filter((subject) => !liveIds.has(subject._id)));

        this.syncFilterStreamOptions();
        this.syncFormStreamOptions();

        if (after) after();
        this.cdr.markForCheck();
      }, () => {
        // Never a silently empty Class dropdown or subject checklist: say it failed.
        this.optionsLoading = false;
        this.optionsError = "Couldn't load classes and subjects.";
        this.cdr.markForCheck();
      });
  }

  retryOptions(): void {
    this.loadFormOptions(() => this.syncFormStreamOptions());
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
    this.loadError = '';
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
        this.rows.forEach((row) => this.known.set(row._id, row));
        this.total = res.total || 0;
        this.summary = res.summary || this.summary;
        this.noGroupStreams = ((res.summary && res.summary.streamsWithoutGroups) || [])
          .map((stream) => stream.label + ' ' + this.streamTitleCase.transform(stream.streamName))
          .join(', ');
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        // Not the empty state: the table says the load FAILED and offers a retry.
        this.rows = [];
        this.loadError = "Couldn't load subject groups.";
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  retryList(): void {
    this.fetchGroups();
  }

  private toRow(row: SubjectGroup): GroupRow {
    return {
      _id: row._id,
      name: row.name,
      className: this.classSuffix.transform(row.class) || String(row.class),
      streamName: row.streamName ? this.streamTitleCase.transform(row.streamName) : null,
      subjects: row.subjects || [],
      isSystemGroup: Boolean(row.isSystemGroup),
      blockingCount: row.blockingCount || 0,
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
    if (this.rows.some((row) => row._id === id && row.isSystemGroup)) return;
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  /** Select-all covers the selectable rows — never an automatic "General" group. */
  private get selectableRows(): GroupRow[] {
    return this.rows.filter((row) => !row.isSystemGroup);
  }

  get allSelected(): boolean {
    const selectable = this.selectableRows;
    return selectable.length > 0 && selectable.every((row) => this.selected.has(row._id));
  }

  toggleAll(): void {
    const selectAll = !this.allSelected;
    this.selectableRows.forEach((row) => {
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
    this.formSystemGroup = false;
    this.form = { ...EMPTY_FORM, subjectIds: new Set<string>() };
    this.editingSubjects = [];
    this.clearErrors();
    this.saving = false;
    this.formKey = newIdempotencyKey();
    this.formOpen = true;
    // Re-read the options so the checklist reflects the Subjects list as it is NOW.
    this.loadFormOptions(() => this.syncFormStreamOptions());
  }

  onEditGroup(row: GroupRow): void {
    const item = row.source;
    this.formTitle = 'Edit Subject Group';
    this.formSystemGroup = row.isSystemGroup;
    this.form = {
      id: item._id,
      classId: item.classId,
      streamId: item.streamId || '',
      name: item.name,
      // Pre-populated from the group's CURRENT subjects; Submit sends this whole Set back
      // and the server replaces the group's list with it — both halves of the round-trip.
      subjectIds: new Set((item.subjects || []).map((subject) => subject._id))
    };
    this.editingSubjects = item.subjects || [];
    this.clearErrors();
    this.saving = false;
    this.formKey = newIdempotencyKey();
    this.formOpen = true;
    this.loadFormOptions(() => this.syncFormStreamOptions());
  }

  onFormClassChange(value: string): void {
    if (this.formSystemGroup) return;
    // A stream belongs to one class, so changing the class clears it rather than carrying
    // over an id that now points into a different class's streams[].
    this.form = { ...this.form, classId: value, streamId: '' };
    this.syncFormStreamOptions();
    delete this.fieldErrors['classId'];
    delete this.fieldErrors['streamId'];
  }

  onFormStreamChange(value: string): void {
    if (this.formSystemGroup) return;
    this.form = { ...this.form, streamId: value };
    delete this.fieldErrors['streamId'];
  }

  onFormNameChange(value: string): void {
    if (this.formSystemGroup) return;
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
    if (this.formSystemGroup) return '— not applicable';
    if (!this.form.classId) return 'Select a class first';
    const chosen = this.classesById.get(this.form.classId);
    return chosen && !chosen.hasStreams ? 'This class has no streams — leave as-is' : '';
  }

  /** Class and Group Name are the two required fields; the reference gates Submit on them. */
  get submitDisabled(): boolean {
    // A failed options fetch means the class list / checklist can't be trusted: no save.
    return this.saving || !!this.optionsError || !this.form.classId || !this.form.name.trim();
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
      ? this.subjectGroupsService.updateSubjectGroup(this.form.id, payload, this.formKey)
      : this.subjectGroupsService.createSubjectGroup(payload, this.formKey);

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

  /** ValidationError, and a field-naming ConflictError (SUBJECT_GROUP_DUPLICATE), land inline. */
  private bindFieldErrors(error: unknown): void {
    const inline = inlineFormErrors(error, KNOWN_FIELDS);
    if (!inline) return;
    this.fieldErrors = inline.fields;
    this.formError = inline.formError;
  }

  // --- delete -------------------------------------------------------------------------

  onDeleteGroup(row: GroupRow): void {
    // Only its Class's delete removes a "General" group; the button is disabled anyway.
    if (row.isSystemGroup) return;
    this.openDeleteConfirm([row._id]);
  }

  onDeleteSelected(): void {
    if (!this.selected.size) return;
    this.openDeleteConfirm(Array.from(this.selected));
  }

  private labelOf(id: string): string {
    const row = this.known.get(id);
    return row ? row.name + ' (' + row.className + (row.streamName ? ' ' + row.streamName : '') + ')' : 'Subject group';
  }

  /**
   * The blocking count (students placed in the group) comes from the list response, so the
   * confirmation says what will be refused BEFORE the attempt.
   */
  private openDeleteConfirm(ids: string[]): void {
    this.deleteIds = ids;
    const blocked = ids.filter((id) => (this.known.get(id)?.blockingCount || 0) > 0);
    const allBlocked = blocked.length > 0 && blocked.length === ids.length;

    let scopeNote: string | undefined;
    if (ids.length === 1 && blocked.length === 1) {
      scopeNote = placedMessage(this.known.get(ids[0])?.blockingCount || 0);
    } else if (blocked.length) {
      scopeNote = blocked.length + ' of ' + ids.length + ' selected have students placed in them and will not be deleted: '
        + blocked.map((id) => this.labelOf(id)).join(', ') + '.';
    }

    this.confirmConfig = {
      title: 'Delete ' + ids.length + (ids.length === 1 ? ' group?' : ' groups?'),
      message: allBlocked
        ? (ids.length === 1 ? 'This group is in use and cannot be deleted.' : 'Every selected group is in use — none can be deleted.')
        : "This can't be undone.",
      scopeNote,
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE',
      blocked: allBlocked
    };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const ids = this.deleteIds;
    this.deleteIds = [];
    if (!ids.length || this.deleting) return;
    this.deleting = true;

    this.subjectGroupsService.bulkDelete(this.adminId, ids, true)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.deleting = false;
        const outcome = bulkDeleteOutcome(ids, res, (id) => this.labelOf(id),
          (result: BulkDeleteResult) => placedMessage(result.blockingCount || 0));
        outcome.deletedIds.forEach((id) => {
          this.selected.delete(id);
          this.known.delete(id);
        });
        if (outcome.hasDetails) this.showBulkResult(outcome.summary, outcome.lines);
        this.fetchGroups();
      }, () => {
        // ErrorInterceptor has already said what went wrong; the selection is kept.
        this.deleting = false;
        this.cdr.markForCheck();
      });
  }

  private showBulkResult(summary: string, lines: BulkOutcomeLine[]): void {
    this.bulkResultSummary = summary;
    this.bulkResultLines = lines;
    this.bulkResultOpen = true;
    this.cdr.markForCheck();
  }

  closeBulkResult(): void {
    this.bulkResultOpen = false;
  }

  trackByOutcome = (_index: number, line: BulkOutcomeLine): string => line.id;

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteIds = [];
  }
}
