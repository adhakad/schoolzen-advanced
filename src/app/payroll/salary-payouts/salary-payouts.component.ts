/**
 * Salary Payouts — record and track payments against LOCKED payroll only.
 *
 * Reference: docs/schoolzen-planning/v1/payroll/salary-payouts.html
 *
 * The API returns locked runs only — a draft can never appear here. Paid / due / status are
 * derived from the payments on every read: a recorded payment stays Pending ("awaiting
 * confirmation") until the employee confirms it, and is never counted as paid before that.
 * Action: View Slip once fully settled, Record Payment while anything is still due.
 *
 * Recording and slips need the 'payroll-payout' permission (enforced by the API); without
 * the edit grant (`canEdit`) the page is read-only.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SalaryPayoutsService } from 'src/app/shared/services/payroll/salary-payouts.service';
import {
  ConfirmationStatus, PAYMENT_MODE_LABELS, PaymentMode, PayoutRow, PayoutStatus, SalarySlip
} from 'src/app/shared/models/payroll/salary-payout.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { StaffCascadeValue } from '../staff-cascade-filter/staff-cascade-filter.component';
import {
  compactRupees, currentMonthKey, monthName, monthOptions, rupees, shortDate, splitMonth, todayKey
} from '../payroll-format';

const STATUS_LABELS: Record<PayoutStatus, string> = { full: 'Fully Paid', partial: 'Partially Paid', unpaid: 'Unpaid' };
const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = { confirmed: 'Confirmed', pending: 'Pending', disputed: 'Disputed', expired: 'Expired' };

interface PaymentForm {
  amount: string;
  date: string;
  mode: PaymentMode | '';
  reference: string;
}

@Component({
  selector: 'app-salary-payouts',
  templateUrl: './salary-payouts.component.html',
  styleUrls: ['./salary-payouts.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SalaryPayoutsComponent implements OnInit, OnDestroy {
  adminId = '';
  filter: StaffCascadeValue = { departmentId: '', designationId: '' };
  mode: PaymentMode | '' = '';
  status: PayoutStatus | '' = '';
  month = currentMonthKey();
  search = '';

  readonly modeOptions: DdOption[] = [
    { value: '', label: 'Any mode' },
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' }
  ];
  readonly statusOptions: DdOption[] = [
    { value: '', label: 'Any status' },
    { value: 'full', label: 'Fully Paid' },
    { value: 'partial', label: 'Partially Paid' },
    { value: 'unpaid', label: 'Unpaid' }
  ];
  readonly paymentModeOptions: DdOption[] = this.modeOptions.slice(1);
  monthMenu: DdOption[] = monthOptions(this.month);

  rows: PayoutRow[] = [];
  total = 0;
  nextCursor: string | null = null;
  readonly limit = 50;
  summary = { disbursed: 0, full: 0, partial: 0, unpaid: 0 };
  canEdit = false;
  loading = true;
  loadingMore = false;
  loadError = '';

  // Record Payment
  payRow: PayoutRow | null = null;
  payForm: PaymentForm = { amount: '', date: '', mode: '', reference: '' };
  payErrors: Record<string, string> = {};
  payError = '';
  paying = false;
  private payKey = '';

  // Slip
  slipRow: PayoutRow | null = null;
  slip: SalarySlip | null = null;
  slipLoading = false;
  slipError = '';

  // Dispute reason popover
  disputeOpenFor = '';

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: SalaryPayoutsService,
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
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.fetch();
    });
    this.fetch();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- filters --------------------------------------------------------------------------

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: StaffCascadeValue): void {
    this.filter = value;
    this.fetch();
  }

  onModeChange(value: string): void {
    this.mode = value as PaymentMode | '';
    this.fetch();
  }

  onStatusChange(value: string): void {
    this.status = value as PayoutStatus | '';
    this.fetch();
  }

  onMonthChange(value: string): void {
    this.month = value;
    this.monthMenu = monthOptions(value);
    this.fetch();
  }

  get monthLabel(): string {
    return monthName(this.month);
  }

  // --- list -----------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.load('', (rows) => { this.rows = rows; });
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    this.load(this.nextCursor, (rows) => { this.rows = [...this.rows, ...rows]; });
  }

  private load(after: string, apply: (rows: PayoutRow[]) => void): void {
    const { year, month } = splitMonth(this.month);
    this.api.list(this.adminId, { ...this.filter, search: this.search, mode: this.mode, status: this.status, year, month, after, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        apply(res.rows || []);
        this.total = res.total || 0;
        this.nextCursor = res.nextCursor;
        this.summary = res.summary || this.summary;
        this.canEdit = Boolean(res.canEdit);
        this.loading = false;
        this.loadingMore = false;
        this.cdr.markForCheck();
      }, (error) => {
        if (!after) this.rows = [];
        this.loading = false;
        this.loadingMore = false;
        this.loadError = errorMessageOf(error, "Couldn't load payouts for this month.");
        this.cdr.markForCheck();
      });
  }

  // --- display --------------------------------------------------------------------------

  money(value: number): string {
    return rupees(value);
  }

  compact(value: number): string {
    return compactRupees(value);
  }

  date(value: string | null | undefined): string {
    return shortDate(value);
  }

  statusLabel(status: PayoutStatus): string {
    return STATUS_LABELS[status];
  }

  confirmationLabel(status: ConfirmationStatus): string {
    return CONFIRMATION_LABELS[status];
  }

  modeLabel(mode: PaymentMode): string {
    return PAYMENT_MODE_LABELS[mode];
  }

  toggleDispute(row: PayoutRow): void {
    this.disputeOpenFor = this.disputeOpenFor === row._id ? '' : row._id;
  }

  // --- Record Payment -------------------------------------------------------------------

  openPay(row: PayoutRow): void {
    this.payRow = row;
    this.payForm = { amount: String(row.due), date: todayKey(), mode: '', reference: '' };
    this.payErrors = {};
    this.payError = '';
    // One key per modal-open: a retry or double click of this submission replays, never doubles.
    this.payKey = newIdempotencyKey();
  }

  closePay(): void {
    if (this.paying) return;
    this.payRow = null;
  }

  get dueNote(): string {
    if (!this.payRow) return '';
    return this.payRow.paid > 0 || this.payRow.pending > 0
      ? `${rupees(this.payRow.due)} still due for this month.`
      : 'Full amount is due for this month.';
  }

  get referenceRequired(): boolean {
    return this.payForm.mode === 'bank' || this.payForm.mode === 'upi';
  }

  private validatePay(): boolean {
    const errors: Record<string, string> = {};
    const amount = Number(this.payForm.amount);
    if (String(this.payForm.amount).trim() === '' || !Number.isFinite(amount) || amount <= 0) errors['amountPaid'] = 'Enter a valid payment amount.';
    else if (this.payRow && amount > this.payRow.due) errors['amountPaid'] = `This payment exceeds the remaining balance of ${rupees(this.payRow.due)}!`;
    if (!this.payForm.date) errors['date'] = 'Choose a valid date.';
    if (!this.payForm.mode) errors['mode'] = 'Choose a payment mode.';
    if (this.referenceRequired && !this.payForm.reference.trim()) errors['reference'] = 'Enter a reference/UTR number for this payment mode.';
    this.payErrors = errors;
    return !Object.keys(errors).length;
  }

  submitPay(): void {
    if (this.paying || !this.payRow) return;
    this.payError = '';
    if (!this.validatePay()) {
      this.cdr.markForCheck();
      return;
    }
    this.paying = true;
    this.api.recordPayment(this.payRow._id, {
      adminId: this.adminId,
      amountPaid: Number(this.payForm.amount),
      mode: this.payForm.mode as PaymentMode,
      reference: this.payForm.reference.trim(),
      date: this.payForm.date
    }, this.payKey).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.paying = false;
      this.payRow = null;
      this.rows = this.rows.map((row) => (row._id === res.row._id ? res.row : row));
      this.snackBar.open(res.message, 'Close', { duration: 3500 });
      this.cdr.markForCheck();
    }, (error) => {
      this.paying = false;
      const validation = validationErrorsOf(error);
      if (validation && Object.keys(validation.fields).length) this.payErrors = validation.fields;
      else this.payError = errorMessageOf(error, "Couldn't record this payment.");
      this.cdr.markForCheck();
    });
  }

  // --- Slip -----------------------------------------------------------------------------

  openSlip(row: PayoutRow): void {
    this.slipRow = row;
    this.slip = null;
    this.slipError = '';
    this.slipLoading = true;
    this.api.slip(this.adminId, row._id).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.slip = res.slip;
      this.slipLoading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.slipLoading = false;
      this.slipError = errorMessageOf(error, "Couldn't load the salary slip.");
      this.cdr.markForCheck();
    });
  }

  closeSlip(): void {
    this.slipRow = null;
    this.slip = null;
  }

  print(): void {
    if (this.slip) window.print();
  }

  trackById = (_index: number, row: { _id: string }): string => row._id;
}
