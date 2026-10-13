/**
 * Dashboard — module 13, a read-only view over every other module's data.
 *
 * Reference: docs/schoolzen-planning/v1/dashboard/dashboard.html (+ .md, errors.md,
 * optimization.md). Markup is the reference's, class for class, with its inline SVG icons
 * converted to Bootstrap Icons (dashboard.md "Known inconsistency").
 *
 * One request loads every widget; each widget then lives on its own:
 *   - its own loading / ok / error state — a failed card says so and offers Retry, never a
 *     bare 0 that looks like real data (errors.md);
 *   - a widget the server left out (no Roles & Permissions grant) is not rendered at all;
 *     quick-action tiles are always listed but render LOCKED when not allowed;
 *   - attendance + approvals refresh on a data-free socket hint
 *     (`dashboard:widget-changed { widget }`) by refetching only that widget through its
 *     permission-checked API — with 60s polling of just those two while the socket is down.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { EMPTY, Subject, interval } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, groupBy, map, mergeMap, switchMap, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceSocketService } from 'src/app/services/attendance-socket.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { DashboardService } from 'src/app/shared/services/dashboard/dashboard.service';
import { ApprovalRequestsService } from 'src/app/shared/services/approvals/requests.service';
import { ShellContext, V2Permissions, v2CanView } from 'src/app/shared/models/shell-context.model';
import { ConfirmConfig } from 'src/app/shared/models/shared-components.model';
import { ApprovalDecision } from 'src/app/shared/models/approvals/approval-request.model';
import {
  ApprovalsSlice, AttendanceBar, AttendanceSlice, CalendarSlice, CountSlice, DASHBOARD_HINT_EVENT, DashboardHint,
  DashboardResponse, DashboardSlice, DashboardSlices, DashboardWidgetKey, FeesSlice, HolidaysSlice,
  PendingApprovalRow, QuickActionKey, QuickActionsSlice
} from 'src/app/shared/models/dashboard/dashboard.model';
import { errorMessageOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { initialsOf } from 'src/app/shared/utils/avatar.util';

type WidgetStatus = 'loading' | 'ok' | 'error';
interface WidgetState<T> { status: WidgetStatus; data: T | null; message: string }

interface CalendarCell { day: number; muted: boolean; today: boolean; holiday: boolean }

/** Each data widget's own grant — mirrors the server registry, used only to decide which
 *  cards to show as "loading" before the first response tells us exactly. */
const WIDGET_PERMISSION: Readonly<Record<DashboardWidgetKey, string | null>> = {
  students: 'student', staff: 'staff', attendance: 'attendance', fees: 'fees',
  calendar: 'holiday', approvals: 'approvals', holidays: 'holiday', quickActions: null
};
const WIDGET_KEYS = Object.keys(WIDGET_PERMISSION) as DashboardWidgetKey[];
/** The only widgets that follow live hints (and the polling fallback). */
const LIVE_WIDGETS: readonly DashboardWidgetKey[] = ['attendance', 'approvals'];
const POLL_MS = 60000;
const HINT_DEBOUNCE_MS = 1000;
const LOAD_FAILED = "Couldn't load this — try refreshing.";

const QUICK_ACTIONS: readonly { key: QuickActionKey; label: string; icon: string; route: string }[] = [
  { key: 'new-admission', label: 'New Admission', icon: 'person-plus', route: '/v2/student/admission' },
  { key: 'collect-fee', label: 'Collect Fee', icon: 'cash', route: '/v2/fees/fees' },
  { key: 'apply-leave', label: 'Apply Leave', icon: 'calendar-plus', route: '/v2/leave/requests' },
  { key: 'issue-tc', label: 'Issue TC', icon: 'file-earmark-arrow-up', route: '/v2/certificates/generate-tc' },
  { key: 'generate-marksheet', label: 'Generate Marksheet', icon: 'printer', route: '/v2/examination/generate-marksheet' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number): string => String(n).padStart(2, '0');
const localTodayKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const partsOf = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y, m, d };
};
const isError = (slice: unknown): slice is { error: { message: string } } =>
  Boolean(slice && typeof slice === 'object' && 'error' in (slice as object));

/** ₹18.4L / ₹1.2Cr / ₹45,000 — the reference's compact rupee figure. */
export const shortRupees = (amount: number): string => {
  const value = Number(amount) || 0;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (value >= 10000000) return `₹${trim(value / 10000000)}Cr`;
  if (value >= 100000) return `₹${trim(value / 100000)}L`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
};

