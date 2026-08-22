import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { toAmPm } from 'src/app/pipes/time-am-pm.pipe';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { AttendanceService } from 'src/app/services/attendance.service';
import { TeacherAttendanceSocketService } from 'src/app/services/teacher-attendance-socket.service';
import { AttendanceDay, AttendanceGridRow, FeedArrival, PunchEvent, PunchEventPunch, ReconcileEvent, TodayStats } from 'src/app/modal/attendance.model';

// The teacher-facing half of pages/admin/attendance. Same grid, same live layer, three
// deliberate differences:
//   1. personType is fixed to 'student' — a teacher watches pupils, not colleagues.
//   2. The class list is the teacher's OWN attendancePermission.classes, not the school's.
//   3. Read-only. There is no manual-override modal: correcting a day is an admin action.
//
// Scoping is enforced server-side, not here. The socket puts a teacher in one class room per
// permitted class (middleware/socket-auth.js), so this page cannot receive another class's
// punches even if it asked.

// Kept in step with the admin page's copies — see the comments there.
const DAY_COLUMN_PX = 60;
const MAX_RECENT_ARRIVALS = 50;
const FLASH_MS = 1500;

@Component({
  selector: 'app-teacher-attendance',
  templateUrl: './teacher-attendance.component.html',
  styleUrls: ['./teacher-attendance.component.css']
})
export class TeacherAttendanceComponent implements OnInit, OnDestroy {

  // Fixed. The backend requires a personType and a teacher only ever has one here.
  readonly personType: string = 'student';

  // The teacher's own classes, from attendancePermission. Empty means they have not been
  // granted attendance access, which is a different message from "no records".
  myClasses: string[] = [];
  selectedClass: string = '';
  permissionLoaded: boolean = false;

  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth();   // JS 0-11 on screen; sent to the API as 1-12
  monthNames: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  yearOptions: number[] = [];

  monthDays: { dateKey: string, day: number, weekday: number }[] = [];
  gridRows: AttendanceGridRow[] = [];
  summary: any = {};

  errorMsg: String = '';
  errorCheck: Boolean = false;
  loader: Boolean = false;
  adminId!: string;
  teacherInfo: any;

  @ViewChild('gridWrapper') gridWrapper!: ElementRef<HTMLElement>;

  today: string = '';

  liveConnected: boolean = false;
  recentArrivals: FeedArrival[] = [];
  todayStats: TodayStats = { present: 0, late: 0, punched: 0, absent: 0 };
  private punchSub: Subscription | undefined;
  private connectedSub: Subscription | undefined;
  private reconciledSub: Subscription | undefined;

  constructor(
    private teacherAuthService: TeacherAuthService,
    private teacherService: TeacherService,
    private attendanceService: AttendanceService,
    private teacherAttendanceSocketService: TeacherAttendanceSocketService,
  ) { }

  ngOnInit(): void {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    // adminId, not id — a teacher's token carries the school separately from their own id,
    // and every /v1/... call here is school-scoped like the admin's.
    this.adminId = this.teacherInfo?.adminId;
    this.today = this.todayKey();
    const thisYear = new Date().getFullYear();
    for (let y = thisYear - 1; y <= thisYear + 1; y++) this.yearOptions.push(y);

    this.loadMyClasses();

    this.teacherAttendanceSocketService.connect();
    this.connectedSub = this.teacherAttendanceSocketService.onConnected()
      .subscribe((connected) => { this.liveConnected = connected; });
    this.punchSub = this.teacherAttendanceSocketService.onPunch()
      .subscribe((event: PunchEvent) => { this.applyPunchEvent(event); });
    this.reconciledSub = this.teacherAttendanceSocketService.onReconciled()
      .subscribe((event: ReconcileEvent) => { this.applyReconciled(event); });
  }

  // The socket service is providedIn:'root', so these outlive the component.
  ngOnDestroy(): void {
    this.punchSub?.unsubscribe();
    this.connectedSub?.unsubscribe();
    this.reconciledSub?.unsubscribe();
  }

  private get year(): number { return Number(this.selectedYear); }
  private get month(): number { return Number(this.selectedMonth); }

  todayKey(): string {
    const now = new Date();
    const mm = `${now.getMonth() + 1}`.padStart(2, '0');
    const dd = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }

