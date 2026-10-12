/**
 * Fees — collect fees per student across the session (the day-to-day collection screen).
 *
 * Reference: docs/schoolzen-planning/v1/fees/fees.html
 *
 * Toolbar: search + Generate Report (row 1), Class → Stream → Group (row 2). Every money
 * figure on a row comes from the server's ledger. Collect: the modal shows the due split by
 * year (arrears listed separately) and the server clears the OLDEST dues first; the amount is
 * capped at the total due here AND enforced server-side. Collect needs 'fees-collect'
 * (`canCollect`), the concession pencil 'fees-waiver' (`canWaive`).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { FeesService } from 'src/app/shared/services/fees/fees.service';
import { FeeStatementService } from 'src/app/shared/services/fees/fee-statement.service';
import {
  FeeReceipt, FeeRow, FeesSummary, PaymentMode, ReportPeriod, PAYMENT_MODE_LABELS
} from 'src/app/shared/models/fees/fees.model';
import { CascadeFilterValue, EMPTY_CASCADE, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { arrearNote, compactRupees, rupees, shortDate, statusTagClass } from '../fees-format';
import { ExportFormat, ExportRow, exportRows } from '../fees-export';

const PAGE_SIZE = 25;
const EMPTY_SUMMARY: FeesSummary = { collectedThisMonth: 0, fullyPaid: 0, hasArrears: 0, partial: 0, unpaid: 0 };

export const PERIOD_OPTIONS: DdOption[] = [
  { value: 'day', label: 'Day-wise (Today)' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '15d', label: 'Last 15 Days' },
  { value: '1m', label: 'Last 1 Month' },
  { value: '3m', label: 'Last 3 Months' },
  { value: '6m', label: 'Last 6 Months' },
  { value: 'session', label: 'Full Academic Session' }
];

@Component({
  selector: 'app-fees',
  templateUrl: './fees.component.html',
  styleUrls: ['./fees.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeesComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  options: StudentFilterOptions | null = null;
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';

  rows: FeeRow[] = [];
  nextCursor: string | null = null;
  summary: FeesSummary = EMPTY_SUMMARY;
  canCollect = false;
  canWaive = false;
  loading = true;
  loadingMore = false;
  loadError = '';
  selected = new Set<string>();

  // Collect
  payRow: FeeRow | null = null;
  payAmount = '';
  payMode: PaymentMode = 'cash';
  payError = '';
  isClick = false;
  collectingStudentId = '';
  private payKey = '';
  readonly modeOptions: DdOption[] = [
    { value: 'cash', label: 'Cash' }, { value: 'online', label: 'Online' }, { value: 'cheque', label: 'Cheque' }
  ];

  // Receipt
  receipt: FeeReceipt | null = null;

  // Concession (waiver)
  concessionRow: FeeRow | null = null;
  concessionAmount = '';
  concessionReason = '';
  concessionErrors: Record<string, string> = {};
  concessionError = '';
  isConcessionClick = false;
  private concessionKey = '';

  // Reports
  reportOpen = false;
  reportPeriod: ReportPeriod = 'session';
  reportFormat: ExportFormat = 'excel';
  reportError = '';
  isReportClick = false;
  readonly periodOptions = PERIOD_OPTIONS;
  studentReportRow: FeeRow | null = null;
  studentReportFormat: ExportFormat = 'excel';
  studentReportError = '';
  isStudentReportClick = false;

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: FeesService,
    private statementApi: FeeStatementService,
    private optionsService: StudentOptionsService,
    private shellContext: ShellContextService,
    private adminAuthService: AdminAuthService,
    private router: Router,
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
        if (!session) return;
        this.fetch();
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

  private get filters(): { classId: string; streamId: string; groupId: string; search: string } {
    return { classId: this.filter.classId, streamId: this.filter.streamId, groupId: this.filter.groupId, search: this.search };
  }

  fetch(): void {
    if (!this.session) return;
    this.loading = true;
    this.loadError = '';
    this.selected.clear();
    this.cdr.markForCheck();
    this.api.list(this.adminId, this.session, this.filters, '', PAGE_SIZE).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.nextCursor = res.nextCursor;
      this.summary = res.summary || EMPTY_SUMMARY;
      this.canCollect = Boolean(res.canCollect);
      this.canWaive = Boolean(res.canWaive);
      this.loading = false;
      this.cdr.markForCheck();
    }, (error) => {
      // A failed fetch is said out loud — never rendered as "no students".
      this.rows = [];
      this.nextCursor = null;
      this.loading = false;
      this.loadError = errorMessageOf(error, "Couldn't load fees.");
      this.cdr.markForCheck();
    });
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    this.api.list(this.adminId, this.session, this.filters, this.nextCursor, PAGE_SIZE).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = [...this.rows, ...(res.rows || [])];
      this.nextCursor = res.nextCursor;
      this.loadingMore = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.loadingMore = false;
      this.snackBar.open(errorMessageOf(error, "Couldn't load more students."), 'Close', { duration: 3000 });
      this.cdr.markForCheck();
    });
  }

  // --- display --------------------------------------------------------------------------

  money(value: number | undefined): string {
    return rupees(value ?? 0);
  }

  compact(value: number): string {
    return compactRupees(value);
  }

  tagClass(row: FeeRow): string {
    return statusTagClass(row.status);
  }

  note(row: FeeRow): string {
    return arrearNote(row.arrears);
  }

  // --- selection ------------------------------------------------------------------------

  isSelected(row: FeeRow): boolean {
    return this.selected.has(row.studentId);
  }

  toggleRow(row: FeeRow, checked: boolean): void {
    if (checked) this.selected.add(row.studentId);
    else this.selected.delete(row.studentId);
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row.studentId));
  }

  toggleAll(checked: boolean): void {
    this.rows.forEach((row) => (checked ? this.selected.add(row.studentId) : this.selected.delete(row.studentId)));
  }

  // --- Collect ----------------------------------------------------------------------------

  canCollectRow(row: FeeRow): boolean {
    return this.canCollect && row.hasRecord && (row.due || 0) > 0;
  }

  openCollect(row: FeeRow): void {
    if (!this.canCollectRow(row) || this.isClick) return;
    this.payRow = row;
    this.payAmount = '';
    this.payMode = 'cash';
    this.payError = '';
    // One key per form-open: a retried submit of THIS payment is a no-op server-side.
    this.payKey = newIdempotencyKey();
  }

  closeCollect(): void {
    if (this.isClick) return;
    this.payRow = null;
  }

  /** The cap the server enforces too (PAYMENT_EXCEEDS_DUE). */
  get payMax(): number {
    return this.payRow?.due || 0;
  }

  get payInvalid(): string {
    if (String(this.payAmount).trim() === '') return '';
    const amount = Number(this.payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return 'Enter a valid payment amount.';
    if (amount > this.payMax) return `This amount is more than the ${rupees(this.payMax)} still due.`;
    return '';
  }

  get canSubmitPay(): boolean {
    return !this.isClick && String(this.payAmount).trim() !== '' && !this.payInvalid;
  }

  collect(): void {
    if (this.isClick || !this.payRow) return;
    if (!this.canSubmitPay) {
      this.payError = this.payInvalid || 'Enter a valid payment amount.';
      this.cdr.markForCheck();
      return;
    }
    const row = this.payRow;
    this.isClick = true;
    this.collectingStudentId = row.studentId;
    this.payError = '';
    this.api.collect(this.adminId, this.session, row.studentId, Number(this.payAmount), this.payMode, this.payKey)
      .pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.isClick = false;
        this.collectingStudentId = '';
        this.payRow = null;
        this.replaceRow(res.row);
        this.receipt = res.receipt;
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.cdr.markForCheck();
      }, (error) => {
        this.isClick = false;
        this.collectingStudentId = '';
        const validation = validationErrorsOf(error);
        this.payError = (validation && validation.fields['amount']) || errorMessageOf(error, "Couldn't record the payment.");
        this.cdr.markForCheck();
      });
  }

  private replaceRow(row: FeeRow | null): void {
    if (!row) return;
    this.rows = this.rows.map((item) => (item.studentId === row.studentId ? row : item));
  }

  closeReceipt(): void {
    this.receipt = null;
  }

  printReceipt(): void {
    if (this.receipt) window.print();
  }

  modeLabel(mode: string): string {
    return PAYMENT_MODE_LABELS[mode] || mode;
  }

  // --- Concession (waiver) ---------------------------------------------------------------

  openConcession(row: FeeRow): void {
    if (!this.canWaive || !row.hasRecord) return;
    this.concessionRow = row;
    this.concessionAmount = String(row.concession ?? 0);
    this.concessionReason = row.concessionReason || '';
    this.concessionErrors = {};
    this.concessionError = '';
    this.concessionKey = newIdempotencyKey();
  }

  closeConcession(): void {
    if (this.isConcessionClick) return;
    this.concessionRow = null;
  }

  saveConcession(): void {
    if (this.isConcessionClick || !this.concessionRow) return;
    const errors: Record<string, string> = {};
    const amount = Number(this.concessionAmount);
    if (String(this.concessionAmount).trim() === '' || !Number.isFinite(amount) || amount < 0) errors['amount'] = 'Enter a valid amount.';
    else if (amount > (this.concessionRow.gross || 0)) errors['amount'] = `Concession can't be more than the total fee of ${rupees(this.concessionRow.gross)}.`;
    if (this.concessionReason.trim().length < 3) errors['reason'] = 'Give a reason for this concession.';
    this.concessionErrors = errors;
    if (Object.keys(errors).length) return;

    this.isConcessionClick = true;
    this.concessionError = '';
    this.api.updateConcession(this.adminId, this.session, this.concessionRow.studentId, amount, this.concessionReason.trim(), this.concessionKey)
      .pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.isConcessionClick = false;
        this.concessionRow = null;
        this.replaceRow(res.row);
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.cdr.markForCheck();
      }, (error) => {
        this.isConcessionClick = false;
        const validation = validationErrorsOf(error);
        if (validation && Object.keys(validation.fields).length) this.concessionErrors = validation.fields;
        else this.concessionError = errorMessageOf(error, "Couldn't update the concession.");
        this.cdr.markForCheck();
      });
  }

  // --- Statement ---------------------------------------------------------------------------

  openStatement(row: FeeRow): void {
    this.router.navigate(['/v2/fees/fee-statement', row.studentId]);
  }

  // --- Reports -----------------------------------------------------------------------------

  openReport(): void {
    if (!this.selected.size) return;
    this.reportPeriod = 'session';
    this.reportError = '';
    this.reportOpen = true;
  }

  closeReport(): void {
    if (this.isReportClick) return;
    this.reportOpen = false;
  }

  get reportScopeNote(): string {
    const count = this.selected.size;
    return `${count} student${count === 1 ? '' : 's'} selected — the report covers just them.`;
  }

  private exportRow(row: FeeRow, withPeriod: boolean): ExportRow {
    const out: ExportRow = {
      'Student': row.name,
      'Admission No.': row.admissionNo ?? '',
      'Class': row.className || '',
      'Stream': row.streamName || 'N/A',
      'Group': row.groupName || 'N/A',
      'Concession': row.concession ?? 0,
      'Paid Fee': row.paid ?? 0,
      'Due Fee': row.due ?? 0,
      'Total Fee': row.total ?? 0,
      'Status': row.statusLabel || 'No fee structure',
      'Collected By': row.collectedBy || ''
    };
    if (withPeriod) out['Collected (Period)'] = row.collectedInPeriod ?? 0;
    return out;
  }

  downloadReport(): void {
    if (this.isReportClick) return;
    this.isReportClick = true;
    this.reportError = '';
    const periodLabel = PERIOD_OPTIONS.find((item) => item.value === this.reportPeriod)?.label || '';
    this.api.report(this.adminId, this.session, this.filters, this.reportPeriod, [...this.selected])
      .pipe(takeUntil(this.destroyed$)).subscribe(async (res) => {
        const fileName = `Fee-Report_${periodLabel.replace(/\s+/g, '-')}_${new Date().toISOString().slice(0, 10)}`;
        try {
          const done = await exportRows([{ name: 'Fee Report', rows: res.rows.map((row) => this.exportRow(row, true)) }], fileName, this.reportFormat);
          if (!done) this.reportError = 'Nothing to export — no rows match.';
          else this.reportOpen = false;
        } catch (error) {
          this.reportError = "Couldn't generate the document — please try again.";
        }
        this.isReportClick = false;
        this.cdr.markForCheck();
      }, (error) => {
        this.isReportClick = false;
        this.reportError = errorMessageOf(error, "Couldn't build the report.");
        this.cdr.markForCheck();
      });
  }

  openStudentReport(row: FeeRow): void {
    this.studentReportRow = row;
    this.studentReportError = '';
  }

  closeStudentReport(): void {
    if (this.isStudentReportClick) return;
    this.studentReportRow = null;
  }

  /** One student's full detail — dues, particulars and payment history — from the Statement read. */
  downloadStudentReport(): void {
    const row = this.studentReportRow;
    if (!row || this.isStudentReportClick) return;
    this.isStudentReportClick = true;
    this.studentReportError = '';
    this.statementApi.get(this.adminId, this.session, row.studentId).pipe(takeUntil(this.destroyed$)).subscribe(async (statement) => {
      const sheets = [
        { name: 'Summary', rows: [this.exportRow(row, false)] },
        { name: 'Previous Year Dues', rows: statement.previous.map((item) => ({
          'Session': item.sessionShort, 'Class': item.className || '', 'Total Fee': item.total, 'Paid': item.paid,
          'Remaining Due': item.due, 'Status': item.statusLabel || '—'
        })) },
        { name: 'Particulars', rows: statement.particulars.map((item) => ({ 'Particular': item.name, 'Amount': item.amount })) },
        { name: 'Payment History', rows: statement.payments.map((item) => ({
          'Receipt No.': item.receiptNo, 'Amount': item.amount, 'Payment Date': shortDate(item.date),
          'Mode': this.modeLabel(item.mode), 'Collected By': item.collectedBy || ''
        })) }
      ];
      try {
        await exportRows(sheets, `Fee-Report_${row.name.replace(/\s+/g, '-')}`, this.studentReportFormat);
        this.studentReportRow = null;
      } catch (error) {
        this.studentReportError = "Couldn't generate the document — please try again.";
      }
      this.isStudentReportClick = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.isStudentReportClick = false;
      this.studentReportError = errorMessageOf(error, "Couldn't load this student's fee detail.");
      this.cdr.markForCheck();
    });
  }

  trackByStudent = (_index: number, row: FeeRow): string => row.studentId;
}
