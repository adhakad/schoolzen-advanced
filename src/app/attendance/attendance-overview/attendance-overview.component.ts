/**
 * Attendance Overview — the month grid, live status and recent arrivals.
 *
 * Reference: docs/schoolzen-planning/v1/attendance/attendance-overview.html
 *
 * THIS page's toolbar (its own shape, don't copy it elsewhere): row1 search + Generate
 * Report + Sync now (with its "Last sync" line); row2 the cascading `.dd` filters (Person
 * Type, Department, Designation, Class, Stream, Stream Group, Section); row3 the month
 * navigator.
 *
 * Cells (attendance-fix1.md §3c): past days are locked, today is markable by hand for a
 * person with 'attendance-mark' inside their shift's window, future days show what the
 * roster expects. Manual marking is STATUS marking (Present / Late / Absent) through a
 * popover under the cell — never a punch; every rule is enforced by the API.
 *
 * Sync never fires on a click — it opens a confirm first. Live updates (socket deltas),
 * HTTP refreshes and a successful mark all merge rows through ONE function,
 * applyPersonUpdate().
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { forkJoin, of, Subject, Subscription } from 'rxjs';
import { auditTime, catchError, debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceSocketService } from 'src/app/services/attendance-socket.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { AttendanceOverviewService } from 'src/app/shared/services/attendance/attendance-overview.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import {
  ArrivalRow, GridCell, GridQuery, GridResponse, GridRow, LiveCounts, MarkStatus, PersonType, PunchEventV2, RecentArrivals, ReconcileEventV2, SyncStatus
} from 'src/app/shared/models/attendance/attendance.model';
import { MonthColumn } from 'src/app/shared/models/attendance/roster.model';
import { FilterClass, FilterGroup } from 'src/app/shared/models/student/student.model';
import { initialsOf } from 'src/app/shared/utils/avatar.util';
import { errorMessageOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { placeBelow } from 'src/app/shared/utils/overlay-position.util';
import { currentMonthKey, monthLabel, shiftMonth } from 'src/app/shared/utils/attendance-time.util';

/** How long an idle-time prefetched month may be shown without a fresh request. */
const PREFETCH_TTL_MS = 60000;

const CHIP_CLASS: Record<string, string> = { P: 'present', L: 'late', HD: 'halfday', A: 'absent', LV: 'leave', H: 'holiday', WO: 'weekoff' };
const EMPTY_COUNTS: LiveCounts = { Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, WeeklyOff: 0, live: 0 };
/** The statuses a person can be marked with by hand (§3d) — and the chip each shows. */
const MARK_OPTIONS: readonly { status: MarkStatus; code: string; label: string }[] = [
  { status: 'Present', code: 'P', label: 'Mark Present' },
  { status: 'Late', code: 'L', label: 'Mark Late' },
  { status: 'Absent', code: 'A', label: 'Mark Absent' }
];

const titleCase = (text: string): string => (text || '').charAt(0).toUpperCase() + (text || '').slice(1);

interface ReportRow {
  name: string;
  sub: string;
  initials: string;
  present: number;
  late: number;
  absent: number;
}

interface MarkTarget {
  row: GridRow;
  col: MonthColumn;
  cell: GridCell;
  /** Read-only: a device punch is recorded for today. */
  device: boolean;
}

const localDateKey = (date = new Date()): string =>
  date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');