  /**
   * The classes this teacher may see attendance for.
   *
   * Read from the permissions the side-nav has usually already cached; otherwise fetched the
   * same way it fetches them, so a hard refresh straight onto this URL still works.
   */
  private loadMyClasses(): void {
    const cached = this.teacherAuthService.getPermissions();
    if (cached) {
      this.applyPermissions(cached);
      return;
    }
    if (!this.teacherInfo) { this.permissionLoaded = true; return; }

    this.teacherService.getTeacherById({
      adminId: this.teacherInfo.adminId,
      teacherUserId: this.teacherInfo.id,
    }).subscribe(
      (res: any) => {
        if (res) this.teacherAuthService.setPermissions(res);
        this.applyPermissions(res);
      },
      () => { this.permissionLoaded = true; }
    );
  }

  private applyPermissions(res: any): void {
    const permission = res?.attendancePermission;
    const classes: any[] = (permission?.status && Array.isArray(permission.classes))
      ? permission.classes
      : [];

    // 0 is the "none" sentinel every permission block defaults to, not a real class.
    this.myClasses = classes
      .filter((className) => Number(className) > 0)
      .map((className) => String(className));

    this.permissionLoaded = true;

    // Exactly one class is the common case, and a picker with a single option is a control
    // that can only be set to what it already says. Auto-select and load straight into it.
    if (this.myClasses.length > 0) {
      this.selectedClass = this.myClasses[0];
      this.getGrid();
    }
  }

  // True when the picker is worth showing at all.
  get showClassPicker(): boolean {
    return this.myClasses.length > 1;
  }

  classNumber(classKey: any): number {
    return Number(classKey);
  }

