/**
 * Manage Students — every enrolled student in the session; the Class → Stream → Group →
 * Section filters only NARROW, they never gate (manage-students.md).
 *
 * Reference: docs/schoolzen-planning/v1/student/manage-students.html
 *
 * Rules this page exists to honour, all easy to undo by accident:
 *   1. No filter = all students. The one exception is Excel Import/Export, whose button stays
 *      disabled until a Class (+Stream for a streamed class) is picked, and whose modal
 *      states that scope.
 *   2. Placement is session-scoped (StudentEnrollment), so the list, the form and the tags
 *      are all read for the session the shell header is showing.
 *   3. Nothing destructive or device-touching fires on a click: Delete types DELETE,
 *      Resync confirms, Assign & Sync waits for the server before closing.
 *   4. The list pages by KEYSET (a cursor stack), never by offset — this is the app's
 *      largest list (performance-principles.md).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ManageStudentsService } from 'src/app/shared/services/student/manage-students.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import {
  CascadeFilterValue, EMPTY_CASCADE, FieldConfigResponse, StudentDetail, StudentFilterOptions, StudentListResponse,
  StudentListRow
} from 'src/app/shared/models/student/student.model';
import {
  DeviceSyncResult, ImportResult, ImportRowError, ListQuery, ManageStudentsOverview, VERIFY_MODE_OPTIONS
} from 'src/app/shared/models/student/manage-students.model';
import {
  describeClassScope, isClassScopeComplete
} from 'src/app/shared/components/class-cascade-filter/class-cascade-filter.component';
import { StudentFormComponent, StudentFormMode } from 'src/app/shared/components/student-form/student-form.component';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';
import { errorMessageOf, rowErrorsOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { PHOTO_ACCEPT, photoFileError } from 'src/app/shared/utils/photo-file.util';
import { saveMessage } from 'src/app/shared/utils/save-message.util';
import { compareText, DEFAULT_TEXT_CASE, SortDir, TextCase } from 'src/app/shared/utils/text-case.util';

/**
 * The only columns this table renders — sent as `?fields=` so the server projects just these
 * (student/optimization.md, field projection).
 */
export const MANAGE_STUDENTS_FIELDS = 'name,admissionNo,status,photo,father,mother,contact,card';

/** One line of the bulk-result panel: which record, and what happened to it. */
interface BulkResultLine {
  /** The record's id — the list's trackBy key. */
  key: string;
  label: string;
  message: string;
}

/** One table row, precomputed so the template calls no functions per cell. */
interface StudentRow extends StudentListRow {
  initials: string;
  gradient: string;
  /** "•• 8821" — the Card column's default (manage-students.md); null when no card. */
  cardMasked: string | null;
}

/** Card column is masked by default — a UI-consistency choice, not a masking-law one. */
const maskCard = (card: string | null): string | null => (card ? '•• ' + card.slice(-4) : null);

/**
 * The header controls' final spec (manage-students.md): a sort arrow on Admission No.,
 * Student and Roll No.; the "Aa" text-case trigger on Student only. Father and Mother are
 * plain header text with neither control — they follow the case only through the Student
 * menu's "Apply to all fields".
 */
export type SortColumn = 'admissionNo' | 'name' | 'rollNumber';

/** Numbers ascending/descending, blanks (a Pending admission's number, no roll) always last. */
const compareNumber = (a: number | null, b: number | null, dir: SortDir): number => {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return dir === 'asc' ? a - b : b - a;
};

const toRow = (row: StudentListRow): StudentRow => ({
  ...row, initials: initialsOf(row.name), gradient: avatarGradient(row.studentId), cardMasked: maskCard(row.card)
});