@Component({
  selector: 'app-attendance-overview',
  templateUrl: './attendance-overview.component.html',
  styleUrls: ['./attendance-overview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttendanceOverviewComponent implements OnInit, OnDestroy {
  @ViewChild('gridScroll') gridScroll?: ElementRef<HTMLElement>;
  @ViewChild('markPop', { static: true }) markPop!: ElementRef<HTMLElement>;

  adminId = '';
  session = '';
  today = localDateKey();
  month = currentMonthKey();
  search = '';

  // --- filters (row2) --------------------------------------------------------------------
  personType: PersonType = 'staff';
  departmentId = '';
  designationId = '';
  classId = '';
  streamId = '';
  groupId = '';
  sectionId = '';
  readonly personTypeOptions: readonly DdOption[] = [
    { value: 'staff', label: 'Staff' },
    { value: 'student', label: 'Student' }
  ];
  departmentOptions: DdOption[] = [{ value: '', label: 'All departments' }];
  private designations: { _id: string; title: string; departmentId: string | null }[] = [];
  classes: FilterClass[] = [];
  private groups: FilterGroup[] = [];
  lookupError = '';

  // --- grid ------------------------------------------------------------------------------
  loading = true;
  loadError = '';
  days: MonthColumn[] = [];
  rows: GridRow[] = [];
  truncated = false;
  canMark = false;
  /** Student view with no class chosen: no rows until a class is picked (class-first rule). */
  needsClass = false;
  page = 1;
  limit = 10;
  selected = new Set<string>();

  // --- side panel ------------------------------------------------------------------------
  live: { staff: LiveCounts; student: LiveCounts } = { staff: { ...EMPTY_COUNTS }, student: { ...EMPTY_COUNTS } };
  arrivals: RecentArrivals = { dateKey: '', staff: [], student: [] };
  arrivalsError = '';
  expandedArrival = '';
  readonly tips: readonly string[] = [
    "Each row is one person; each column is a day of the month. Today's column is highlighted and the grid scrolls to it.",
    'To mark someone by hand, click their chip under today and choose Present, Late or Absent. It saves straight away.',
    'For students, choose a Class first (then Section if you like) — attendance is marked one class at a time.',
    'Marking is only open today, between the time set in Manage Shifts (Early Punch before start) and the shift end. Past days are locked.',
    'Anyone not marked and without a device punch counts as Absent. If the device has recorded a punch, it cannot be changed by hand.',
    'Faded dashed chips on future days show what the Roster expects: the shift letter, WO for a weekly off or H for a holiday. A dash means no roster.',
    'Press Sync now to pull the latest punches from the biometric device. "Last sync" shows when that last happened and how many punches arrived today.',
    'Tick people and press Generate Report to see their Present / Late / Absent totals for the month.'
  ];

  // --- modals ----------------------------------------------------------------------------
  syncConfirmOpen = false;
  readonly syncConfirm: ConfirmConfig = {
    title: 'Sync attendance now?',
    message: 'This pulls the latest punches from every connected biometric device. It can take a few seconds and cannot be cancelled once started.',
    confirmLabel: 'Yes, sync now',
    variant: 'neutral'
  };
  syncing = false;
  syncError = '';
  syncStatus: SyncStatus | null = null;

  reportOpen = false;
  reportRows: ReportRow[] = [];

  // --- manual mark popover -----------------------------------------------------------------
  readonly markOptions = MARK_OPTIONS;
  markTarget: MarkTarget | null = null;
  marking: MarkStatus | null = null;
  markError = '';
  /** The status the last failed save tried — what Retry sends again. */
  failedMark: MarkStatus | null = null;
  private markKey = '';
  private markAnchor: HTMLElement | null = null;

  private search$ = new Subject<string>();
  private refresh$ = new Subject<void>();
  private destroyed$ = new Subject<void>();
  private scrolledToToday = false;

  constructor(
    private api: AttendanceOverviewService,
    private departmentsApi: DepartmentsService,
    private designationsApi: DesignationsService,
    private studentOptions: StudentOptionsService,
    private socket: AttendanceSocketService,
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
      this.fetchGrid();
    });
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      if (this.personType === 'student') this.fetchGrid();
    });
    this.fetchGrid();
    this.fetchSidePanel();
    this.fetchSyncStatus();
    this.listenLive();
  }

  ngOnDestroy(): void {
    this.closeMark();
    this.markPop.nativeElement.remove();
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- lookups + cascade -----------------------------------------------------------------

  loadLookups(): void {
    this.lookupError = '';
    forkJoin({
      departments: this.departmentsApi.getOptions(this.adminId).pipe(catchError(() => of(null))),
      designations: this.designationsApi.getOptions(this.adminId).pipe(catchError(() => of(null))),
      classes: this.studentOptions.getFilterOptions(this.adminId).pipe(catchError(() => of(null)))
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      if (!res.departments || !res.designations || !res.classes) this.lookupError = "Couldn't load every filter.";
      this.departmentOptions = [{ value: '', label: 'All departments' },
        ...((res.departments?.rows || []) as { _id: string; name: string }[]).map((row) => ({ value: row._id, label: row.name }))];
      this.designations = (res.designations?.rows || []) as { _id: string; title: string; departmentId: string | null }[];
      this.classes = res.classes?.classes || [];
      this.groups = res.classes?.groups || [];
      this.cdr.markForCheck();
    });
  }

  get isStaff(): boolean { return this.personType === 'staff'; }

  get designationOptions(): DdOption[] {
    return [{ value: '', label: 'All designations' },
      ...this.designations.filter((row) => row.departmentId === this.departmentId).map((row) => ({ value: row._id, label: row.title }))];
  }

  get classOptions(): DdOption[] {
    return [{ value: '', label: 'All classes' }, ...this.classes.map((row) => ({ value: row._id, label: row.label }))];
  }

  private get selectedClass(): FilterClass | undefined {
    return this.classes.find((row) => row._id === this.classId);
  }

  get streamOptions(): DdOption[] {
    const streams = this.selectedClass?.streams || [];
    return [{ value: '', label: 'All streams' },
      ...streams.map((stream) => ({ value: stream._id, label: titleCase(stream.name) }))];
  }

  /**
   * Stream Groups of the chosen class (+stream). A non-streamed class's only group is its
   * automatic "General" — nothing to narrow by, so the pill stays disabled ("All stream groups").
   */
  get groupOptions(): DdOption[] {
    const cls = this.selectedClass;
    const ready = Boolean(cls) && (!cls?.hasStreams || Boolean(this.streamId));
    const groups = ready
      ? this.groups.filter((group) => !group.isSystemGroup && group.classId === cls?._id && (group.streamId || '') === (this.streamId || ''))
      : [];
    return [{ value: '', label: 'All stream groups' }, ...groups.map((group) => ({ value: group._id, label: group.name }))];
  }

  /** Section options come live from whichever of Class / Stream is set. */
  get sectionOptions(): DdOption[] {
    const cls = this.selectedClass;
    let sections = cls && !cls.hasStreams ? cls.sections : [];
    if (cls && cls.hasStreams && this.streamId) sections = cls.streams.find((stream) => stream._id === this.streamId)?.sections || [];
    return [{ value: '', label: 'All sections' }, ...sections.map((section) => ({ value: section._id, label: 'Section ' + section.name }))];
  }

  get departmentDisabled(): boolean { return !this.isStaff; }
  get designationDisabled(): boolean { return !this.isStaff || !this.departmentId; }
  get classDisabled(): boolean { return this.isStaff; }
  /** Streams exist only on streamed classes (11th/12th). */
  get streamDisabled(): boolean { return this.isStaff || !this.selectedClass?.hasStreams; }
  get groupDisabled(): boolean { return this.isStaff || this.groupOptions.length < 2; }
  get sectionDisabled(): boolean { return this.isStaff || this.sectionOptions.length < 2; }

  onPersonTypeChange(value: string): void {
    const next: PersonType = value === 'student' ? 'student' : 'staff';
    if (next === this.personType) return;
    this.personType = next;
    this.departmentId = '';
    this.designationId = '';
    this.classId = '';
    this.streamId = '';
    this.groupId = '';
    this.sectionId = '';
    this.onFiltersChanged();
  }

  onDepartmentChange(value: string): void {
    this.departmentId = value;
    this.designationId = '';
    this.onFiltersChanged();
  }

  onDesignationChange(value: string): void {
    this.designationId = value;
    this.onFiltersChanged();
  }

  onClassChange(value: string): void {
    this.classId = value;
    this.streamId = '';
    this.groupId = '';
    this.sectionId = '';
    this.onFiltersChanged();
  }

  onStreamChange(value: string): void {
    this.streamId = value;
    this.groupId = '';
    this.sectionId = '';
    this.onFiltersChanged();
  }

  onGroupChange(value: string): void {
    this.groupId = value;
    this.onFiltersChanged();
  }

  onSectionChange(value: string): void {
    this.sectionId = value;
    this.onFiltersChanged();
  }

  private onFiltersChanged(): void {
    this.page = 1;
    this.selected.clear();
    this.fetchGrid();
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onMonthChange(month: string): void {
    this.month = month;
    this.page = 1;
    this.selected.clear();
    this.scrolledToToday = false;
    this.fetchGrid();
  }

  // --- grid ------------------------------------------------------------------------------

  /** Grids fetched ahead in idle time, by query; each is used once, within PREFETCH_TTL_MS. */
  private prefetched = new Map<string, { at: number; res: GridResponse }>();
  private prefetchSub?: Subscription;

  private gridQuery(month: string): GridQuery {
    return {
      personType: this.personType,
      month,
      session: this.isStaff ? '' : this.session,
      departmentId: this.departmentId,
      designationId: this.designationId,
      classId: this.classId,
      streamId: this.streamId,
      groupId: this.groupId,
      sectionId: this.sectionId,
      search: this.search
    };
  }

  private takePrefetched(query: GridQuery): GridResponse | null {
    const key = JSON.stringify(query);
    const hit = this.prefetched.get(key);
    this.prefetched.delete(key);
    return hit && Date.now() - hit.at < PREFETCH_TTL_MS ? hit.res : null;
  }

  private applyGrid(res: GridResponse, merge: boolean): void {
    this.days = res.days || [];
    this.today = res.today || this.today;
    this.truncated = res.truncated;
    this.canMark = Boolean(res.canMark);
    if (merge) {
      // A live refresh: same rows, merged through the one update path.
      (res.rows || []).forEach((row) => this.applyPersonUpdate(row._id, row));
    } else {
      this.rows = res.rows || [];
      const valid = new Set(this.rows.map((row) => row._id));
      this.selected.forEach((id) => { if (!valid.has(id)) this.selected.delete(id); });
      this.prefetchNextMonth();
    }
    this.loading = false;
    this.cdr.markForCheck();
    this.scrollToToday();
  }

  /** The month after this one, fetched when the browser is idle, so "›" is instant. */
  private prefetchNextMonth(): void {
    const query = this.gridQuery(shiftMonth(this.month, 1));
    const key = JSON.stringify(query);
    if (this.prefetched.has(key)) return;
    this.prefetchSub?.unsubscribe();
    const idle: (cb: () => void) => void = (window as any).requestIdleCallback
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 3000 })
      : (cb) => setTimeout(cb, 1500);
    idle(() => {
      if (this.loading || key !== JSON.stringify(this.gridQuery(query.month))) return;
      this.prefetchSub = this.api.getGrid(this.adminId, query).pipe(takeUntil(this.destroyed$))
        .subscribe((res) => this.prefetched.set(key, { at: Date.now(), res }), () => undefined);
    });
  }

  private gridSeq = 0;
  /** The grid request in flight — cancelled (not just ignored) when a newer one starts. */
  private gridSub?: Subscription;

  fetchGrid(merge = false): void {
    if (!this.isStaff && !this.session) return;
    // Students are marked one class at a time: no class, no request and no rows.
    this.needsClass = !this.isStaff && !this.classId;
    if (this.needsClass) {
      ++this.gridSeq;
      this.gridSub?.unsubscribe();
      this.rows = [];
      this.selected.clear();
      this.loading = false;
      this.loadError = '';
      this.closeMark();
      this.cdr.markForCheck();
      return;
    }
    const query = this.gridQuery(this.month);
    // Only the latest request may land: a fast filter change must never be overwritten by
    // the slower answer to the previous one — and the previous request is cancelled.
    const seq = ++this.gridSeq;
    this.gridSub?.unsubscribe();
    // A month prefetched in idle time renders at once, with no request (attendance-fix3.md C).
    const prefetched = merge ? null : this.takePrefetched(query);
    if (prefetched) {
      this.applyGrid(prefetched, false);
      return;
    }
    if (!merge) {
      // The previous grid stays on screen, dimmed (.is-loading), until the new one lands.
      this.loading = true;
      this.loadError = '';
      this.closeMark();
      this.cdr.markForCheck();
    }
    this.gridSub = this.api.getGrid(this.adminId, query).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      if (seq !== this.gridSeq) return;
      this.applyGrid(res, merge);
    }, () => {
      if (seq !== this.gridSeq) return;
      if (!merge) {
        this.rows = [];
        this.loadError = "Couldn't load attendance.";
      }
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  /**
   * THE single merge path for a person's row — socket deltas, HTTP refreshes and a mark all
   * land here (attendance/optimization.md §5), so they can never disagree.
   */
  applyPersonUpdate(personId: string, patch: Partial<GridRow>): void {
    const index = this.rows.findIndex((row) => row._id === personId);
    if (index === -1) return;
    const current = this.rows[index];
    const next: GridRow = { ...current, ...patch, cells: patch.cells ? { ...current.cells, ...patch.cells } : current.cells };
    this.rows = [...this.rows.slice(0, index), next, ...this.rows.slice(index + 1)];
  }

  private scrollToToday(): void {
    if (this.scrolledToToday) return;
    setTimeout(() => {
      const host = this.gridScroll?.nativeElement;
      const cell = host?.querySelector('th.today-col') as HTMLElement | null;
      if (host && cell) {
        // The reference's formula: today lands just right of the visible sticky columns.
        // Only the wrapper scrolls, never the page.
        const sticky = Array.from(host.querySelectorAll<HTMLElement>('thead th.check-col, thead th.name-col, thead th.type-col'))
          .filter((th) => th.offsetParent)
          .reduce((sum, th) => sum + th.offsetWidth, 0);
        host.scrollLeft = Math.max(0, cell.offsetLeft - sticky - 8);
        this.scrolledToToday = true;
      }
    });
  }

  get pageRows(): GridRow[] {
    return this.rows.slice((this.page - 1) * this.limit, this.page * this.limit);
  }

  onPageChange(page: number): void {
    this.page = page;
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.page = 1;
  }

  // --- cells -------------------------------------------------------------------------------

  /**
   * The chip's classes, named as in the reference html: status colour plus `locked-past` /
   * `future` / `nocell`; today's P/L/A chip is `live-click`, plus `closed` when it can't be marked.
   */
  cellClass(cell: GridCell, col: MonthColumn, row: GridRow): string {
    if (cell.n) return 'nocell';
    if (cell.f) return 'future';
    const classes = [CHIP_CLASS[cell.s] || 'absent'];
    if (col.dateKey < this.today) classes.push('locked-past');
    else if (col.isToday && this.canOpenMark(row, cell, col)) classes.push('live-click');
    else if (col.isToday && ['P', 'L', 'A'].includes(cell.s)) classes.push('live-click', 'closed');
    if (cell.src === 'manual') classes.push('manual');
    return classes.join(' ');
  }

  /** Today, a working day on a shift, the caller may mark, and the window is open. */
  isMarkable(row: GridRow, cell: GridCell): boolean {
    return this.canMark && Boolean(row.mark?.open) && ['P', 'L', 'A'].includes(cell.s);
  }

  /** Opens the popover: editable, or read-only when a device punch is recorded. */
  canOpenMark(row: GridRow, cell: GridCell, col: MonthColumn): boolean {
    if (!col.isToday || !this.canMark || !row.mark || cell.n || cell.f) return false;
    if (row.type === 'student' && !this.classId) return false;
    if (cell.src === 'device') return true;
    return this.isMarkable(row, cell);
  }

  cellTitle(row: GridRow, cell: GridCell, col: MonthColumn): string | null {
    if (cell.n) return 'No roster for this day';
    // attendance-overview.html: a future holiday is "Upcoming date", a future roster cell "(from roster)".
    if (cell.f) return cell.s === 'H' ? 'Upcoming date' : 'Upcoming date (from roster)';
    if (col.dateKey < this.today) return "Past dates can't be changed";
    if (!col.isToday) return null;
    if (cell.src === 'device') return 'Device punch recorded' + (cell.p ? ' at ' + cell.p : '');
    if (!['P', 'L', 'A'].includes(cell.s)) return null;
    if (!this.canMark) return 'You do not have permission to mark attendance';
    if (row.type === 'student' && !this.classId) return 'Select a class first';
    if (!row.mark) return 'No shift today';
    if (!row.mark.open) return 'Attendance window is closed (' + row.mark.from + ' - ' + row.mark.to + ')';
    return 'Click to mark attendance';
  }

  isLiveCell(row: GridRow, col: MonthColumn): boolean {
    return col.isToday && row.live;
  }

  initials(name: string): string { return initialsOf(name); }

  // --- manual mark popover -------------------------------------------------------------------

  openMark(event: Event, row: GridRow, col: MonthColumn): void {
    event.stopPropagation();
    const cell = row.cells[col.dateKey];
    if (!cell || !this.canOpenMark(row, cell, col)) return;
    if (this.markTarget && this.markTarget.row._id === row._id) {
      this.closeMark();
      return;
    }
    this.closeMark();
    this.markTarget = { row, col, cell, device: cell.src === 'device' };
    this.markKey = newIdempotencyKey();
    this.markError = '';
    this.markAnchor = event.currentTarget as HTMLElement;
    const panel = this.markPop.nativeElement;
    panel.classList.add('mark-portal');
    document.body.appendChild(panel);
    this.cdr.detectChanges();
    this.positionMark();
    document.addEventListener('scroll', this.repositionMark, true);
    window.addEventListener('resize', this.repositionMark);
  }

  closeMark(): void {
    if (!this.markTarget) return;
    this.markTarget = null;
    this.marking = null;
    this.markAnchor = null;
    document.removeEventListener('scroll', this.repositionMark, true);
    window.removeEventListener('resize', this.repositionMark);
    const panel = this.markPop.nativeElement;
    panel.classList.remove('mark-portal', 'flipped');
    panel.removeAttribute('style');
    this.cdr.markForCheck();
  }

  private repositionMark = (): void => this.positionMark();

  private positionMark(): void {
    if (this.markTarget && this.markAnchor) placeBelow(this.markPop.nativeElement, this.markAnchor.getBoundingClientRect());
  }

  isCurrentMark(status: MarkStatus): boolean {
    const code = this.markTarget?.cell.s;
    return MARK_OPTIONS.some((option) => option.status === status && option.code === code);
  }

  /** Choosing an option saves immediately — no extra confirm (§3d.5). */
  chooseMark(status: MarkStatus): void {
    const target = this.markTarget;
    if (!target || target.device || this.marking) return;
    if (this.isCurrentMark(status) && (status !== 'Absent' || target.cell.src !== 'manual')) {
      this.closeMark();
      return;
    }
    this.marking = status;
    this.markError = '';
    this.failedMark = null;
    // Optimistic: the chip changes now; the popover keeps its spinner until the server
    // answers, and a refusal puts the previous cell back (Part B / Part D §4).
    const previousCell = target.row.cells[target.col.dateKey];
    const code = MARK_OPTIONS.find((option) => option.status === status)?.code || 'A';
    this.applyPersonUpdate(target.row._id, { cells: { [target.col.dateKey]: { ...previousCell, s: code, src: status === 'Absent' ? undefined : 'manual' } } });
    this.cdr.markForCheck();
    // Students carry the grid's session + class context; the server checks the enrolment.
    const context = target.row.type === 'student'
      ? { session: this.session, classId: this.classId, streamId: this.streamId, groupId: this.groupId, sectionId: this.sectionId }
      : {};
    this.api.mark(this.adminId, { personType: target.row.type, personId: target.row._id, status, ...context }, this.markKey)
      .pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.marking = null;
        this.prefetched.clear();
        this.applyPersonUpdate(target.row._id, { cells: { [target.col.dateKey]: res.cell } });
        this.closeMark();
        this.snackBar.open(res.message, 'Close', { duration: 2500 });
        this.refresh$.next();
        this.cdr.markForCheck();
      }, (error: unknown) => {
        this.marking = null;
        // The popover keeps the reason in place (window closed, device punch, permission);
        // the cell itself is untouched until a save succeeds.
        this.applyPersonUpdate(target.row._id, { cells: { [target.col.dateKey]: previousCell } });
        this.markError = errorMessageOf(error, "Couldn't save — please try again.");
        this.failedMark = status;
        // A new attempt is a new submission.
        this.markKey = newIdempotencyKey();
        this.cdr.markForCheck();
      });
  }

  retryMark(): void {
    if (this.failedMark) this.chooseMark(this.failedMark);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.markTarget && !this.markPop.nativeElement.contains(event.target as Node)) this.closeMark();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMark();
  }

  // --- selection + report ------------------------------------------------------------------

  get allSelected(): boolean {
    return this.pageRows.length > 0 && this.pageRows.every((row) => this.selected.has(row._id));
  }

  toggleAll(): void {
    if (this.allSelected) this.pageRows.forEach((row) => this.selected.delete(row._id));
    else this.pageRows.forEach((row) => this.selected.add(row._id));
  }

  toggleRow(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  /** Built client-side from the chips currently rendered (attendance-overview.md). */
  generateReport(): void {
    if (!this.selected.size) return;
    this.reportRows = this.rows.filter((row) => this.selected.has(row._id)).map((row) => {
      const cells = Object.values(row.cells).filter((cell) => !cell.f && !cell.n);
      return {
        name: row.name,
        sub: row.sub,
        initials: initialsOf(row.name),
        present: cells.filter((cell) => cell.s === 'P').length,
        late: cells.filter((cell) => cell.s === 'L').length,
        absent: cells.filter((cell) => cell.s === 'A').length
      };
    });
    this.reportOpen = true;
  }

  get reportSub(): string {
    return monthLabel(this.month) + ' · ' + this.reportRows.length + ' selected';
  }

  closeReport(): void {
    this.reportOpen = false;
  }

  // --- sync (confirm first, never on one click) --------------------------------------------

  onSyncClick(): void {
    if (this.syncing) return;
    this.syncConfirmOpen = true;
  }

  onSyncConfirmed(): void {
    if (this.syncing) return;
    // The confirm stays open with its spinner until the sync is queued (global rule 11).
    this.syncing = true;
    this.syncError = '';
    this.cdr.markForCheck();
    this.api.syncNow(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.syncing = false;
      this.syncConfirmOpen = false;
      this.snackBar.open(res.message, 'Close', { duration: 4000 });
      this.cdr.markForCheck();
      // The worker needs a moment — check the "Last sync" line again shortly.
      setTimeout(() => this.fetchSyncStatus(), 8000);
    }, (error: unknown) => {
      // SYNC_ALREADY_RUNNING / no devices — kept under the button with a Retry.
      this.syncing = false;
      this.syncError = errorMessageOf(error, "Couldn't start the sync — please try again.");
      this.syncConfirmOpen = false;
      this.cdr.markForCheck();
    });
  }

  onSyncCancelled(): void {
    this.syncConfirmOpen = false;
  }

  fetchSyncStatus(): void {
    this.api.getSyncStatus(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.syncStatus = res;
      this.cdr.markForCheck();
    }, () => { /* the line keeps its last value */ });
  }

  get syncLine(): string {
    const status = this.syncStatus;
    if (!status) return '';
    const punches = status.punchesToday + (status.punchesToday === 1 ? ' punch' : ' punches');
    const unknown = status.lastUnmatched ? ' · ' + status.lastUnmatched + ' unknown device ID' + (status.lastUnmatched === 1 ? '' : 's') : '';
    return 'Last sync: ' + (status.lastSyncAt || 'never') + ' / ' + punches + ' today' + unknown;
  }

  // --- side panel + live -------------------------------------------------------------------

  fetchSidePanel(): void {
    this.api.getLiveStatus(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.live = { staff: res.staff, student: res.student };
      this.cdr.markForCheck();
    }, () => { /* the card keeps its last numbers */ });
    this.arrivalsError = '';
    this.api.getRecentArrivals(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.arrivals = res;
      this.cdr.markForCheck();
    }, () => {
      this.arrivalsError = "Couldn't load recent arrivals.";
      this.cdr.markForCheck();
    });
  }

  get liveCounts(): LiveCounts {
    return this.isStaff ? this.live.staff : this.live.student;
  }

  toggleArrival(row: ArrivalRow): void {
    this.expandedArrival = this.expandedArrival === row.personId ? '' : row.personId;
  }

  private listenLive(): void {
    // Fast path: a punch → the person's ring, immediately.
    this.socket.onEvent<PunchEventV2>('attendance-v2:punch').pipe(takeUntil(this.destroyed$)).subscribe((event) => {
      if (event.punches.some((punch) => punch.dateKey === this.today)) {
        event.punches
          .filter((punch) => punch.dateKey === this.today && punch.personType === this.personType)
          .forEach((punch) => this.applyPersonUpdate(punch.personId, { live: true }));
        this.refresh$.next();
      }
      this.cdr.markForCheck();
    });
    // Slow path: statuses are real now → refresh, merged through the same path.
    this.socket.onEvent<ReconcileEventV2>('attendance-v2:reconciled').pipe(takeUntil(this.destroyed$)).subscribe((event) => {
      if (event.dateKey.slice(0, 7) === this.month) this.fetchGrid(true);
      this.refresh$.next();
    });
    this.refresh$.pipe(auditTime(3000), takeUntil(this.destroyed$)).subscribe(() => {
      this.fetchSidePanel();
      this.fetchSyncStatus();
    });
  }

  trackById = (_index: number, row: { _id: string }): string => row._id;
  trackByDate = (_index: number, col: MonthColumn): string => col.dateKey;
  trackByPerson = (_index: number, row: ArrivalRow): string => row.personId;
  trackByIndex = (index: number): number => index;
  trackByStatus = (_index: number, option: { status: string }): string => option.status;
}