  /**
   * @param silent keep scroll position and skip the spinner — used by the reconcile refresh.
   */
  getGrid(silent: boolean = false): void {
    if (!this.selectedClass) {
      this.gridRows = [];
      this.monthDays = [];
      this.summary = {};
      this.recentArrivals = [];
      this.resetTodayStats();
      return;
    }

    const keepScrollLeft = silent ? (this.gridWrapper?.nativeElement.scrollLeft ?? 0) : 0;

    if (!silent) this.loader = true;
    this.errorCheck = false;
    this.errorMsg = '';

    this.attendanceService.getAttendanceCalendarMonth({
      adminId: this.adminId,
      personType: this.personType,
      year: String(this.year),
      month: String(this.month + 1),   // API/DB use 1-12; this.month is JS 0-11
      class: this.selectedClass,
    }).subscribe(
      (res: any) => {
        this.monthDays = res?.days || [];
        this.gridRows = res?.rows || [];
        this.summary = res?.summary || {};
        this.loader = false;
        this.seedRecentArrivals();
        this.recomputeTodayStats();
        setTimeout(() => {
          if (silent) {
            if (this.gridWrapper) this.gridWrapper.nativeElement.scrollLeft = keepScrollLeft;
          } else {
            this.scrollToToday();
          }
        }, 0);
      },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.loader = false; }
    );
  }

  scrollToToday(): void {
    const wrapper = this.gridWrapper?.nativeElement;
    if (!wrapper || this.monthDays.length === 0) return;

    const index = this.monthDays.findIndex((day) => day.dateKey === this.today);
    if (index < 0) {
      wrapper.scrollLeft = 0;
      return;
    }
    wrapper.scrollLeft = index * DAY_COLUMN_PX;
  }

  onClassChange(): void { this.getGrid(); }

  changeMonth(delta: number): void {
    let m = this.month + delta;
    let y = this.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    this.selectedMonth = m;
    this.selectedYear = y;
    this.getGrid();
  }

  onPeriodChange(): void {
    // Coerce back to numbers — <select> writes strings into the bound property.
    this.selectedYear = this.year;
    this.selectedMonth = this.month;
    this.getGrid();
  }

  // --- Presentation helpers (same rules as the admin grid) ---

  statusClass(day: AttendanceDay): string {
    return day.status ? `status-${day.status.toLowerCase()}` : 'status-future';
  }

  statusShort(day: AttendanceDay): string {
    const map: any = {
      Present: 'P', Late: 'L', HalfDay: 'HD', Absent: 'A',
      Holiday: 'H', Leave: 'LV', Off: '–',
    };
    return map[day.status] || '';
  }

  // Lexicographic compare on "YYYY-MM-DD" — no Date arithmetic, matching the server.
  isFuture(day: AttendanceDay): boolean {
    return day.dateKey > this.today;
  }

  isToday(day: { dateKey: string }): boolean {
    return day.dateKey === this.today;
  }

  // A raw punch is held for this cell but nothing has classified it yet — see the fuller note
  // on the admin component, particularly why 'Absent' counts as unclassified.
  isPendingPunch(day: AttendanceDay): boolean {
    if (!day.livePunch) return false;
    return !day.status || day.status === 'Absent';
  }

  cellTooltip(day: AttendanceDay): string {
    if (!day.status) return '';
    if (!day.firstIn) return `${day.dateKey} — ${day.status}`;
    return `${day.dateKey} — ${day.status} (${toAmPm(this.timeLabel(day.firstIn))})`;
  }

  // punchTime is school wall clock expressed as UTC, so the UTC parts ARE the wall clock.
  // Reading local parts here would re-apply the browser's offset.
  timeLabel(value: string | null): string {
    if (!value) return '–';
    const d = new Date(value);
    return `${`${d.getUTCHours()}`.padStart(2, '0')}:${`${d.getUTCMinutes()}`.padStart(2, '0')}`;
  }

  personName(person: { name: String }): string {
    return `${person.name}`;
  }

  // --- Live layer ---

  private seedRecentArrivals(): void {
    const arrivals: FeedArrival[] = [];
    for (const row of this.gridRows) {
      const today = row.days.find((day) => day.dateKey === this.today);
      if (!today || !today.firstIn) continue;
      arrivals.push({
        personId: `${row.person._id}`,
        name: `${row.person.name}`,
        punchTime: today.firstIn,
      });
    }
    arrivals.sort((a, b) => (a.punchTime < b.punchTime ? 1 : -1));
    this.recentArrivals = arrivals.slice(0, MAX_RECENT_ARRIVALS);
  }

  private resetTodayStats(): void {
    this.todayStats = { present: 0, late: 0, punched: 0, absent: 0 };
  }

  private recomputeTodayStats(): void {
    const stats: TodayStats = { present: 0, late: 0, punched: 0, absent: 0 };
    for (const row of this.gridRows) {
      const day = row.days.find((gridDay) => gridDay.dateKey === this.today);
      if (!day) continue;
      if (this.isPendingPunch(day)) { stats.punched += 1; continue; }
      if (day.status === 'Present') stats.present += 1;
      else if (day.status === 'Late') stats.late += 1;
      else if (day.status === 'Absent') stats.absent += 1;
    }
    this.todayStats = stats;
  }

  private applyPunchEvent(event: PunchEvent): void {
    if (!event || !Array.isArray(event.punches)) return;
    let touched = false;
    for (const punch of event.punches) {
      // Staff/teacher punches still reach the school room this socket is also in, and they
      // belong to a grid this page never loads.
      if (punch.personType !== this.personType) continue;
      if (this.applyPunch(punch)) touched = true;
    }
    if (touched) this.recomputeTodayStats();
  }

  /**
   * @returns true if a cell actually changed, so the caller knows whether to recount.
   */
  private applyPunch(punch: PunchEventPunch): boolean {
    const row = this.gridRows.find((gridRow) => `${gridRow.person._id}` === `${punch.personId}`);
    if (!row) return false;

    const day = row.days.find((gridDay) => gridDay.dateKey === punch.dateKey);
    if (!day) return false;

    // DEDUPE. punch-ingest.js publishes every row it offered to the unique punchHash index,
    // not just the ones actually inserted, so a re-sync re-broadcasts punches this grid has.
    const newest = day.firstIn;
    if (newest && punch.punchTime <= newest) return false;

    // Students only, so there is no lastOut to fill: punch-ingest does not even store their
    // out-punches, and computeStatus forces lastOut to null for them.
    if (!day.firstIn) day.firstIn = punch.punchTime;
    day.punchCount += 1;

    day.livePunch = true;
    day.flash = true;
    setTimeout(() => { day.flash = false; }, FLASH_MS);

    if (this.isToday(day)) {
      const personId = `${row.person._id}`;
      this.recentArrivals = [
        { personId, name: `${row.person.name}`, punchTime: punch.punchTime },
        ...this.recentArrivals.filter((arrival) => arrival.personId !== personId),
      ].slice(0, MAX_RECENT_ARRIVALS);
    }

    return true;
  }

  // Reconcile finished for a date on screen, so every pending dot now has a real answer.
  private applyReconciled(event: ReconcileEvent): void {
    if (!event || !event.dateKey) return;
    if (!this.monthDays.some((day) => day.dateKey === event.dateKey)) return;

    for (const row of this.gridRows) {
      const day = row.days.find((gridDay) => gridDay.dateKey === event.dateKey);
      if (day) day.livePunch = false;
    }
    this.getGrid(true);
  }
}