/** "2026-2027" → "2026-27". */
const shortSession = (label: string): string => {
  const m = /^(\d{4})-\d{2}(\d{2})$/.exec(label || '');
  return m ? `${m[1]}-${m[2]}` : (label || '');
};

/** Sun-first month grid: leading/trailing days from the neighbouring months are muted. */
export const buildCalendar = (monthKey: string, todayKey: string, holidayDays: readonly number[]): CalendarCell[] => {
  const [y, m] = monthKey.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const holidays = new Set(holidayDays);
  const today = partsOf(todayKey);
  const cells: CalendarCell[] = [];
  for (let i = first - 1; i >= 0; i -= 1) cells.push({ day: prevDays - i, muted: true, today: false, holiday: false });
  for (let d = 1; d <= daysIn; d += 1) {
    cells.push({ day: d, muted: false, today: today.y === y && today.m === m && today.d === d, holiday: holidays.has(d) });
  }
  for (let d = 1; cells.length % 7 !== 0; d += 1) cells.push({ day: d, muted: true, today: false, holiday: false });
  return cells;
};

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  displayName = 'Admin';
  schoolName = '';
  todayKey = localTodayKey();
  /** The calendar's displayed month ("YYYY-MM"); the arrows move it. */
  calendarMonth = this.todayKey.slice(0, 7);

  /** Absent key = the server did not send it = the viewer may not see it. */
  widgets: Partial<Record<DashboardWidgetKey, WidgetState<any>>> = {};
  /** Per-row in-flight flags for Approve / Reject. */
  busy: Record<string, boolean> = {};

  readonly quickActions = QUICK_ACTIONS;
  readonly dows = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  private v2Permissions: V2Permissions | null | undefined = null;
  private destroyed$ = new Subject<void>();

  constructor(
    private api: DashboardService,
    private approvalsApi: ApprovalRequestsService,
    private shellContext: ShellContextService,
    private adminAuthService: AdminAuthService,
    private socket: AttendanceSocketService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) return;

    this.shellContext.context.pipe(takeUntil(this.destroyed$)).subscribe((context: ShellContext) => {
      this.displayName = context.displayName || 'Admin';
      this.schoolName = context.school?.name || '';
      this.v2Permissions = context.v2Permissions;
      this.cdr.markForCheck();
    });
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      this.loadAll();
    });

    this.listenForHints();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- loading -------------------------------------------------------------------------

  loadAll(): void {
    // Until the server answers, every card the shell's grants suggest is shown loading.
    const pending: Partial<Record<DashboardWidgetKey, WidgetState<any>>> = {};
    WIDGET_KEYS.forEach((key) => {
      const permission = WIDGET_PERMISSION[key];
      if (!permission || v2CanView(this.v2Permissions, permission)) pending[key] = { status: 'loading', data: null, message: '' };
    });
    this.widgets = pending;
    this.calendarMonth = this.todayKey.slice(0, 7);
    this.cdr.markForCheck();

    this.api.getDashboard(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res: DashboardResponse) => {
      this.todayKey = res.todayKey || this.todayKey;
      this.calendarMonth = this.todayKey.slice(0, 7);
      const next: Partial<Record<DashboardWidgetKey, WidgetState<any>>> = {};
      (Object.keys(res.widgets || {}) as DashboardWidgetKey[]).forEach((key) => {
        next[key] = this.toState(res.widgets[key]);
      });
      this.widgets = next;
      this.cdr.markForCheck();
    }, (err) => {
      // The whole request failed: every card that was waiting shows its own Retry.
      const message = errorMessageOf(err, LOAD_FAILED);
      const failed: Partial<Record<DashboardWidgetKey, WidgetState<any>>> = {};
      (Object.keys(this.widgets) as DashboardWidgetKey[]).forEach((key) => { failed[key] = { status: 'error', data: null, message }; });
      this.widgets = failed;
      this.cdr.markForCheck();
    });
  }

  /** One widget, through its own permission-checked endpoint (Retry, live hint, calendar). */
  reload(key: DashboardWidgetKey, { quiet = false } = {}): void {
    const current = this.widgets[key];
    if (!current) return;
    // A live refresh keeps showing the current numbers until the new ones land.
    if (!quiet || current.status === 'error') this.widgets = { ...this.widgets, [key]: { ...current, status: 'loading', message: '' } };
    this.cdr.markForCheck();
    const month = key === 'calendar' ? this.calendarMonth : '';
    this.api.getWidget(this.adminId, key, this.session, month).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      if (res.todayKey) this.todayKey = res.todayKey;
      this.widgets = { ...this.widgets, [key]: this.toState(res.widget) };
      this.cdr.markForCheck();
    }, (err) => {
      if (err?.status === 403) {
        // The grant was removed since load — the card goes, exactly as on a fresh load.
        const { [key]: _removed, ...rest } = this.widgets;
        this.widgets = rest;
      } else if (!quiet || !current.data) {
        this.widgets = { ...this.widgets, [key]: { status: 'error', data: null, message: errorMessageOf(err, LOAD_FAILED) } };
      } else {
        this.widgets = { ...this.widgets, [key]: { ...current, status: 'ok' } };
      }
      this.cdr.markForCheck();
    });
  }

  private toState<K extends DashboardWidgetKey>(slice: DashboardSlice<K> | undefined): WidgetState<DashboardSlices[K]> {
    if (!slice || isError(slice)) return { status: 'error', data: null, message: (slice && isError(slice) && slice.error.message) || LOAD_FAILED };
    return { status: 'ok', data: slice as DashboardSlices[K], message: '' };
  }

  // --- live hints ----------------------------------------------------------------------

  private listenForHints(): void {
    this.socket.onEvent<DashboardHint>(DASHBOARD_HINT_EVENT).pipe(
      map((hint) => hint && hint.widget),
      filter((widget): widget is DashboardWidgetKey => LIVE_WIDGETS.includes(widget) && Boolean(this.widgets[widget])),
      groupBy((widget) => widget),
      mergeMap((group) => group.pipe(debounceTime(HINT_DEBOUNCE_MS))),
      takeUntil(this.destroyed$)
    ).subscribe((widget) => this.reload(widget, { quiet: true }));

    // Fallback: while the socket is down, poll ONLY the live widgets the viewer has.
    this.socket.onConnected().pipe(
      distinctUntilChanged(),
      switchMap((connected) => (connected ? EMPTY : interval(POLL_MS))),
      takeUntil(this.destroyed$)
    ).subscribe(() => {
      LIVE_WIDGETS.filter((key) => this.widgets[key]).forEach((key) => this.reload(key, { quiet: true }));
    });
  }

  // --- view helpers --------------------------------------------------------------------

  has(key: DashboardWidgetKey): boolean { return Boolean(this.widgets[key]); }
  state(key: DashboardWidgetKey): WidgetState<any> | undefined { return this.widgets[key]; }
  ok(key: DashboardWidgetKey): boolean { return this.widgets[key]?.status === 'ok'; }

  get students(): CountSlice | null { return this.widgets.students?.data || null; }
  get staff(): CountSlice | null { return this.widgets.staff?.data || null; }
  get attendance(): AttendanceSlice | null { return this.widgets.attendance?.data || null; }
  get fees(): FeesSlice | null { return this.widgets.fees?.data || null; }
  get calendar(): CalendarSlice | null { return this.widgets.calendar?.data || null; }
  get approvals(): ApprovalsSlice | null { return this.widgets.approvals?.data || null; }
  get holidays(): HolidaysSlice | null { return this.widgets.holidays?.data || null; }
  get tiles(): QuickActionsSlice | null { return this.widgets.quickActions?.data || null; }

  /** Hero stat text: the number, "…" while loading, "—" when it failed or has no value. */
  heroValue(key: DashboardWidgetKey): string {
    const state = this.widgets[key];
    if (!state || state.status === 'loading') return '…';
    if (state.status === 'error' || !state.data) return '—';
    if (key === 'students' || key === 'staff') return String(state.data.total);
    if (key === 'attendance') return state.data.todayPct == null ? '—' : `${state.data.todayPct}%`;
    if (key === 'fees') return shortRupees(state.data.collected);
    return '';
  }

  heroTitle(key: DashboardWidgetKey): string {
    const state = this.widgets[key];
    if (state?.status === 'error') return state.message;
    if (key === 'attendance' && state?.data?.todayPct == null) return this.reasonText(state?.data?.todayReason);
    return '';
  }

  reasonText(reason: string | null | undefined): string {
    if (reason === 'holiday') return 'Holiday — no school';
    if (reason === 'weekly-off') return 'Weekly off — no school';
    if (reason === 'not-marked') return 'Attendance not marked yet';
    return '';
  }

  barHeight(bar: AttendanceBar): string {
    // No number (holiday / off / not marked): the reference's muted stub, never a fake value.
    return bar.pct == null ? '40%' : `${Math.max(bar.pct, 2)}%`;
  }

  barTitle(bar: AttendanceBar): string {
    return bar.pct == null ? this.reasonText(bar.reason) : `${bar.pct}%`;
  }

  get donutBackground(): string {
    const pct = this.fees?.collectedPct ?? 0;
    return `conic-gradient(var(--brand) 0% ${pct}%, var(--line-soft) ${pct}% 100%)`;
  }

  rupees(amount: number): string { return shortRupees(amount); }

  asOf(key: DashboardWidgetKey): string {
    const at = this.widgets[key]?.data?.generatedAt;
    if (!at) return '';
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? '' : `as of ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // --- hero ----------------------------------------------------------------------------

  get badgeDay(): string { return pad(partsOf(this.todayKey).d); }
  get badgeMonth(): string { return MONTHS[partsOf(this.todayKey).m - 1]; }

  get heroLine(): string {
    const { y, m, d } = partsOf(this.todayKey);
    const weekday = WEEKDAYS_LONG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return [weekday, this.schoolName, this.session ? `${shortSession(this.session)} session` : ''].filter(Boolean).join(' · ');
  }

  get feeSubtitle(): string {
    return [this.session ? `${shortSession(this.session)} session, incl. arrears` : 'incl. arrears', this.asOf('fees')].filter(Boolean).join(' · ');
  }

  // --- calendar ------------------------------------------------------------------------

  get calendarTitle(): string {
    const [y, m] = this.calendarMonth.split('-').map(Number);
    return `${MONTHS_LONG[m - 1]} ${y}`;
  }

  get todayLabel(): string {
    const { m, d } = partsOf(this.todayKey);
    return `Today: ${d} ${MONTHS[m - 1]}`;
  }

  get calendarCells(): CalendarCell[] {
    const days = this.calendar && this.calendar.month === this.calendarMonth ? this.calendar.holidayDays : [];
    return buildCalendar(this.calendarMonth, this.todayKey, days);
  }

  shiftMonth(delta: number): void {
    const [y, m] = this.calendarMonth.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + delta, 1));
    this.calendarMonth = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
    this.reload('calendar');
  }

  // --- side lists ----------------------------------------------------------------------

  initials(name: string): string { return initialsOf(name); }

  approvalSub(row: PendingApprovalRow): string {
    if (row.days == null) return row.typeLabel;
    return `${row.typeLabel} · ${row.days} ${row.days === 1 ? 'day' : 'days'}`;
  }

  holidayDate(row: { startDate: string; endDate: string }): string {
    const a = partsOf(row.startDate);
    const b = partsOf(row.endDate);
    if (row.startDate === row.endDate) return `${a.d} ${MONTHS[a.m - 1]}`;
    if (a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]}`;
    return `${a.d} ${MONTHS[a.m - 1]}–${b.d} ${MONTHS[b.m - 1]}`;
  }

  // --- quick actions -------------------------------------------------------------------

  tileAllowed(key: QuickActionKey): boolean {
    return Boolean(this.tiles?.tiles.find((tile) => tile.key === key)?.allowed);
  }

  /** Locked only once the server has said so — while loading a tile is just inert. */
  tileLocked(key: QuickActionKey): boolean {
    return this.ok('quickActions') && !this.tileAllowed(key);
  }

  // --- approve / reject (the Approvals module's own endpoints) -------------------------

  confirmFor(row: PendingApprovalRow, decision: ApprovalDecision): ConfirmConfig {
    const approve = decision === 'approve';
    return {
      title: approve ? 'Approve request?' : 'Reject request?',
      message: `${row.name} — ${this.approvalSub(row)}. ${approve ? 'This approves it everywhere it applies.' : 'This rejects it; it can’t be undone.'}`,
      confirmLabel: approve ? 'Approve' : 'Reject',
      variant: approve ? 'neutral' : 'warning'
    };
  }

  decide(row: PendingApprovalRow, decision: ApprovalDecision): void {
    if (!row.canAct || this.busy[row._id]) return;
    this.busy = { ...this.busy, [row._id]: true };
    this.cdr.markForCheck();
    this.approvalsApi.decide(this.adminId, row.type, row._id, decision, newIdempotencyKey())
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.busy = { ...this.busy, [row._id]: false };
        this.snackBar.open(res?.message || (decision === 'approve' ? 'Approved.' : 'Rejected.'), 'Close', { duration: 3000 });
        this.reload('approvals', { quiet: true });
      }, (err) => {
        this.busy = { ...this.busy, [row._id]: false };
        this.snackBar.open(errorMessageOf(err, 'Couldn’t update this request.'), 'Close', { duration: 4000 });
        this.reload('approvals', { quiet: true });
      });
  }

  trackByKey = (_index: number, item: { key: string }): string => item.key;
  trackById = (_index: number, item: { _id: string }): string => item._id;
  trackByIndex = (index: number): number => index;
}
