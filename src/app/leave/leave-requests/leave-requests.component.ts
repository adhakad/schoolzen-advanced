/**
 * Leave Requests — every leave request across staff and students, in one place.
 *
 * Reference: docs/schoolzen-planning/v1/leave/leave-requests.html
 *
 * Toolbar (this page's shape): row 1 search + Apply Leave; row 2 the shared Person Type
 * 6-column grid; row 3 Section + Leave Type + Status + month navigator.
 *
 * Each row shows ONLY the action its status allows (the server computes `actions`):
 * Pending → Approve / Reject, Approved → Take Back (hidden once completed), Rejected →
 * Delete. Row icons are disabled while any modal is open so a double-click can't stack two.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { LeaveRequestsService } from 'src/app/shared/services/leave/leave-requests.service';
import { LeaveTypesService } from 'src/app/shared/services/leave/leave-types.service';
import { LeaveFilterOptionsService } from 'src/app/shared/services/leave/leave-filter-options.service';
import {
  LeaveBalanceResponse, LeavePersonOption, LeavePersonType, LeaveRequestRow, LeaveRequestStatus, LeaveRowAction
} from 'src/app/shared/models/leave/leave-request.model';
import { LeaveType } from 'src/app/shared/models/leave/leave-type.model';
import {
  EMPTY_FILTER_OPTIONS, EMPTY_PERSON_FILTER, PersonFilterOptions, PersonFilterValue
} from 'src/app/shared/models/leave/person-filter.model';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';
import { currentMonthKey, MONTH_NAMES } from 'src/app/shared/utils/attendance-time.util';
import { toApiError, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const localDateKey = (date = new Date()): string =>
  date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');

const dateOf = (key: string): Date => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));

/** "05 Aug" / "05 Aug 2026". */
export const shortDate = (key: string, withYear = false): string => {
  if (!key) return '';
  const label = key.slice(8, 10) + ' ' + MONTHS_SHORT[Number(key.slice(5, 7)) - 1];
  return withYear ? label + ' ' + key.slice(0, 4) : label;
};

/**
 * The Apply form's day count preview: every non-Sunday day in the range. It ignores
 * school holidays the browser doesn't know, so it can only OVERestimate — the server's
 * count is the real one (leave/errors.md: the reference pattern for client previews).
 */
export const plannedDaysBetween = (from: string, to: string): number => {
  if (!from || !to || to < from) return 0;
  let count = 0;
  for (let day = dateOf(from); localDateKey(day) <= to; day.setDate(day.getDate() + 1)) {
    if (day.getDay() !== 0) count += 1;
  }
  return count;
};

interface CalCell {
  key: string;
  day: number | null;
  cls: string;
  disabled: boolean;
}

type PendingAction = { kind: 'approve' | 'force' | 'reject' | 'delete'; row: LeaveRequestRow } | null;

