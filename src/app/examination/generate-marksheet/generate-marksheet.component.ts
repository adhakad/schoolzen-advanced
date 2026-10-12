/**
 * Examination › Generate Marksheet — every student of the session, with their Marks Status
 * for the chosen term; enter marks (one student, or Bulk for one class), then preview/print.
 * No configuration of its own: subjects and max marks come from Marksheet Structure.
 *
 * Reference: docs/schoolzen-planning/v1/examination/generate-marksheet.html (+ .md, errors.md)
 *
 * Toolbar: row1 search + "Bulk Enter Marks (N)" + "Print Selected (N)" (both disabled until
 * rows are checked; Bulk also needs them all in one class), row2 Class → Stream + Term.
 * Every score is re-validated by the API (MARKS_EXCEED_MAX etc.); a result saved since the
 * form loaded asks before overwriting (MARKS_ALREADY_ENTERED). Entering marks needs the
 * 'marksheet' edit grant (`canEdit`).
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { GenerateMarksheetService } from 'src/app/shared/services/examination/generate-marksheet.service';
import {
  BulkForm, LetterheadHeader, MarksForm, MarksheetDocument, MarksheetRow, PrintMode, SkippedNotice
} from 'src/app/shared/models/examination/examination.model';
import { CascadeFilterValue, EMPTY_CASCADE, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, rowErrorsOf, toApiError, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { avatarGradient } from 'src/app/shared/utils/avatar.util';

const EMPTY_SUMMARY = { entered: 0, pending: 0, missing: 0 };
const CO_GRADES: DdOption[] = [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }];

const OVERWRITE_CONFIRM: ConfirmConfig = {
  title: 'Overwrite saved result?',
  message: "This term's result already exists — save anyway to overwrite it?",
  confirmLabel: 'Save anyway',
  variant: 'warning'
};

/** A score the way the reference accepts it: blank = 0, half marks allowed, never negative. */
const scoreError = (value: string, max: number | null): string => {
  if (max == null || value === '' || value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.round(n * 2) !== n * 2) return "Score can't be negative.";
  if (n > max) return `Score can't exceed the maximum (${max}) for this subject.`;
  return '';
};

