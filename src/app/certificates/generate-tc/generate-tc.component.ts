/**
 * Generate TC — every student of the session, shown by default; filters narrow, never gate.
 *
 * Reference: docs/schoolzen-planning/v1/certificates/generate-tc.html
 *
 * Toolbar: search (row 1), Class → Stream → Section (row 2), Status (row 3). Not-yet-issued
 * rows show "Issue TC"; issued rows a printer icon that reprints the stored snapshot (same
 * serial forever). Issue needs 'tc-generate' (`canIssue`); pending fees block the issue
 * unless the server says this user may override ('fees-waiver'), in which case an explicit
 * acknowledgement is required. Every value on the certificate is recomputed server-side.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { TransferCertificateService } from 'src/app/shared/services/certificates/transfer-certificate.service';
import {
  TcCertificate, TcConduct, TcIssueDraft, TcReason, TcStatusFilter, TcStudentRow
} from 'src/app/shared/models/certificates/certificates.model';
import { CascadeFilterValue, EMPTY_CASCADE, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, toApiError, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';

const EMPTY_SUMMARY = { totalStudents: 0, issuedThisSession: 0 };

/** Today as "YYYY-MM-DD" from the LOCAL date parts (what the date picker speaks). */
const todayKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

@Component({
  selector: 'app-generate-tc',
  templateUrl: './generate-tc.component.html',
  styleUrls: ['./generate-tc.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenerateTcComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  options: StudentFilterOptions | null = null;
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';
  status: TcStatusFilter = '';
  readonly statusOptions: DdOption[] = [
    { value: '', label: 'Any status' }, { value: 'issued', label: 'Issued' }, { value: 'notissued', label: 'Not Issued' }
  ];

  rows: TcStudentRow[] = [];
  total = 0;
  page = 1;
  limit = 10;
  /** cursors[i] = the `after` cursor that loads page i + 1 (keyset pagination). */
  private cursors: string[] = [''];
  summary = EMPTY_SUMMARY;
  canIssue = false;
  loading = true;
  loadError = '';

  // Issue TC
  issueRow: TcStudentRow | null = null;
  draft: TcIssueDraft | null = null;
  draftError = '';
  dateOfLeaving = '';
  reason: TcReason = 'transfer';
  promotion = 'yes';
  conduct: TcConduct = 'good';
  remarks = '';
  issueErrors: Record<string, string> = {};
  issueError = '';
  feesPending: { message: string; canOverride: boolean } | null = null;
  acknowledgeFees = false;
  isClick = false;
  private issueKey = '';
  readonly maxDate = todayKey();
  readonly reasonOptions: DdOption[] = [
    { value: 'transfer', label: "Parent's Transfer" }, { value: 'relocation', label: 'Relocation' },
    { value: 'admission', label: 'Admission Elsewhere' }, { value: 'other', label: 'Other' }
  ];
  readonly conductOptions: DdOption[] = [
    { value: 'good', label: 'Good' }, { value: 'satisfactory', label: 'Satisfactory' }, { value: 'excellent', label: 'Excellent' }
  ];

  // Preview / print
  certificate: TcCertificate | null = null;
  previewOpen = false;
  previewLoading = false;
  previewError = '';

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: TransferCertificateService,
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

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.fetch();
  }

  onStatusChange(value: string): void {
    this.status = value as TcStatusFilter;
    this.fetch();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.fetch();
  }

  /** Prev/next only — each page's cursor is remembered, so going back is exact. */
  onPageChange(page: number): void {
    if (page < 1 || page > this.cursors.length) return;
    this.loadPage(page);
  }

  /** Back to page 1 with the current filters. */
  fetch(): void {
    if (!this.session) return;
    this.cursors = [''];
    this.loadPage(1);
  }

  private loadPage(page: number): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.list(this.adminId, this.session, {
      classId: this.filter.classId, streamId: this.filter.streamId, sectionId: this.filter.sectionId,
      search: this.search, status: this.status
    }, this.cursors[page - 1], this.limit).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.page = page;
      this.cursors = this.cursors.slice(0, page);
      if (res.nextCursor) this.cursors.push(res.nextCursor);
      if (res.total != null) this.total = res.total;
      if (res.summary) this.summary = res.summary;
      this.canIssue = Boolean(res.canIssue);
      this.loading = false;
      this.cdr.markForCheck();
    }, (error) => {
      // A failed fetch is said out loud — never rendered as "no students".
      this.rows = [];
      this.loading = false;
      this.loadError = errorMessageOf(error, "Couldn't load students.");
      this.cdr.markForCheck();
    });
  }

  // ---- Issue TC ------------------------------------------------------------------------------

  openIssue(row: TcStudentRow): void {
    if (!this.canIssue || this.isClick) return;
    this.issueRow = row;
    this.dateOfLeaving = todayKey();
    this.reason = 'transfer';
    this.promotion = 'yes';
    this.conduct = 'good';
    this.remarks = '';
    this.issueErrors = {};
    this.issueError = '';
    this.feesPending = null;
    this.acknowledgeFees = false;
    this.issueKey = newIdempotencyKey();
    this.loadDraft();
  }

  closeIssue(): void {
    if (this.isClick) return;
    this.issueRow = null;
    this.draft = null;
  }

  onDateChange(value: string): void {
    this.dateOfLeaving = value;
    this.issueErrors = { ...this.issueErrors, dateOfLeaving: '' };
    // Working / present days run up to the leaving date.
    if (value) this.loadDraft();
  }

  get promotionOptions(): DdOption[] {
    const next = this.draft?.nextClassName;
    return [{ value: 'yes', label: next ? `Yes — to ${next}` : 'Yes' }, { value: 'no', label: 'No' }];
  }

  private loadDraft(): void {
    if (!this.issueRow) return;
    this.draftError = '';
    this.api.draft(this.adminId, this.session, this.issueRow.studentId, this.dateOfLeaving)
      .pipe(takeUntil(this.destroyed$)).subscribe((draft) => {
        this.draft = draft;
        this.cdr.markForCheck();
      }, (error) => {
        this.draftError = errorMessageOf(error, "Couldn't load this student's details.");
        this.cdr.markForCheck();
      });
  }

  issue(): void {
    const row = this.issueRow;
    if (!row || this.isClick) return;
    if (!this.dateOfLeaving) {
      this.issueErrors = { dateOfLeaving: 'Choose the date of issue / leaving.' };
      return;
    }
    if (this.feesPending && this.feesPending.canOverride && !this.acknowledgeFees) return;
    this.isClick = true;
    this.issueError = '';
    this.issueErrors = {};
    this.cdr.markForCheck();
    this.api.issue(this.adminId, this.session, row.studentId, {
      dateOfLeaving: this.dateOfLeaving,
      reasonForLeaving: this.reason,
      qualifiedForPromotion: this.promotion === 'yes',
      generalConduct: this.conduct,
      remarks: this.remarks.trim(),
      acknowledgeFeesPending: this.acknowledgeFees
    }, this.issueKey).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isClick = false;
      this.rows = this.rows.map((item) => item.studentId === res.row.studentId
        ? { ...item, status: res.row.status, tcId: res.row.tcId, dateOfLeaving: res.row.dateOfLeaving }
        : item);
      this.summary = { ...this.summary, issuedThisSession: this.summary.issuedThisSession + 1 };
      this.issueRow = null;
      this.draft = null;
      this.certificate = res.certificate;
      this.previewOpen = true;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.cdr.markForCheck();
    }, (error) => {
      this.isClick = false;
      const apiError = toApiError(error);
      if (apiError?.code === 'TC_FEES_PENDING') {
        this.feesPending = {
          message: apiError.message,
          canOverride: apiError.fields?.[0]?.code === 'TC_FEES_PENDING_OVERRIDABLE'
        };
      } else {
        const invalid = validationErrorsOf(error);
        this.issueErrors = invalid?.fields || {};
        this.issueError = invalid && Object.keys(invalid.fields).length ? '' : errorMessageOf(error, "Couldn't issue the TC.");
        // A failed request released the key server-side; a fresh one keeps retries clean.
        this.issueKey = newIdempotencyKey();
      }
      this.cdr.markForCheck();
    });
  }

  // ---- Preview / print -----------------------------------------------------------------------

  openPreview(row: TcStudentRow): void {
    if (!row.tcId) return;
    this.previewOpen = true;
    this.previewLoading = true;
    this.previewError = '';
    this.certificate = null;
    this.api.get(this.adminId, row.tcId).pipe(takeUntil(this.destroyed$)).subscribe((certificate) => {
      this.certificate = certificate;
      this.previewLoading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.previewLoading = false;
      this.previewError = errorMessageOf(error, "Couldn't load the certificate.");
      this.cdr.markForCheck();
    });
  }

  closePreview(): void {
    this.previewOpen = false;
    this.certificate = null;
  }

  print(): void {
    window.print();
  }

  avatarStyle(index: number): Record<string, string> {
    return index % 2
      ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
      : { background: 'var(--slate-soft)', color: 'var(--slate)' };
  }

  trackByStudent = (_index: number, row: TcStudentRow): string => row.studentId;
}