@Component({
  selector: 'app-leave-requests',
  templateUrl: './leave-requests.component.html',
  styleUrls: ['./leave-requests.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaveRequestsComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  today = localDateKey();

  // --- toolbar -------------------------------------------------------------------------
  filter: PersonFilterValue = { ...EMPTY_PERSON_FILTER };
  filterOptions: PersonFilterOptions = EMPTY_FILTER_OPTIONS;
  lookupError = '';
  search = '';
  leaveTypeId = '';
  status = '';
  month = currentMonthKey();
  leaveTypes: LeaveType[] = [];
  readonly statusOptions: readonly DdOption[] = [
    { value: '', label: 'Any status' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
    { value: 'Cancelled', label: 'Taken back' }
  ];

  // --- table ---------------------------------------------------------------------------
  loading = true;
  loadError = '';
  rows: LeaveRequestRow[] = [];
  total = 0;
  page = 1;
  limit = 10;
  truncated = false;
  summary: Record<LeaveRequestStatus, number> = { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };

  // --- approve / reject / delete confirm -----------------------------------------------
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: '' };
  private pending: PendingAction = null;
  private actionKey = '';
  acting = false;

  // --- take back -----------------------------------------------------------------------
  cancelOpen = false;
  cancelTarget: LeaveRequestRow | null = null;
  cancelReason = '';

  // --- apply ---------------------------------------------------------------------------
  applyOpen = false;
  applying = false;
  applyError = '';
  applyFieldErrors: Record<string, string> = {};
  applyPersonType: LeavePersonType = 'staff';
  applyPersonId = '';
  applyLeaveTypeId = '';
  applyFrom = '';
  applyTo = '';
  applyReason = '';
  peopleSearch = '';
  people: LeavePersonOption[] = [];
  applicableTypes: LeaveType[] = [];
  balance: LeaveBalanceResponse | null = null;
  calMonth = currentMonthKey();
  private applyKey = '';
  readonly applyPersonTypeOptions: readonly DdOption[] = [
    { value: 'staff', label: 'A staff member' },
    { value: 'student', label: 'A student' }
  ];

  readonly shortDate = shortDate;

  private search$ = new Subject<string>();
  private peopleSearch$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: LeaveRequestsService,
    private typesApi: LeaveTypesService,
    private filterOptionsApi: LeaveFilterOptionsService,
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
    this.loadLookups();
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.page = 1;
      this.fetch();
    });
    this.peopleSearch$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((term) => this.api.getPeople(this.adminId, this.session, this.applyPersonType, term)),
      takeUntil(this.destroyed$)
    ).subscribe((res) => {
      this.people = res.rows || [];
      this.cdr.markForCheck();
    }, () => {
      this.people = [];
      this.cdr.markForCheck();
    });
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      this.page = 1;
      this.fetch();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- lookups -------------------------------------------------------------------------

  loadLookups(): void {
    this.lookupError = '';
    this.filterOptionsApi.load(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.filterOptions = res.options;
      if (!res.complete) this.lookupError = "Couldn't load every filter.";
      this.cdr.markForCheck();
    });
    this.typesApi.getOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.leaveTypes = res.rows || [];
      this.cdr.markForCheck();
    }, () => {
      this.lookupError = "Couldn't load every filter.";
      this.cdr.markForCheck();
    });
  }

  get leaveTypeOptions(): DdOption[] {
    return [{ value: '', label: 'All leave types' }, ...this.leaveTypes.map((row) => ({ value: row._id, label: row.name }))];
  }

  // --- filters -------------------------------------------------------------------------

  onFilterChange(value: PersonFilterValue): void {
    this.filter = value;
    this.page = 1;
    this.fetch();
  }

  onLeaveTypeChange(value: string): void {
    this.leaveTypeId = value;
    this.page = 1;
    this.fetch();
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.page = 1;
    this.fetch();
  }

  onMonthChange(month: string): void {
    this.month = month;
    this.page = 1;
    this.fetch();
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onPageChange(page: number): void {
    this.page = page;
    this.fetch();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.page = 1;
    this.fetch();
  }

  // --- table ---------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.getRequests(this.adminId, {
      session: this.session,
      ...this.filter,
      search: this.search,
      leaveTypeId: this.leaveTypeId,
      status: this.status,
      month: this.month,
      page: this.page,
      limit: this.limit
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.total = res.total || 0;
      this.summary = res.summary || this.summary;
      this.truncated = res.truncated;
      this.loading = false;
      this.cdr.markForCheck();
    }, () => {
      this.rows = [];
      this.loadError = "Couldn't load leave requests.";
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  trackById = (_index: number, row: LeaveRequestRow): string => row._id;

  initials(name: string): string {
    return initialsOf(name);
  }

  avatarBg(row: LeaveRequestRow): string {
    return avatarGradient(row.personId);
  }

  can(row: LeaveRequestRow, action: LeaveRowAction): boolean {
    return row.actions.indexOf(action) !== -1;
  }

  /** Any modal open, or a request in flight — row icons wait. */
  get rowActionsLocked(): boolean {
    return this.confirmOpen || this.cancelOpen || this.applyOpen || this.acting;
  }

  rangeLabel(row: LeaveRequestRow): string {
    return row.fromDate === row.toDate ? shortDate(row.fromDate) : shortDate(row.fromDate) + ' – ' + shortDate(row.toDate);
  }

  personLine(row: LeaveRequestRow): string {
    const parts = [row.personType === 'staff' ? (row.code || row.sub) : row.sub, row.personType === 'staff' ? 'Staff' : 'Student'];
    if (row.balance && row.status === 'Pending') parts.push(row.balance.remaining + ' days left');
    return parts.filter(Boolean).join(' · ');
  }

  statusLabel(status: LeaveRequestStatus): string {
    return status === 'Cancelled' ? 'Taken back' : status;
  }

  // --- approve / reject / delete -------------------------------------------------------

  onApprove(row: LeaveRequestRow): void {
    if (this.rowActionsLocked) return;
    this.openConfirm({ kind: 'approve', row }, {
      title: 'Approve Leave',
      message: 'Approve ' + row.days + ' day(s) of ' + (row.leaveTypeName || 'leave') + ' for ' + row.name + '? '
        + shortDate(row.fromDate, true) + ' to ' + shortDate(row.toDate, true) + ' will be marked as leave on the attendance register.',
      confirmLabel: 'Approve',
      variant: 'neutral',
      scopeNote: row.balance ? row.balance.remaining + ' of ' + row.balance.allocated + ' days left before approval.' : undefined
    });
  }

  onReject(row: LeaveRequestRow): void {
    if (this.rowActionsLocked) return;
    this.openConfirm({ kind: 'reject', row }, {
      title: 'Reject Leave',
      message: 'Reject ' + (row.leaveTypeName || 'leave') + ' for ' + row.name + '? Nothing changes on the attendance register. The request stays in the list, marked Rejected.',
      confirmLabel: 'Reject',
      variant: 'warning'
    });
  }

  onDelete(row: LeaveRequestRow): void {
    if (this.rowActionsLocked) return;
    this.openConfirm({ kind: 'delete', row }, {
      title: 'Delete Request',
      message: 'Delete this rejected request for ' + row.name + '? This can\'t be undone.',
      confirmLabel: 'Delete',
      variant: 'warning'
    });
  }

  private openConfirm(action: PendingAction, config: ConfirmConfig): void {
    this.pending = action;
    this.actionKey = newIdempotencyKey();
    this.confirmConfig = config;
    this.confirmOpen = true;
    this.cdr.markForCheck();
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.pending = null;
  }

  onConfirmed(): void {
    const action = this.pending;
    this.confirmOpen = false;
    this.pending = null;
    if (!action || this.acting) return;
    this.acting = true;
    const { row } = action;
    const request = action.kind === 'delete'
      ? this.api.delete(this.adminId, row._id)
      : action.kind === 'reject'
        ? this.api.reject(this.adminId, row._id, this.actionKey)
        : this.api.approve(this.adminId, row._id, action.kind === 'force', this.actionKey);

    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.acting = false;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error: unknown) => {
      this.acting = false;
      const apiError = toApiError(error);
      if (action.kind === 'approve' && apiError?.code === 'LEAVE_BALANCE_EXCEEDED') {
        // The admin override (leave-requests.md): confirm, then approve with forceApprove.
        this.openConfirm({ kind: 'force', row }, {
          title: 'Approve anyway?',
          message: apiError.message + ' This exceeds their remaining balance — approve anyway?',
          confirmLabel: 'Approve anyway',
          variant: 'warning'
        });
        return;
      }
      // ValidationError isn't toasted by the interceptor — say it here.
      if (apiError?.category === 'ValidationError') this.snackBar.open(apiError.message, 'Dismiss', { duration: 5000 });
      // A refused attempt shows the real current state on retry.
      this.fetch();
    });
  }

  // --- take back -----------------------------------------------------------------------

  onCancel(row: LeaveRequestRow): void {
    if (this.rowActionsLocked) return;
    this.cancelTarget = row;
    this.cancelReason = '';
    this.cancelOpen = true;
  }

  onCancelReasonChange(value: string): void {
    this.cancelReason = value;
  }

  onCancelDismiss(): void {
    this.cancelOpen = false;
    this.cancelTarget = null;
  }

  onCancelSubmit(): void {
    const row = this.cancelTarget;
    if (!row || this.acting) return;
    this.acting = true;
    this.api.cancel(this.adminId, row._id, this.cancelReason.trim()).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.acting = false;
      this.cancelOpen = false;
      this.cancelTarget = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error: unknown) => {
      this.acting = false;
      this.cancelOpen = false;
      this.cancelTarget = null;
      const apiError = toApiError(error);
      if (apiError?.category === 'ValidationError') this.snackBar.open(apiError.message, 'Dismiss', { duration: 5000 });
      this.fetch();
    });
  }

  // --- apply ---------------------------------------------------------------------------

  onApplyOpen(): void {
    if (this.rowActionsLocked) return;
    this.applyKey = newIdempotencyKey();
    this.applyOpen = true;
    this.applying = false;
    this.applyError = '';
    this.applyFieldErrors = {};
    this.applyFrom = '';
    this.applyTo = '';
    this.applyReason = '';
    this.calMonth = currentMonthKey();
    this.setApplyPersonType(this.filter.personType);
  }

  onApplyCancel(): void {
    this.applyOpen = false;
    this.applying = false;
  }

  onApplyPersonTypeChange(value: string): void {
    this.setApplyPersonType(value === 'student' ? 'student' : 'staff');
  }

  private setApplyPersonType(personType: LeavePersonType): void {
    this.applyPersonType = personType;
    this.applyPersonId = '';
    this.applyLeaveTypeId = '';
    this.balance = null;
    this.people = [];
    this.applicableTypes = [];
    this.peopleSearch = '';
    this.api.getPeople(this.adminId, this.session, personType, '').pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.people = res.rows || [];
      this.cdr.markForCheck();
    });
    this.typesApi.getOptions(this.adminId, personType).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.applicableTypes = res.rows || [];
      this.cdr.markForCheck();
    });
  }

  onPeopleSearch(value: string): void {
    this.peopleSearch = value;
    this.peopleSearch$.next(value.trim());
  }

  get peopleOptions(): DdOption[] {
    return this.people.map((row) => ({ value: row._id, label: row.name + (row.code ? ' · ' + row.code : row.sub ? ' · ' + row.sub : '') }));
  }

  get applicableTypeOptions(): DdOption[] {
    return this.applicableTypes.map((row) => ({ value: row._id, label: row.name }));
  }

  onApplyPersonChange(personId: string): void {
    this.applyPersonId = personId;
    delete this.applyFieldErrors['personId'];
    this.loadBalance();
  }

  onApplyTypeChange(leaveTypeId: string): void {
    this.applyLeaveTypeId = leaveTypeId;
    delete this.applyFieldErrors['leaveTypeId'];
    this.loadBalance();
  }

  private loadBalance(): void {
    this.balance = null;
    if (!this.applyPersonId || !this.applyLeaveTypeId) return;
    this.api.getBalance(this.adminId, this.session, this.applyPersonType, this.applyPersonId, this.applyLeaveTypeId)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.balance = res;
        this.cdr.markForCheck();
      }, () => {
        this.balance = null;
        this.cdr.markForCheck();
      });
  }

  onReasonChange(value: string): void {
    this.applyReason = value;
  }

  get plannedDays(): number {
    return plannedDaysBetween(this.applyFrom, this.applyTo);
  }

  /** The preview overestimates only, so "over balance" here is a hint, never a block. */
  get overBalance(): boolean {
    return Boolean(this.balance) && this.plannedDays > (this.balance as LeaveBalanceResponse).remaining;
  }

  /** Submit stays disabled until the form is valid. */
  get applyDisabled(): boolean {
    return this.applying || !this.applyPersonId || !this.applyLeaveTypeId || !this.applyFrom || !this.applyTo || this.plannedDays < 1;
  }

  // Inline range calendar: first click sets the start, the second the end; a re-click of
  // the start makes it a one-day leave.
  get calLabel(): string {
    return MONTH_NAMES[Number(this.calMonth.slice(5, 7)) - 1] + ' ' + this.calMonth.slice(0, 4);
  }

  get calCells(): CalCell[] {
    const year = Number(this.calMonth.slice(0, 4));
    const month = Number(this.calMonth.slice(5, 7)) - 1;
    const first = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const cells: CalCell[] = [];
    for (let i = 0; i < first; i += 1) cells.push({ key: '', day: null, cls: 'range-day empty', disabled: true });
    const end = this.applyTo || this.applyFrom;
    for (let day = 1; day <= count; day += 1) {
      const key = this.calMonth + '-' + String(day).padStart(2, '0');
      const dow = (first + day - 1) % 7;
      const disabled = key < this.today;
      const inRange = Boolean(this.applyFrom) && key >= this.applyFrom && key <= end;
      const classes = ['range-day'];
      if (disabled) classes.push('disabled');
      if (inRange) {
        classes.push('in-range');
        if (key === this.applyFrom || dow === 0 || day === 1) classes.push('band-l');
        if (key === end || dow === 6 || day === count) classes.push('band-r');
      }
      if (key === this.applyFrom || key === this.applyTo) classes.push('chain-endpoint');
      if (key === this.today) classes.push('today');
      cells.push({ key, day, cls: classes.join(' '), disabled });
    }
    return cells;
  }

  onCalStep(delta: number): void {
    const year = Number(this.calMonth.slice(0, 4));
    const month = Number(this.calMonth.slice(5, 7)) - 1 + delta;
    const date = new Date(year, month, 1);
    this.calMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  onCalPick(cell: CalCell): void {
    if (cell.disabled || !cell.key) return;
    delete this.applyFieldErrors['fromDate'];
    delete this.applyFieldErrors['toDate'];
    if (!this.applyFrom || this.applyTo) {
      this.applyFrom = cell.key;
      this.applyTo = '';
    } else if (cell.key < this.applyFrom) {
      this.applyTo = this.applyFrom;
      this.applyFrom = cell.key;
    } else {
      this.applyTo = cell.key;
    }
  }

  onCalReset(): void {
    this.applyFrom = '';
    this.applyTo = '';
  }

  get calNote(): string {
    if (!this.applyFrom) return 'Pick a date to start.';
    if (!this.applyTo) return shortDate(this.applyFrom, true) + ' — now pick the last day (or click it again for a one-day leave).';
    const days = this.plannedDays;
    const range = this.applyFrom === this.applyTo ? shortDate(this.applyFrom, true) : shortDate(this.applyFrom, true) + ' – ' + shortDate(this.applyTo, true);
    return range + ' · ' + days + (days === 1 ? ' working day' : ' working days') + ' (Sundays excluded).';
  }

  trackByIndex = (index: number): number => index;

  onApplySubmit(): void {
    if (this.applyDisabled) return;
    this.applying = true;
    this.applyError = '';
    this.applyFieldErrors = {};
    this.api.apply({
      adminId: this.adminId,
      session: this.session,
      personType: this.applyPersonType,
      personId: this.applyPersonId,
      leaveTypeId: this.applyLeaveTypeId,
      fromDate: this.applyFrom,
      toDate: this.applyTo,
      reason: this.applyReason.trim()
    }, this.applyKey).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.applying = false;
      this.applyOpen = false;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error: unknown) => {
      this.applying = false;
      const inline = validationErrorsOf(error);
      // Anything not field-bound has already been toasted by the ErrorInterceptor.
      if (inline) {
        this.applyFieldErrors = inline.fields;
        this.applyError = Object.keys(inline.fields).length ? '' : inline.message;
      }
      this.cdr.markForCheck();
    });
  }
}