@Component({
  selector: 'app-generate-marksheet',
  templateUrl: './generate-marksheet.component.html',
  styleUrls: ['../examination-page.css', './generate-marksheet.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenerateMarksheetComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  options: StudentFilterOptions | null = null;
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';
  term = '';
  terms: string[] = [];

  rows: MarksheetRow[] = [];
  total = 0;
  page = 1;
  limit = 25;
  private cursors: string[] = [''];
  summary = EMPTY_SUMMARY;
  canEdit = false;
  loading = true;
  loadError = '';
  selected = new Map<string, MarksheetRow>();

  // Enter / Edit Marks
  marksRow: MarksheetRow | null = null;
  form: MarksForm | null = null;
  formTerm = '';
  formLoading = false;
  formError = '';
  theory: Record<string, string> = {};
  practical: Record<string, string> = {};
  coGrades: Record<string, string> = {};
  markErrors: Record<string, string> = {};
  saveError = '';
  isClick = false;
  readonly coGradeOptions = CO_GRADES;

  // Bulk Enter Marks
  bulk: BulkForm | null = null;
  bulkOpen = false;
  bulkLoading = false;
  bulkError = '';
  bulkCells: Record<string, string> = {};
  bulkCellErrors: Record<string, string> = {};

  // Overwrite confirm (MARKS_ALREADY_ENTERED)
  overwriteOpen = false;
  readonly overwriteConfirm = OVERWRITE_CONFIRM;
  private overwriteAction: (() => void) | null = null;

  // Preview / print
  printModeOpen = false;
  previewOpen = false;
  previewTitle = '';
  previewLoading = false;
  previewError = '';
  printHeader: LetterheadHeader | null = null;
  printTitle = '';
  documents: MarksheetDocument[] = [];
  printMode: PrintMode = 1;
  skipped: SkippedNotice | null = null;

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: GenerateMarksheetService,
    private optionsService: StudentOptionsService,
    private shellContext: ShellContextService,
    private adminAuthService: AdminAuthService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) {
      this.loading = false;
      return;
    }
    this.loadOptions();
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.fetch();
    });
    this.shellContext.context.pipe(map((context) => context.activeSession), distinctUntilChanged(), takeUntil(this.destroyed$))
      .subscribe((session) => {
        this.session = session;
        if (session) this.fetch();
      });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadOptions(): void {
    this.optionsError = '';
    this.optionsService.getFilterOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((options) => {
      this.options = options;
      this.cdr.markForCheck();
    }, (error) => {
      this.optionsError = errorMessageOf(error, "Couldn't load classes.");
      this.cdr.markForCheck();
    });
  }

  get termOptions(): DdOption[] {
    return this.terms.map((t) => ({ value: t, label: t }));
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.fetch();
  }

  onTermChange(term: string): void {
    this.term = term;
    this.fetch();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.fetch();
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.cursors.length) return;
    this.loadPage(page);
  }

  fetch(): void {
    if (!this.session) return;
    this.cursors = [''];
    this.selected.clear();
    this.loadPage(1);
  }

  private loadPage(page: number): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.list(this.adminId, this.session, {
      classId: this.filter.classId, streamId: this.filter.streamId, term: this.term, search: this.search
    }, this.cursors[page - 1], this.limit).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.page = page;
      this.cursors = this.cursors.slice(0, page);
      if (res.nextCursor) this.cursors.push(res.nextCursor);
      if (res.total != null) this.total = res.total;
      if (res.summary) this.summary = res.summary;
      this.terms = res.terms || [];
      this.term = res.term || '';
      this.canEdit = Boolean(res.canEdit);
      this.loading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.rows = [];
      this.loading = false;
      this.loadError = errorMessageOf(error, "Couldn't load students.");
      this.cdr.markForCheck();
    });
  }

  // ---- Selection ----------------------------------------------------------------------------

  get selectableRows(): MarksheetRow[] {
    return this.rows.filter((row) => row.status !== 'nostructure');
  }

  get allSelected(): boolean {
    return this.selectableRows.length > 0 && this.selectableRows.every((row) => this.selected.has(row.studentId));
  }

  toggleAll(checked: boolean): void {
    this.selectableRows.forEach((row) => {
      if (checked) this.selected.set(row.studentId, row);
      else this.selected.delete(row.studentId);
    });
  }

  toggleRow(row: MarksheetRow, checked: boolean): void {
    if (checked) this.selected.set(row.studentId, row);
    else this.selected.delete(row.studentId);
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  /** Bulk entry builds one grid from one class's subjects. */
  get selectionSpansClasses(): boolean {
    return new Set([...this.selected.values()].map((row) => `${row.classId}|${row.streamId || ''}`)).size > 1;
  }

  get bulkDisabled(): boolean {
    return !this.canEdit || this.selectedCount === 0 || this.selectionSpansClasses || !this.term;
  }

  // ---- Enter / Edit Marks ---------------------------------------------------------------------

  openMarks(row: MarksheetRow): void {
    if (row.status === 'nostructure') return;
    this.marksRow = row;
    this.loadForm(this.term);
  }

  switchTerm(term: string): void {
    if (term === this.formTerm || this.isClick) return;
    this.loadForm(term);
  }

  private loadForm(term: string): void {
    const row = this.marksRow;
    if (!row) return;
    this.form = null;
    this.formTerm = term;
    this.formLoading = true;
    this.formError = '';
    this.saveError = '';
    this.markErrors = {};
    this.cdr.markForCheck();
    this.api.form(this.adminId, this.session, row.studentId, term).pipe(takeUntil(this.destroyed$)).subscribe((form) => {
      this.form = form;
      const saved = new Map((form.result?.subjects || []).map((s) => [s.subjectId, s]));
      this.theory = {};
      this.practical = {};
      form.subjects.forEach((s) => {
        const v = saved.get(s.subjectId);
        this.theory[s.subjectId] = v?.theory != null ? String(v.theory) : '';
        this.practical[s.subjectId] = v?.practical != null ? String(v.practical) : '';
      });
      const grades = new Map((form.result?.coScholastic || []).map((c) => [c.area, c.grade]));
      this.coGrades = {};
      form.coScholasticAreas.forEach((area) => { this.coGrades[area] = grades.get(area) || 'A'; });
      this.formLoading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.formLoading = false;
      this.formError = errorMessageOf(error, "Couldn't load this student's marks.");
      this.cdr.markForCheck();
    });
  }

  closeMarks(): void {
    if (this.isClick) return;
    this.marksRow = null;
    this.form = null;
  }

  setScore(subjectId: string, part: 'theory' | 'practical', value: string): void {
    (part === 'theory' ? this.theory : this.practical)[subjectId] = value;
    const key = `${subjectId}.${part}`;
    if (this.markErrors[key]) this.markErrors = { ...this.markErrors, [key]: '' };
  }

  /** The reference's live result summary: total / max, percentage, pass/fail. */
  get liveResult(): { total: number; max: number; pct: number; pass: boolean } {
    let total = 0;
    let max = 0;
    (this.form?.subjects || []).forEach((s) => {
      if (s.theoryMax != null) { total += Number(this.theory[s.subjectId]) || 0; max += s.theoryMax; }
      if (s.practicalMax != null) { total += Number(this.practical[s.subjectId]) || 0; max += s.practicalMax; }
    });
    const pct = max ? Math.round((total / max) * 1000) / 10 : 0;
    return { total, max, pct, pass: pct >= (this.form?.passPercent ?? 33) };
  }

  get theoryHead(): string {
    const maxes = new Set((this.form?.subjects || []).filter((s) => s.theoryMax != null).map((s) => s.theoryMax));
    return maxes.size === 1 ? `Theory (Max ${[...maxes][0]})` : 'Theory';
  }

  get practicalHead(): string {
    const maxes = new Set((this.form?.subjects || []).filter((s) => s.practicalMax != null).map((s) => s.practicalMax));
    return maxes.size === 1 ? `Practical (Max ${[...maxes][0]})` : 'Practical';
  }

  saveMarks(overwrite = false): void {
    const form = this.form;
    const row = this.marksRow;
    if (!form || !row || this.isClick || !this.canEdit) return;
    const errors: Record<string, string> = {};
    form.subjects.forEach((s) => {
      const t = scoreError(this.theory[s.subjectId], s.theoryMax);
      const p = scoreError(this.practical[s.subjectId], s.practicalMax);
      if (t) errors[`${s.subjectId}.theory`] = t;
      if (p) errors[`${s.subjectId}.practical`] = p;
    });
    this.markErrors = errors;
    if (Object.keys(errors).length) return;

    const marks = form.subjects.map((s) => ({
      subjectId: s.subjectId,
      theory: s.theoryMax != null ? this.theory[s.subjectId] : null,
      practical: s.practicalMax != null ? this.practical[s.subjectId] : null
    }));
    this.isClick = true;
    this.saveError = '';
    this.cdr.markForCheck();
    this.api.save(this.adminId, this.session, row.studentId, {
      term: this.formTerm,
      marks,
      coScholastic: form.coScholasticAreas.map((area) => ({ area, grade: this.coGrades[area] || 'A' })),
      expectedUpdatedAt: form.result?.updatedAt || null,
      overwrite
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isClick = false;
      if (this.formTerm === this.term) {
        this.rows = this.rows.map((r) => r.studentId === row.studentId ? { ...r, status: 'entered' } : r);
        if (row.status === 'pending') this.summary = { ...this.summary, entered: this.summary.entered + 1, pending: Math.max(0, this.summary.pending - 1) };
      }
      this.marksRow = null;
      this.form = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.cdr.markForCheck();
    }, (error) => {
      this.isClick = false;
      const apiError = toApiError(error);
      if (apiError?.code === 'MARKS_ALREADY_ENTERED') {
        this.askOverwrite(() => this.saveMarks(true));
      } else {
        const invalid = validationErrorsOf(error);
        const mapped: Record<string, string> = {};
        Object.entries(invalid?.fields || {}).forEach(([field, message]) => {
          const match = /^marks\.(\d+)\.(theory|practical)$/.exec(field);
          const subject = match ? marks[Number(match[1])] : null;
          if (subject) mapped[`${subject.subjectId}.${match![2]}`] = message;
        });
        this.markErrors = mapped;
        this.saveError = Object.keys(mapped).length ? '' : errorMessageOf(error, "Couldn't save marks.");
      }
      this.cdr.markForCheck();
    });
  }

  private askOverwrite(action: () => void): void {
    this.overwriteAction = action;
    this.overwriteOpen = true;
  }

  confirmOverwrite(): void {
    this.overwriteOpen = false;
    const action = this.overwriteAction;
    this.overwriteAction = null;
    if (action) action();
  }

  cancelOverwrite(): void {
    this.overwriteOpen = false;
    this.overwriteAction = null;
  }

  // ---- Bulk Enter Marks -----------------------------------------------------------------------

  openBulk(): void {
    if (this.bulkDisabled) return;
    this.bulkOpen = true;
    this.bulk = null;
    this.bulkLoading = true;
    this.bulkError = '';
    this.bulkCellErrors = {};
    this.cdr.markForCheck();
    this.api.bulkForm(this.adminId, this.session, this.term, [...this.selected.keys()]).pipe(takeUntil(this.destroyed$)).subscribe((bulk) => {
      this.bulk = bulk;
      this.bulkCells = {};
      bulk.rows.forEach((r) => {
        const saved = new Map(r.marks.map((m) => [m.subjectId, m.theory]));
        bulk.subjects.forEach((s) => {
          const v = saved.get(s.subjectId);
          this.bulkCells[`${r.studentId}|${s.subjectId}`] = v != null ? String(v) : '';
        });
      });
      this.bulkLoading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.bulkLoading = false;
      this.bulkError = errorMessageOf(error, "Couldn't load the marks grid.");
      this.cdr.markForCheck();
    });
  }

  closeBulk(): void {
    if (this.isClick) return;
    this.bulkOpen = false;
    this.bulk = null;
  }

  setCell(studentId: string, subjectId: string, value: string): void {
    const key = `${studentId}|${subjectId}`;
    this.bulkCells[key] = value;
    if (this.bulkCellErrors[key]) this.bulkCellErrors = { ...this.bulkCellErrors, [key]: '' };
  }

  get bulkInvalidRows(): number {
    return new Set(Object.entries(this.bulkCellErrors).filter(([, m]) => m).map(([key]) => key.split('|')[0])).size;
  }

  saveBulk(overwrite = false): void {
    const bulk = this.bulk;
    if (!bulk || this.isClick) return;
    const errors: Record<string, string> = {};
    bulk.rows.forEach((r) => bulk.subjects.forEach((s) => {
      const key = `${r.studentId}|${s.subjectId}`;
      const message = scoreError(this.bulkCells[key], s.theoryMax);
      if (message) errors[key] = message;
    }));
    this.bulkCellErrors = errors;
    if (Object.keys(errors).length) {
      this.bulkError = `${this.bulkInvalidRows} student row(s) have invalid marks — see highlighted cells.`;
      return;
    }
    this.isClick = true;
    this.bulkError = '';
    this.cdr.markForCheck();
    this.api.bulkSave(this.adminId, this.session, {
      term: bulk.term,
      overwrite,
      rows: bulk.rows.map((r) => ({
        studentId: r.studentId,
        expectedUpdatedAt: r.updatedAt,
        marks: bulk.subjects.map((s) => ({ subjectId: s.subjectId, theory: this.bulkCells[`${r.studentId}|${s.subjectId}`] }))
      }))
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isClick = false;
      this.bulkOpen = false;
      this.bulk = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error) => {
      this.isClick = false;
      const apiError = toApiError(error);
      if (apiError?.code === 'MARKS_ALREADY_ENTERED') {
        this.askOverwrite(() => this.saveBulk(true));
      } else {
        const rowErrors = rowErrorsOf(error);
        const mapped: Record<string, string> = {};
        rowErrors.forEach((row) => (row.fields || []).forEach((f) => { mapped[`${row.studentId}|${f.field}`] = f.message; }));
        this.bulkCellErrors = mapped;
        this.bulkError = errorMessageOf(error, "Couldn't save marks.");
      }
      this.cdr.markForCheck();
    });
  }

  // ---- Preview / print ----------------------------------------------------------------------

  openPreview(row: MarksheetRow): void {
    if (row.status !== 'entered') return;
    this.printMode = 1;
    this.previewTitle = `Marksheet Preview — ${row.name}`;
    this.loadDocuments([row.studentId]);
  }

  openPrintMode(): void {
    if (!this.selectedCount) return;
    this.printModeOpen = true;
  }

  onPrintMode(mode: PrintMode): void {
    this.printModeOpen = false;
    this.printMode = mode;
    const ids = [...this.selected.values()].filter((row) => row.status === 'entered').map((row) => row.studentId);
    this.previewTitle = `Marksheets — ${mode === 2 ? '2' : '1'} per page (${this.selectedCount})`;
    this.loadDocuments(ids.length ? ids : [...this.selected.keys()]);
  }

  private loadDocuments(studentIds: string[]): void {
    this.previewOpen = true;
    this.previewLoading = true;
    this.previewError = '';
    this.documents = [];
    this.skipped = null;
    this.cdr.markForCheck();
    this.api.print(this.adminId, this.session, this.term, studentIds).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.printHeader = res.header;
      this.printTitle = res.title;
      this.documents = res.documents;
      const notEntered = [...this.selected.values()].filter((row) => row.status !== 'entered').length;
      this.skipped = res.skipped || (studentIds.length > 1 && notEntered
        ? { count: notEntered, code: 'PRINT_SELECTION_INCOMPLETE', message: `${notEntered} of the selected students don't have a generated document yet — they were skipped.` }
        : null);
      this.previewLoading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.previewLoading = false;
      this.previewError = errorMessageOf(error, "Couldn't load the marksheet.");
      this.cdr.markForCheck();
    });
  }

  closePreview(): void {
    this.previewOpen = false;
    this.documents = [];
  }

  print(): void {
    window.print();
  }

  avatar(row: MarksheetRow): string {
    return avatarGradient(row.studentId);
  }

  roll(value: number | null): string {
    return value == null ? '—' : (value < 10 ? '0' + value : String(value));
  }

  trackByStudent = (_index: number, row: { studentId: string }): string => row.studentId;
  trackBySubject = (_index: number, row: { subjectId: string }): string => row.subjectId;
  trackByIndex = (index: number): number => index;
}
