/**
 * Generate Payroll — run payroll for the month, then lock it once it's correct. Locked rows
 * are what Salary Payouts shows.
 *
 * Reference: docs/schoolzen-planning/v1/payroll/generate-payroll.html
 *
 * Toolbar: row 1 search + "Generate for Selected" (disabled until rows are checked); row 2
 * Department → Designation, Status (All/Locked/Draft/Pending), month. The action set is
 * decided by status — exactly one set per row, from the API's `actions`:
 *   pending → Generate (play)
 *   draft   → Regenerate + Lock (both confirm first)
 *   locked  → View slip + Unlock (danger; confirms, since it undoes a final state)
 *
 * Every write needs the 'payroll-generate' permission (enforced by the API); without the
 * edit grant (`canEdit`) only View slip remains.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { GeneratePayrollService } from 'src/app/shared/services/payroll/generate-payroll.service';
import {
  BulkGenerateJobResult, PayrollRunAction, PayrollRunRow, PayrollRunStatus
} from 'src/app/shared/models/payroll/payroll-run.model';
import { SkippedRow } from 'src/app/shared/models/payroll/assign-salary.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';
import { StaffCascadeValue } from '../staff-cascade-filter/staff-cascade-filter.component';
import {
  compactRupees, currentMonthKey, minusRupees, monthName, rupees, splitMonth
} from '../payroll-format';

type ConfirmKind = 'lock' | 'unlock' | 'regenerate';

const CONFIRM_COPY: Record<ConfirmKind, { title: string; heading: (name: string) => string; note: string; label: string; danger: boolean }> = {
  lock: {
    title: 'Lock Payslip',
    heading: (name) => `Lock ${name}'s payslip?`,
    note: "Once locked it can't be regenerated — unlocking later needs a separate confirmation.",
    label: 'Lock',
    danger: false
  },
  unlock: {
    title: 'Unlock Payslip',
    heading: (name) => `Unlock ${name}'s payslip?`,
    note: 'This may already be paid out — unlocking lets it be regenerated, which can change the net amount.',
    label: 'Unlock',
    danger: true
  },
  regenerate: {
    title: 'Regenerate Payslip',
    heading: (name) => `Regenerate ${name}'s payslip?`,
    note: "Recalculates fresh from this month's attendance — any manual correction on the current draft is lost.",
    label: 'Regenerate',
    danger: false
  }
};

@Component({
  selector: 'app-generate-payroll',
  templateUrl: './generate-payroll.component.html',
  styleUrls: ['./generate-payroll.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeneratePayrollComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  filter: StaffCascadeValue = { departmentId: '', designationId: '' };
  status: PayrollRunStatus | '' = '';
  month = currentMonthKey();
  search = '';

  readonly statusOptions: DdOption[] = [
    { value: '', label: 'All status' },
    { value: 'locked', label: 'Locked' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' }
  ];

  rows: PayrollRunRow[] = [];
  total = 0;
  nextCursor: string | null = null;
  readonly limit = 50;
  summary = { totalPayroll: 0, locked: 0, draft: 0, totalStaff: 0 };
  canEdit = false;
  loading = true;
  loadingMore = false;
  loadError = '';
  /** The mid-month notice from the last generate — never a block. */
  warning = '';
  selected = new Set<string>();
  /** staffIds with a request in flight (the double-submit guard, per row). */
  busy = new Set<string>();
  bulkBusy = false;

  // confirm (lock / unlock / regenerate)
  confirmKind: ConfirmKind | null = null;
  confirmRow: PayrollRunRow | null = null;
  confirmError = '';

  // slip (locked)
  slipRow: PayrollRunRow | null = null;

  // bulk result
  resultOpen = false;
  resultSummary = '';
  resultSkipped: SkippedRow[] = [];

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: GeneratePayrollService,
    private jobs: JobStatusService,
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
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.fetch();
    });
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      this.cdr.markForCheck();
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

  onStatusChange(value: string): void {
    this.status = value as PayrollRunStatus | '';
    this.fetch();
  }

  onMonthChange(value: string): void {
    this.month = value;
    this.warning = '';
    this.fetch();
  }

  get monthLabel(): string {
    return monthName(this.month);
  }

  // --- list -----------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.selected.clear();
    this.cdr.markForCheck();
    this.load('', (res) => {
      this.rows = res.rows || [];
    });
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    this.load(this.nextCursor, (res) => {
      this.rows = [...this.rows, ...(res.rows || [])];
    });
  }

  private load(after: string, apply: (res: { rows: PayrollRunRow[] }) => void): void {
    const { year, month } = splitMonth(this.month);
    this.api.list(this.adminId, { ...this.filter, search: this.search, status: this.status, year, month, after, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        apply(res);
        this.total = res.total || 0;
        this.nextCursor = res.nextCursor;
        this.summary = res.summary || this.summary;
        this.canEdit = Boolean(res.canEdit);
        this.loading = false;
        this.loadingMore = false;
        this.cdr.markForCheck();
      }, (error) => {
        // A failed fetch is said out loud — never rendered as "nobody to pay".
        if (!after) this.rows = [];
        this.loading = false;
        this.loadingMore = false;
        this.loadError = errorMessageOf(error, "Couldn't load payroll for this month.");
        this.cdr.markForCheck();
      });
  }

  // --- display --------------------------------------------------------------------------

  initials(name: string): string {
    return initialsOf(name);
  }

  gradient(row: PayrollRunRow): string {
    return avatarGradient(row.staffId);
  }

  money(value: number | null): string {
    return rupees(value);
  }

  minus(value: number | null): string {
    return minusRupees(value);
  }

  compact(value: number): string {
    return compactRupees(value);
  }

  statusLabel(status: PayrollRunStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  has(row: PayrollRunRow, action: PayrollRunAction): boolean {
    return row.actions.includes(action);
  }

  // --- selection ------------------------------------------------------------------------

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row.staffId));
  }

  toggleAll(): void {
    if (this.allSelected) this.selected.clear();
    else this.rows.forEach((row) => this.selected.add(row.staffId));
  }

  toggleRow(staffId: string): void {
    if (this.selected.has(staffId)) this.selected.delete(staffId);
    else this.selected.add(staffId);
  }

  // --- row actions ----------------------------------------------------------------------

  private replaceRow(row: PayrollRunRow): void {
    this.rows = this.rows.map((current) => (current.staffId === row.staffId ? { ...current, ...row } : current));
  }

  /** Pending → Generate, straight away (no confirm, per the reference). */
  generate(row: PayrollRunRow): void {
    this.runGenerate(row, () => undefined);
  }

  private runGenerate(row: PayrollRunRow, after: () => void): void {
    if (this.busy.has(row.staffId)) return;
    this.busy.add(row.staffId);
    const { year, month } = splitMonth(this.month);
    this.api.generate({ adminId: this.adminId, staffId: row.staffId, year, month }, newIdempotencyKey())
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.busy.delete(row.staffId);
        this.replaceRow(res.row);
        this.warning = res.warning || '';
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        after();
        this.refreshSummary();
      }, (error) => {
        this.busy.delete(row.staffId);
        this.confirmError = errorMessageOf(error, "Couldn't generate this payslip.");
        if (!this.confirmKind) this.snackBar.open(this.confirmError, 'Close', { duration: 5000 });
        this.cdr.markForCheck();
      });
  }

  openConfirm(kind: ConfirmKind, row: PayrollRunRow): void {
    this.confirmKind = kind;
    this.confirmRow = row;
    this.confirmError = '';
  }

  closeConfirm(): void {
    if (this.confirmRow && this.busy.has(this.confirmRow.staffId)) return;
    this.confirmKind = null;
    this.confirmRow = null;
  }

  get confirmCopy() {
    return this.confirmKind ? CONFIRM_COPY[this.confirmKind] : null;
  }

  get confirmHeading(): string {
    return this.confirmCopy && this.confirmRow ? this.confirmCopy.heading(this.confirmRow.name) : '';
  }

  applyConfirm(): void {
    const row = this.confirmRow;
    const kind = this.confirmKind;
    if (!row || !kind || this.busy.has(row.staffId)) return;
    this.confirmError = '';
    const close = () => {
      this.confirmKind = null;
      this.confirmRow = null;
      this.cdr.markForCheck();
    };
    if (kind === 'regenerate') {
      this.runGenerate(row, close);
      return;
    }
    if (!row._id) return;
    this.busy.add(row.staffId);
    const request = kind === 'lock'
      ? this.api.lock(this.adminId, row._id, newIdempotencyKey())
      : this.api.unlock(this.adminId, row._id, newIdempotencyKey());
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.busy.delete(row.staffId);
      this.replaceRow(res.row);
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      close();
      this.refreshSummary();
    }, (error) => {
      this.busy.delete(row.staffId);
      this.confirmError = errorMessageOf(error, kind === 'lock' ? "Couldn't lock this payslip." : "Couldn't unlock this payslip.");
      this.cdr.markForCheck();
    });
  }

  /** The side card counts change with every action — re-read them (rows stay in place). */
  private refreshSummary(): void {
    const { year, month } = splitMonth(this.month);
    this.api.list(this.adminId, { ...this.filter, search: this.search, status: '', year, month, after: '', limit: 1 })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.summary = res.summary || this.summary;
        this.cdr.markForCheck();
      }, () => this.cdr.markForCheck());
  }

  // --- slip -----------------------------------------------------------------------------

  openSlip(row: PayrollRunRow): void {
    this.slipRow = row;
  }

  closeSlip(): void {
    this.slipRow = null;
  }

  print(): void {
    window.print();
  }

  // --- bulk -----------------------------------------------------------------------------

  generateSelected(): void {
    if (!this.selected.size || this.bulkBusy) return;
    this.bulkBusy = true;
    const { year, month } = splitMonth(this.month);
    this.api.bulkGenerate({ adminId: this.adminId, staffIds: [...this.selected], year, month }, newIdempotencyKey())
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        if (res.jobId) {
          this.snackBar.open(res.message, 'Close', { duration: 3000 });
          this.watchJob(res.jobId);
          return;
        }
        this.finishBulk(res.message, res.skipped || [], res.warning || '');
      }, (error) => {
        this.bulkBusy = false;
        this.snackBar.open(errorMessageOf(error, "Couldn't generate payroll."), 'Close', { duration: 5000 });
        this.cdr.markForCheck();
      });
  }

  private watchJob(jobId: string): void {
    this.jobs.watch<BulkGenerateJobResult>('payroll', this.adminId, jobId).pipe(takeUntil(this.destroyed$)).subscribe((status) => {
      if (status.state === 'completed' && status.result) {
        const result = status.result;
        this.finishBulk(`Payroll generated for ${result.generated} ${result.generated === 1 ? 'person' : 'people'}.`, result.skipped || [], result.warning || '');
      } else if (status.state === 'failed') {
        this.bulkBusy = false;
        this.snackBar.open(status.error || 'The job could not be completed. Please try again.', 'Close', { duration: 5000 });
        this.cdr.markForCheck();
      }
    }, () => {
      this.bulkBusy = false;
      this.snackBar.open("Couldn't follow the background job — refresh to see its result.", 'Close', { duration: 5000 });
      this.cdr.markForCheck();
    });
  }

  private finishBulk(message: string, skipped: SkippedRow[], warning: string): void {
    this.bulkBusy = false;
    this.warning = warning;
    if (skipped.length) {
      // Every skip by name, with its own reason — never just a count.
      this.resultSummary = message;
      this.resultSkipped = skipped;
      this.resultOpen = true;
    } else {
      this.snackBar.open(message, 'Close', { duration: 3500 });
    }
    this.fetch();
  }

  closeResult(): void {
    this.resultOpen = false;
  }

  trackByStaff = (_index: number, row: { staffId: string }): string => row.staffId;
}