@Component({
  selector: 'app-manage-students',
  templateUrl: './manage-students.component.html',
  styleUrls: ['./manage-students.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageStudentsComponent implements OnInit, OnDestroy {
  @ViewChild(StudentFormComponent) studentForm?: StudentFormComponent;

  adminId = '';
  session = '';
  loading = true;
  /** A failed list fetch — rendered distinctly from a genuinely empty result. */
  loadError = '';

  filterOptions: StudentFilterOptions | null = null;
  fieldConfig: FieldConfigResponse | null = null;
  /**
   * A failed class/field-config fetch. Every dropdown-feeding fetch has an error state
   * (student/errors.md): without one, a failure leaves the filters silently empty.
   */
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';
  private search$ = new Subject<string>();

  rows: StudentRow[] = [];
  total = 0;
  page = 1;
  limit = 10;
  /** cursors[i] = the cursor that fetches page i+1 (page 1's is null). Keyset, not offset. */
  private cursors: (string | null)[] = [null];
  private nextCursor: string | null = null;

  /** Checked rows by studentId — kept across pages so a bulk card list can span them. */
  selected = new Map<string, StudentListRow>();
  /**
   * Rows with a per-row action (resync, delete) in flight, by studentId — keyed per row,
   * never one page-level flag that would block or ignore a click on a different row.
   */
  busyRows = new Set<string>();
  /**
   * The Card column's ONE header toggle (manage-students.md): false = every row masked
   * ("•• 8821", the page-load state), true = every row in full. Display only — no API
   * call, and unlike Aadhar/bank/PEN, showing a card isn't logged.
   */
  cardsRevealed = false;
  overview: ManageStudentsOverview = { totalStudents: 0, cardsAssigned: 0 };

  /**
   * The Student column's DISPLAY case — Title Case on page load, never saved, never sent
   * anywhere, never part of Excel export/import.
   */
  nameCase: TextCase = DEFAULT_TEXT_CASE;
  /**
   * Father/Mother's display case: null = exactly as stored (page load). They have no "Aa"
   * of their own — only the Student menu's "Apply to all fields" sets this; a direct pick
   * there re-cases Student alone. Same rules as nameCase: never saved, never exported.
   */
  parentCase: TextCase | null = null;
  /**
   * Header sort (Ascending ↔ Descending), applied to the rows on screen. null = the list's
   * own order until a header is clicked. The list pages by keyset, so this orders the loaded
   * page; it is kept across page turns and re-applied to every page that arrives.
   */
  sortColumn: SortColumn | null = null;
  sortDir: SortDir = 'asc';

  /** The row whose avatar opened the photo picker — the upload's target. */
  private photoTarget: StudentRow | null = null;
  readonly photoAccept = PHOTO_ACCEPT;
  @ViewChild('rowPhotoInput') rowPhotoInput?: ElementRef<HTMLInputElement>;

  // Create / Update
  formOpen = false;
  formMode: StudentFormMode = 'create';
  formTitle = 'Create Student';
  formDetail: StudentDetail | null = null;
  formErrors: Record<string, string> = {};
  formError = '';
  saving = false;
  private editingId: string | null = null;
  /** One Idempotency-Key per Create form-open (utils/idempotency.util.ts); updates send none. */
  private formKey = '';

  // View Profile
  viewOpen = false;
  viewDetail: StudentDetail | null = null;

  // Assign Card
  cardOpen = false;
  cardTitle = 'Assign Card';
  cardTargets: StudentListRow[] = [];
  cardNumbers: Record<string, string> = {};
  cardVerifyMode = '4';
  cardSaving = false;
  cardError = '';
  /** Per-row card problems, by studentId — an in-form duplicate, or a row the server refused. */
  cardRowErrors: Record<string, string> = {};
  private cardKey = '';
  readonly verifyModeOptions: DdOption[] = VERIFY_MODE_OPTIONS.map((option) => ({ ...option }));

  // Excel
  excelOpen = false;
  excelScopeLabel = '';
  exporting = false;
  importing = false;
  importStatus = '';
  importResult: ImportResult | null = null;
  importError = '';
  /** Columns the server didn't recognise — said once for the file, not per row. */
  importWarning = '';
  /** The chosen sheet — nothing uploads until Import is pressed. */
  importFile: File | null = null;
  /** Masked (default) or Full (logged) — the Export panel's choice. */
  exportMode: 'masked' | 'full' = 'masked';

  // Bulk result panel — a per-row outcome, never one pass/fail toast for a selection.
  bulkResultOpen = false;
  bulkResultTitle = '';
  bulkResultSummary = '';
  bulkResultLines: BulkResultLine[] = [];

  // Delete / Resync confirmation
  deleting = false;
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private pending: { action: 'delete'; ids: string[] } | { action: 'resync'; row: StudentListRow } | null = null;

  /** List requests — switchMapped, so a stale page/filter response never lands. */
  private list$ = new Subject<ListQuery>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: ManageStudentsService,
    private optionsService: StudentOptionsService,
    private jobs: JobStatusService,
    private adminAuthService: AdminAuthService,
    private shellContext: ShellContextService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) {
      this.loading = false;
      return;
    }

    // switchMap: a newer filter/page/search cancels the in-flight request instead of racing it.
    this.list$.pipe(
      switchMap((query) => this.api.getStudents(this.adminId, query).pipe(
        map((res): StudentListResponse | null => res),
        catchError(() => of(null))
      )),
      takeUntil(this.destroyed$)
    ).subscribe((res) => (res ? this.applyPage(res) : this.pageFailed()));

    this.loadOptions();

    // Debounced: a keystroke must not refetch a 2M-row list (performance-principles.md).
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.resetAndFetch();
    });

    // The session the header shows drives every read — the first load and every switch.
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      if (!session) return;
      this.selected.clear();
      this.resetAndFetch();
      this.fetchOverview();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  /** Class options + FieldConfig, each with an error state and a retry. */
  loadOptions(): void {
    this.optionsError = '';
    this.optionsService.getFilterOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((options) => {
      this.filterOptions = options;
      this.cdr.markForCheck();
    }, () => {
      this.optionsError = "Couldn't load classes and sections.";
      this.cdr.markForCheck();
    });
    this.optionsService.getFieldConfig(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((config) => {
      this.fieldConfig = config;
      this.cdr.markForCheck();
    }, () => {
      this.optionsError = "Couldn't load the student form's settings.";
      this.cdr.markForCheck();
    });
  }

  retryOptions(): void {
    // A failed request must not stay cached as the answer.
    this.optionsService.refresh();
    this.loadOptions();
  }

  // --- list ---------------------------------------------------------------------------

  private resetAndFetch(): void {
    this.page = 1;
    this.cursors = [null];
    this.fetchPage();
  }

  private fetchPage(): void {
    if (!this.session) return;
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.list$.next({
      session: this.session,
      ...this.filter,
      search: this.search,
      cursor: this.cursors[this.page - 1],
      limit: this.limit,
      fields: MANAGE_STUDENTS_FIELDS
    });
  }

  private applyPage(res: StudentListResponse): void {
    this.rows = this.sorted(res.rows.map(toRow));
    this.total = res.total;
    this.nextCursor = res.nextCursor;
    this.cursors[this.page] = res.nextCursor;
    this.loading = false;
    this.cdr.markForCheck();
  }

  private pageFailed(): void {
    this.loading = false;
    // Not the empty state: the table says the load FAILED and offers a retry.
    this.rows = [];
    this.loadError = "Couldn't load students.";
    this.cdr.markForCheck();
  }

  // --- write-back (student/optimization.md): patch from the mutation's response, no refetch

  /** Would this row appear under the current filter + search? */
  private inView(row: StudentListRow): boolean {
    const f = this.filter;
    if ((f.classId && row.classId !== f.classId) || (f.streamId && row.streamId !== f.streamId)
      || (f.groupId && row.groupId !== f.groupId) || (f.sectionId && row.sectionId !== f.sectionId)) return false;
    if (!this.search) return true;
    const term = this.search.toLowerCase();
    return row.name.toLowerCase().startsWith(term) || String(row.admissionNo ?? '') === this.search;
  }

  private writeBackCreated(row: StudentListRow): void {
    this.overview = { ...this.overview, totalStudents: this.overview.totalStudents + 1 };
    if (!this.inView(row)) return;
    this.total += 1;
    // Only page 1 shows it at the top; a later page's keyset window is left as it was.
    if (this.page === 1) this.rows = this.sorted([toRow(row), ...this.rows].slice(0, this.limit));
  }

  private writeBackUpdated(row: StudentListRow): void {
    const index = this.rows.findIndex((item) => item.studentId === row.studentId);
    if (index === -1) return;
    if (this.inView(row)) {
      // Re-sorted: an edited name can move the row.
      this.rows = this.sorted(this.rows.map((item, i) => (i === index ? toRow(row) : item)));
    } else {
      // Moved out of the filtered class/section by this edit.
      this.rows = this.rows.filter((_item, i) => i !== index);
      this.total = Math.max(0, this.total - 1);
    }
    if (this.selected.has(row.studentId)) this.selected.set(row.studentId, row);
  }

  private writeBackDeleted(ids: string[]): void {
    const gone = new Set(ids);
    const removed = this.rows.filter((row) => gone.has(row.studentId));
    this.rows = this.rows.filter((row) => !gone.has(row.studentId));
    this.total = Math.max(0, this.total - removed.length);
    this.overview = {
      totalStudents: Math.max(0, this.overview.totalStudents - ids.length),
      cardsAssigned: Math.max(0, this.overview.cardsAssigned - removed.filter((row) => row.card).length)
    };
    // An emptied page can't be patched into a full one — refetch it (keyset window moved).
    if (!this.rows.length && this.total > 0) this.resetAndFetch();
  }

  private writeBackCards(cards: { studentId: string; card: string }[]): void {
    const byStudent = new Map(cards.map((item) => [item.studentId, item.card]));
    let newlyAssigned = 0;
    this.rows = this.rows.map((row) => {
      const card = byStudent.get(row.studentId);
      if (!card) return row;
      if (!row.card) newlyAssigned += 1;
      return { ...row, card, cardMasked: maskCard(card) };
    });
    byStudent.forEach((card, studentId) => {
      const picked = this.selected.get(studentId);
      if (picked) this.selected.set(studentId, { ...picked, card });
    });
    // Rows off this page aren't known here; the next overview fetch settles the exact count.
    this.overview = { ...this.overview, cardsAssigned: this.overview.cardsAssigned + newlyAssigned };
  }

  retryList(): void {
    this.fetchPage();
  }

  private fetchOverview(): void {
    this.api.getOverview(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.overview = res;
      this.cdr.markForCheck();
    });
  }

  private refresh(): void {
    this.fetchPage();
    this.fetchOverview();
  }

  onSearchInput(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.resetAndFetch();
  }

  /** Prev/next only — the cursor for the requested page is always already known. */
  onPageChange(page: number): void {
    if (page > this.page && !this.nextCursor) return;
    if (this.cursors[page - 1] === undefined) return;
    this.page = page;
    this.fetchPage();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.resetAndFetch();
  }

  /** Excel is the one scope-gated action: a class, plus its stream if it has streams. */
  get excelEnabled(): boolean {
    return isClassScopeComplete(this.filterOptions, this.filter);
  }

  trackByRow = (_index: number, row: StudentRow): string => row.enrollmentId;

  trackByImportRow = (_index: number, failure: ImportRowError): number => failure.row;
  trackByImportField = (_index: number, field: ImportRowError['fields'][number]): string => field.field + '|' + field.message;
  trackByBulkLine = (_index: number, line: BulkResultLine): string => line.key;

  /** The Card header's toggle: the whole column masked ↔ full at once, never per row. */
  toggleCardsRevealed(): void {
    this.cardsRevealed = !this.cardsRevealed;
  }

  // --- header: sort + display case (frontend only, no API call) -------------------------

  /** Clicking a column label: first click sorts it A→Z, each further click flips it. */
  toggleSort(column: SortColumn): void {
    this.sortDir = this.sortColumn === column && this.sortDir === 'asc' ? 'desc' : 'asc';
    this.sortColumn = column;
    this.rows = this.sorted(this.rows);
  }

  /** aria-sort for a header cell. */
  /** The header arrow: neutral until sorted, then the direction. */
  sortIcon(column: SortColumn): string {
    if (this.sortColumn !== column) return 'bi-arrow-down-up';
    return this.sortDir === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down';
  }

  ariaSort(column: SortColumn): string {
    if (this.sortColumn !== column) return 'none';
    return this.sortDir === 'asc' ? 'ascending' : 'descending';
  }

  /** A direct pick in Student's "Aa" menu: re-cases Student only. */
  setNameCase(mode: TextCase): void {
    this.nameCase = mode;
  }

  /** "Apply to all fields": Student, Father and Mother take the same case together. */
  applyCaseToAll(mode: TextCase): void {
    this.nameCase = mode;
    this.parentCase = mode;
  }

  private sorted(rows: StudentRow[]): StudentRow[] {
    const column = this.sortColumn;
    if (!column) return rows;
    return [...rows].sort((a, b) => (column === 'name'
      ? compareText(a.name, b.name, this.sortDir)
      : compareNumber(a[column], b[column], this.sortDir)));
  }
  trackByTarget = (_index: number, row: StudentListRow): string => row.studentId;

  // --- selection ------------------------------------------------------------------------

  isSelected(row: StudentListRow): boolean {
    return this.selected.has(row.studentId);
  }

  toggleRow(row: StudentListRow): void {
    if (this.selected.has(row.studentId)) this.selected.delete(row.studentId);
    else this.selected.set(row.studentId, row);
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row.studentId));
  }

  toggleAll(): void {
    const selectAll = !this.allSelected;
    this.rows.forEach((row) => {
      if (selectAll) this.selected.set(row.studentId, row);
      else this.selected.delete(row.studentId);
    });
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  // --- photo from the row avatar (manage-students.md) --------------------------------------

  /**
   * Clicking a row's avatar opens the picker for THAT student; the pick uploads straight
   * away — no separate save. Same endpoint and field as the Edit form's photo
   * (PUT /students/:id, multipart `photo`), so the two paths never disagree.
   */
  onAvatarClick(row: StudentRow): void {
    if (this.busyRows.has(row.studentId) || !this.rowPhotoInput) return;
    this.photoTarget = row;
    this.rowPhotoInput.nativeElement.click();
  }

  onRowPhotoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    const row = this.photoTarget;
    this.photoTarget = null;
    if (!file || !row || this.busyRows.has(row.studentId)) return;
    // Checked here first: a file the server would refuse is never sent.
    const problem = photoFileError(file);
    if (problem) {
      this.snackBar.open(problem, 'Close', { duration: 4000 });
      return;
    }

    const body = new FormData();
    body.append('adminId', this.adminId);
    body.append('session', this.session);
    body.append('photo', file, file.name);

    const id = row.studentId;
    this.setBusy([id], true);
    this.api.updateStudent(id, body).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.setBusy([id], false);
      // IMAGE_UPLOAD_FAILED comes back as a warning on a 200 — shown, never hidden.
      this.snackBar.open(res.warnings?.length || res.warning ? saveMessage(res) : 'Photo updated for ' + row.name + '.',
        'Close', { duration: res.warnings?.length || res.warning ? 8000 : 3000 });
      if (res.student) this.writeBackUpdated(res.student);
      else this.refresh();
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.setBusy([id], false);
      // ValidationError is the one category the ErrorInterceptor leaves to the page.
      const validation = validationErrorsOf(error);
      if (validation) this.snackBar.open(validation.fields['photo'] || validation.message, 'Close', { duration: 5000 });
    });
  }

  // --- view -----------------------------------------------------------------------------

  onView(row: StudentListRow): void {
    this.api.getStudent(this.adminId, row.studentId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((detail) => {
      this.viewDetail = detail;
      this.viewOpen = true;
      this.cdr.markForCheck();
    });
  }

  closeView(): void {
    this.viewOpen = false;
    this.viewDetail = null;
  }

  // --- create / update ------------------------------------------------------------------

  onCreate(): void {
    this.formMode = 'create';
    this.formTitle = 'Create Student';
    this.formDetail = null;
    this.editingId = null;
    this.formKey = newIdempotencyKey();
    this.clearFormErrors();
    this.formOpen = true;
  }

  onEdit(row: StudentListRow): void {
    this.api.getStudent(this.adminId, row.studentId, this.session, 'edit').pipe(takeUntil(this.destroyed$)).subscribe((detail) => {
      this.formMode = 'edit';
      this.formTitle = 'Update Student';
      this.formDetail = detail;
      this.editingId = row.studentId;
      this.clearFormErrors();
      this.formOpen = true;
      this.cdr.markForCheck();
    });
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  onFormSubmit(): void {
    if (this.saving || !this.studentForm) return;
    const body = this.studentForm.buildPayload();
    if (!body) return;

    this.saving = true;
    this.clearFormErrors();
    const request = this.editingId
      ? this.api.updateStudent(this.editingId, body)
      : this.api.createStudent(body, this.formKey);

    const editing = Boolean(this.editingId);
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.formOpen = false;
      // Saved, but the photo didn't upload (IMAGE_UPLOAD_FAILED) — say so, don't hide it.
      this.snackBar.open(saveMessage(res), 'Close', { duration: res.warnings?.length ? 8000 : 3000 });
      // Write-back: the response carries the saved row. Only a response without one (no
      // placement in this session) falls back to a refetch.
      if (!res.student) this.refresh();
      else if (editing) this.writeBackUpdated(res.student);
      else this.writeBackCreated(res.student);
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.saving = false;
      const validation = validationErrorsOf(error);
      if (validation) {
        this.formErrors = validation.fields;
        // The modal always says something was rejected, even for a field it has no slot for.
        this.formError = validation.message;
      }
      this.cdr.markForCheck();
    });
  }

  private clearFormErrors(): void {
    this.formErrors = {};
    this.formError = '';
  }

  // --- assign card ----------------------------------------------------------------------

  onAssignCard(row: StudentListRow): void {
    this.openCardModal([row]);
  }

  onAssignCardSelected(): void {
    if (!this.selected.size) return;
    this.openCardModal(Array.from(this.selected.values()));
  }

  private openCardModal(targets: StudentListRow[]): void {
    this.cardTargets = targets;
    this.cardNumbers = {};
    this.cardVerifyMode = '4';
    this.cardError = '';
    this.cardRowErrors = {};
    this.cardSaving = false;
    this.cardKey = newIdempotencyKey();
    this.cardTitle = targets.length === 1 ? 'Assign Card — ' + targets[0].name : `Assign Card — ${targets.length} selected`;
    this.cardOpen = true;
  }

  onCardInput(studentId: string, value: string): void {
    this.cardNumbers = { ...this.cardNumbers, [studentId]: value.trim() };
    this.cardRowErrors = this.inFormCardDuplicates();
  }

  /**
   * The same card number typed for two students in this one list — rejected BEFORE submit
   * (student/errors.md: a bulk card list rejects an in-file duplicate), flagged on every
   * row that repeats an earlier one.
   */
  private inFormCardDuplicates(): Record<string, string> {
    const firstOwner = new Map<string, StudentListRow>();
    const errors: Record<string, string> = {};
    this.cardTargets.forEach((row) => {
      const card = this.cardNumbers[row.studentId];
      if (!card) return;
      const owner = firstOwner.get(card);
      if (owner) errors[row.studentId] = `Card ${card} is already entered for ${owner.name} above.`;
      else firstOwner.set(card, row);
    });
    return errors;
  }

  get cardSubmitDisabled(): boolean {
    return this.cardSaving
      || this.cardTargets.some((row) => !this.cardNumbers[row.studentId])
      || Object.keys(this.inFormCardDuplicates()).length > 0;
  }

  /**
   * Saves the cards, then waits for the device-sync job before closing — a card
   * assignment is consequential, so the modal never claims success the devices haven't
   * confirmed (performance-principles.md, optimistic updates).
   */
  onCardSubmit(): void {
    if (this.cardSubmitDisabled) return;
    this.cardSaving = true;
    this.cardError = '';
    this.cardRowErrors = {};

    this.api.assignCards({
      adminId: this.adminId,
      verifyMode: Number(this.cardVerifyMode),
      items: this.cardTargets.map((row) => ({ studentId: row.studentId, cardNumber: this.cardNumbers[row.studentId] }))
    }, this.cardKey).pipe(takeUntil(this.destroyed$)).subscribe((queued) => {
      // Per-row outcome: any row the server refused (card taken, student gone) is marked on
      // that row; the rest were saved and are syncing.
      const refused = this.cardErrorsByRow(queued.rows);
      this.cardRowErrors = refused;
      // The cards are saved at this point (the job only pushes them to devices) — show them now.
      this.writeBackCards(queued.cards || []);
      this.cdr.markForCheck();

      this.jobs.watch<DeviceSyncResult>('student', this.adminId, queued.jobId)
        .pipe(takeUntil(this.destroyed$))
        .subscribe((status) => {
          if (status.state === 'completed') {
            const unreachable = status.result?.failed || [];
            this.cardSaving = false;
            unreachable.forEach((item) => {
              refused[item.studentId] = refused[item.studentId]
                || "Card saved, but couldn't reach the device — it will sync when the device is back online.";
            });
            this.cardRowErrors = { ...refused };
            if (Object.keys(refused).length) {
              // Stay open: the modal IS the per-row result for this selection.
              this.cardError = `${queued.assigned} of ${this.cardTargets.length} assigned — see the rows marked below.`;
            } else {
              this.cardOpen = false;
              this.snackBar.open(queued.message, 'Close', { duration: 3000 });
            }
          } else if (status.state === 'failed') {
            this.cardSaving = false;
            this.cardError = "Cards were saved, but the device sync didn't finish. Use Resync once the device is online.";
          }
          this.cdr.markForCheck();
        }, () => {
          this.cardSaving = false;
          this.cdr.markForCheck();
        });
    }, (error: unknown) => {
      this.cardSaving = false;
      const rows = rowErrorsOf(error);
      this.cardRowErrors = this.cardErrorsByRow(rows);
      this.cardError = Object.keys(this.cardRowErrors).length
        ? 'None of the cards could be assigned — see the rows marked below.'
        : (validationErrorsOf(error)?.message || errorMessageOf(error, ''));
      this.cdr.markForCheck();
    });
  }

  private cardErrorsByRow(rows: { studentId?: string; message?: string }[] | undefined): Record<string, string> {
    const errors: Record<string, string> = {};
    (rows || []).forEach((row) => {
      if (row.studentId) errors[row.studentId] = row.message || 'Could not be assigned.';
    });
    return errors;
  }

  /** Card-row error for the template — O(1), no search per row. */
  cardRowError(studentId: string): string {
    return this.cardRowErrors[studentId] || '';
  }

  // --- resync / delete (confirmed first) -------------------------------------------------

  onResync(row: StudentListRow): void {
    if (!row.card) {
      this.snackBar.open('This student has no card yet — use Assign Card first.', 'Close', { duration: 3000 });
      return;
    }
    this.pending = { action: 'resync', row };
    this.confirmConfig = {
      title: 'Resync ' + row.name + '?',
      message: "Pushes this person's card and fingerprint back down to every biometric device.",
      confirmLabel: 'Resync',
      variant: 'neutral'
    };
    this.confirmOpen = true;
  }

  onDelete(row: StudentListRow): void {
    if (this.busyRows.has(row.studentId)) return;
    this.openDeleteConfirm([row.studentId], 'Delete Student');
  }

  isBusy(row: StudentListRow): boolean {
    return this.busyRows.has(row.studentId);
  }

  private setBusy(ids: string[], busy: boolean): void {
    ids.forEach((id) => (busy ? this.busyRows.add(id) : this.busyRows.delete(id)));
    this.cdr.markForCheck();
  }

  onDeleteSelected(): void {
    if (!this.selected.size) return;
    this.openDeleteConfirm(Array.from(this.selected.keys()), `Delete ${this.selected.size} Student(s)`);
  }

  private openDeleteConfirm(ids: string[], title: string): void {
    this.pending = { action: 'delete', ids };
    this.confirmConfig = {
      title,
      message: 'This also removes their login access, fee records, admit cards, and results. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE'
    };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    if (pending.action === 'resync') {
      const id = pending.row.studentId;
      if (this.busyRows.has(id)) return;
      this.setBusy([id], true);
      this.api.resyncCard(this.adminId, id).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.setBusy([id], false);
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
      }, () => this.setBusy([id], false));
      return;
    }

    // Double-submit guard: one delete in flight at a time (a repeated delete is harmless anyway).
    if (this.deleting) return;
    this.deleting = true;
    this.setBusy(pending.ids, true);
    const nameById = new Map<string, string>();
    pending.ids.forEach((id) => nameById.set(id, this.selected.get(id)?.name || this.rows.find((row) => row.studentId === id)?.name || id));

    this.api.bulkDelete(this.adminId, pending.ids).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.deleting = false;
      this.setBusy(pending.ids, false);
      pending.ids.forEach((id) => this.selected.delete(id));
      if (res.rows && res.rows.length) {
        // Per-row outcome — some of the selection could not be deleted; list which.
        this.showBulkResult('Delete Selected', `${res.deleted} of ${pending.ids.length} deleted.`,
          res.rows.map((row, index) => ({
            key: row.id || String(index), label: nameById.get(row.id || '') || row.id || 'Student', message: row.message
          })));
      } else {
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
      }
      const refused = new Set((res.rows || []).map((row) => row.id));
      this.writeBackDeleted(pending.ids.filter((id) => !refused.has(id)));
      this.cdr.markForCheck();
    }, () => {
      this.deleting = false;
      this.setBusy(pending.ids, false);
    });
  }

  private showBulkResult(title: string, summary: string, lines: BulkResultLine[]): void {
    this.bulkResultTitle = title;
    this.bulkResultSummary = summary;
    this.bulkResultLines = lines;
    this.bulkResultOpen = true;
    this.cdr.markForCheck();
  }

  closeBulkResult(): void {
    this.bulkResultOpen = false;
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.pending = null;
  }

  // --- Excel ----------------------------------------------------------------------------

  onOpenExcel(): void {
    if (!this.excelEnabled) return;
    this.excelScopeLabel = describeClassScope(this.filterOptions, this.filter);
    this.importStatus = '';
    this.importResult = null;
    this.importError = '';
    this.importWarning = '';
    this.importFile = null;
    // Every opening starts Masked: Full is always a deliberate choice.
    this.exportMode = 'masked';
    this.excelOpen = true;
  }

  closeExcel(): void {
    this.excelOpen = false;
  }

  onExport(): void {
    if (this.exporting || !this.excelEnabled) return;
    this.exporting = true;
    const mode = this.exportMode;
    this.api.exportExcel(this.adminId, { session: this.session, classId: this.filter.classId, streamId: this.filter.streamId, mode })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `students-${this.excelScopeLabel.replace(/[^\w]+/g, '-')}-${this.session}${mode === 'full' ? '-FULL' : ''}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
        this.exporting = false;
        this.cdr.markForCheck();
      }, () => {
        this.exporting = false;
        this.cdr.markForCheck();
      });
  }

  /** Choosing (or re-choosing) a file only selects it — it's shown by name until Import. */
  onImportFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || this.importing) return;
    this.importResult = null;
    this.importWarning = '';
    if (!/\.xlsx$/i.test(file.name)) {
      this.importFile = null;
      this.importError = 'Choose an Excel (.xlsx) file.';
      return;
    }
    this.importError = '';
    this.importFile = file;
  }

  onImportSubmit(): void {
    const file = this.importFile;
    if (!file || this.importing) return;

    const body = new FormData();
    body.append('adminId', this.adminId);
    body.append('session', this.session);
    body.append('classId', this.filter.classId);
    if (this.filter.streamId) body.append('streamId', this.filter.streamId);
    body.append('file', file, file.name);

    this.importing = true;
    this.importError = '';
    this.importWarning = '';
    this.importResult = null;
    this.importStatus = 'Uploading ' + file.name + '…';

    // The job dedups on (school, scope, file hash): the same file picked twice imports once.
    this.api.importExcel(body).pipe(takeUntil(this.destroyed$)).subscribe((queued) => {
      this.importStatus = 'Importing — you can keep working while it runs.';
      this.importWarning = queued.warning?.message || '';
      this.cdr.markForCheck();
      this.jobs.watch<ImportResult>('student', this.adminId, queued.jobId).pipe(takeUntil(this.destroyed$)).subscribe((status) => {
        if (status.state === 'completed') {
          this.importing = false;
          this.importStatus = '';
          this.importFile = null;
          this.importResult = status.result;
          this.refresh();
        } else if (status.state === 'failed') {
          this.importing = false;
          this.importStatus = '';
          this.importError = status.error || 'The import could not be completed.';
        }
        this.cdr.markForCheck();
      }, () => {
        this.importing = false;
        this.importStatus = '';
        this.cdr.markForCheck();
      });
    }, (error: unknown) => {
      this.importing = false;
      this.importStatus = '';
      this.importError = validationErrorsOf(error)?.fields['file'] || errorMessageOf(error, 'The file could not be imported.');
      this.cdr.markForCheck();
    });
  }
}
