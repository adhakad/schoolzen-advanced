/**
 * Attendance Overview — the month grid, live status and recent arrivals.
 *
 * Reference: docs/schoolzen-planning/v1/attendance/attendance-overview.html
 *
 * THIS page's toolbar (its own shape, don't copy it elsewhere): row1 search + Generate
 * Report + Sync now; row2 a 6-column GRID of cascading `.dd`s (Person Type, Department,
 * Designation, Class, Stream, Section); row3 the month navigator.
 *
 * Sync never fires on a click — it opens a confirm first. Live updates (socket deltas) and
 * HTTP refreshes both merge rows through ONE function, applyPersonUpdate().
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
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
  ArrivalRow, ChipStatus, DayPunches, GridRow, LiveCounts, PersonType, PunchEventV2, RecentArrivals, ReconcileEventV2
} from 'src/app/shared/models/attendance/attendance.model';
import { MonthColumn } from 'src/app/shared/models/attendance/roster.model';
import { FilterClass } from 'src/app/shared/models/student/student.model';
import { initialsOf } from 'src/app/shared/utils/avatar.util';
import { currentMonthKey, monthLabel } from 'src/app/shared/utils/attendance-time.util';

const CHIP_CLASS: Record<ChipStatus, string> = { P: 'present', L: 'late', HD: 'halfday', A: 'absent', LV: 'leave', H: 'holiday' };
const EMPTY_COUNTS: LiveCounts = { Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, live: 0 };

interface ReportRow {
  name: string;
  sub: string;
  initials: string;
  present: number;
  late: number;
  absent: number;
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

  adminId = '';
  session = '';
  today = localDateKey();
  month = currentMonthKey();
  search = '';

  // --- filters (row2 — the 6-column grid) -----------------------------------------------
  personType: PersonType = 'staff';
  departmentId = '';
  designationId = '';
  classId = '';
  streamId = '';
  sectionId = '';
  readonly personTypeOptions: readonly DdOption[] = [
    { value: 'staff', label: 'Staff' },
    { value: 'student', label: 'Student' }
  ];
  departmentOptions: DdOption[] = [{ value: '', label: 'All departments' }];
  private designations: { _id: string; title: string; departmentId: string | null }[] = [];
  classes: FilterClass[] = [];
  lookupError = '';

  // --- grid ------------------------------------------------------------------------------
  loading = true;
  loadError = '';
  days: MonthColumn[] = [];
  rows: GridRow[] = [];
  truncated = false;
  page = 1;
  limit = 10;
  selected = new Set<string>();

  // --- side panel ------------------------------------------------------------------------
  live: { staff: LiveCounts; student: LiveCounts } = { staff: { ...EMPTY_COUNTS }, student: { ...EMPTY_COUNTS } };
  arrivals: RecentArrivals = { dateKey: '', staff: [], student: [] };
  arrivalsError = '';
  expandedArrival = '';

  // --- modals ----------------------------------------------------------------------------
  syncConfirmOpen = false;
  readonly syncConfirm: ConfirmConfig = {
    title: 'Sync attendance now?',
    message: 'This pulls the latest punches from every connected biometric device. It can take a few seconds and cannot be cancelled once started.',
    confirmLabel: 'Yes, sync now',
    variant: 'neutral'
  };
  syncing = false;

  reportOpen = false;
  reportRows: ReportRow[] = [];

  dayOpen = false;
  dayTitle = '';
  dayLoading = false;
  dayError = '';
  dayData: DayPunches | null = null;
  private dayRequest: { row: GridRow; col: MonthColumn } | null = null;

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
    this.listenLive();
  }

  ngOnDestroy(): void {
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
      ...streams.map((stream) => ({ value: stream._id, label: stream.name.charAt(0).toUpperCase() + stream.name.slice(1) }))];
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
  get sectionDisabled(): boolean { return this.isStaff || this.sectionOptions.length < 2; }

  onPersonTypeChange(value: string): void {
    const next: PersonType = value === 'student' ? 'student' : 'staff';
    if (next === this.personType) return;
    this.personType = next;
    this.departmentId = '';
    this.designationId = '';
    this.classId = '';
    this.streamId = '';
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
    this.sectionId = '';
    this.onFiltersChanged();
  }

  onStreamChange(value: string): void {
    this.streamId = value;
    this.sectionId = '';
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

  fetchGrid(merge = false): void {
    if (!merge) {
      this.loading = true;
      this.loadError = '';
      this.cdr.markForCheck();
    }
    if (!this.isStaff && !this.session) return;
    this.api.getGrid(this.adminId, {
      personType: this.personType,
      month: this.month,
      session: this.isStaff ? '' : this.session,
      departmentId: this.departmentId,
      designationId: this.designationId,
      classId: this.classId,
      streamId: this.streamId,
      sectionId: this.sectionId,
      search: this.search
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.days = res.days || [];
      this.today = res.today || this.today;
      this.truncated = res.truncated;
      if (merge) {
        // A live refresh: same rows, merged through the one update path.
        (res.rows || []).forEach((row) => this.applyPersonUpdate(row._id, row));
      } else {
        this.rows = res.rows || [];
        const valid = new Set(this.rows.map((row) => row._id));
        this.selected.forEach((id) => { if (!valid.has(id)) this.selected.delete(id); });
      }
      this.loading = false;
      this.cdr.markForCheck();
      this.scrollToToday();
    }, () => {
      if (!merge) {
        this.rows = [];
        this.loadError = "Couldn't load attendance.";
      }
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  /**
   * THE single merge path for a person's row — socket deltas and HTTP refreshes both land
   * here (attendance/optimization.md §5), so the two can never disagree.
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
        host.scrollLeft = Math.max(0, cell.offsetLeft - host.clientWidth / 2);
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

  chipClass(status: ChipStatus): string {
    return CHIP_CLASS[status] || 'absent';
  }

  isLiveCell(row: GridRow, col: MonthColumn): boolean {
    return col.isToday && row.live;
  }

  initials(name: string): string { return initialsOf(name); }

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
      const cells = Object.values(row.cells);
      return {
        name: row.name,
        sub: row.shift || row.sub,
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
    this.syncConfirmOpen = false;
    if (this.syncing) return;
    this.syncing = true;
    this.cdr.markForCheck();
    this.api.syncNow(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.syncing = false;
      this.snackBar.open(res.message, 'Close', { duration: 4000 });
      this.cdr.markForCheck();
    }, () => {
      // SYNC_ALREADY_RUNNING / no devices — the ErrorInterceptor has shown the message.
      this.syncing = false;
      this.cdr.markForCheck();
    });
  }

  onSyncCancelled(): void {
    this.syncConfirmOpen = false;
  }

  // --- day detail ----------------------------------------------------------------------------

  openDay(row: GridRow, col: MonthColumn): void {
    if (col.isFuture) return;
    this.dayRequest = { row, col };
    this.dayTitle = row.name + ' · ' + col.dow + ' ' + col.day + ' ' + monthLabel(this.month);
    this.dayOpen = true;
    this.loadDay();
  }

  loadDay(): void {
    if (!this.dayRequest) return;
    const { row, col } = this.dayRequest;
    this.dayLoading = true;
    this.dayError = '';
    this.dayData = null;
    this.api.getDayPunches(this.adminId, row.type, row._id, col.dateKey).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.dayData = res;
      this.dayLoading = false;
      this.cdr.markForCheck();
    }, () => {
      // Distinct from "no punches that day" (errors.md, frontend requirements).
      this.dayError = "Couldn't load this day's punches.";
      this.dayLoading = false;
      this.cdr.markForCheck();
    });
  }

  closeDay(): void {
    this.dayOpen = false;
    this.dayRequest = null;
  }

  // --- side panel + live -------------------------------------------------------------------

  fetchSidePanel(): void {
    this.api.getLiveStatus(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.live = { staff: res.staff, student: res.student };
      this.cdr.markForCheck();
    }, () => { /* the card keeps its last numbers */ });
    this.arrivalsError = '';
    this.api.getRecentArrivals(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
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
    this.refresh$.pipe(auditTime(3000), takeUntil(this.destroyed$)).subscribe(() => this.fetchSidePanel());
  }

  trackById = (_index: number, row: { _id: string }): string => row._id;
  trackByDate = (_index: number, col: MonthColumn): string => col.dateKey;
  trackByPerson = (_index: number, row: ArrivalRow): string => row.personId;
  trackByIndex = (index: number): number => index;
}
