import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { toAmPm } from 'src/app/pipes/time-am-pm.pipe';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceService } from 'src/app/services/attendance.service';
import { AttendanceSocketService } from 'src/app/services/attendance-socket.service';
import { ClassShiftService } from 'src/app/services/class-shift.service';
import { AttendanceDay, AttendanceGridRow, AttendancePerson, FeedArrival, PunchEvent, PunchEventPunch, PunchLogEntry, ReconcileEvent, TodayStats } from 'src/app/modal/attendance.model';

// Width of one date column, in px. HARD-TIED to `.attendance-grid .day-column { width }` in
// attendance.component.css — scrollToToday() multiplies by it to find today's offset, so
// changing one without the other scrolls to the wrong column.
const DAY_COLUMN_PX = 60;

// How many arrivals the live feed strip keeps. It is a "what just happened" list, not a log —
// the per-person punch trail already lives behind the day modal.
const MAX_RECENT_ARRIVALS = 50;

// The one-shot green cell flash, in ms. MUST match the `cellFlash` keyframe duration in
// attendance.component.css, or the class is removed before the animation finishes (or lingers
// after it, blocking the next flash on that cell).
const FLASH_MS = 1500;

@Component({
  selector: 'app-attendance',
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.css']
})
export class AttendanceComponent implements OnInit, OnDestroy {

  personType: string = 'staff';
  // Students only. Required rather than optional: a whole school's roll times 31 columns
  // is tens of thousands of cells, and the backend refuses the request without it.
  selectedClass: string = '';
  classOptions: String[] = [];

  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth();   // JS 0-11 on screen; sent to the API as 1-12
  monthNames: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  yearOptions: number[] = [];

  // Column headers — the month's date skeleton, shared by every row.
  monthDays: { dateKey: string, day: number, weekday: number }[] = [];
  // One entry per person, each carrying that person's own AttendanceDay[].
  gridRows: AttendanceGridRow[] = [];
  summary: any = {};
  syncState: any = null;

  errorMsg: String = '';
  errorCheck: Boolean = false;
  loader: Boolean = false;
  adminId!: string;
  isSyncing: boolean = false;

  // Day modal — scoped to the CLICKED ROW, not to a single page-level selection. The grid
  // shows every person at once, so the punch trail and every manual write have to know
  // which row they belong to.
  showModal: boolean = false;
  modalPerson: AttendancePerson | null = null;
  modalDay: AttendanceDay | null = null;
  punchInfo: PunchLogEntry[] = [];
  punchLoader: boolean = false;
  manualForm: FormGroup;
  isClick: boolean = false;
  modalErrorCheck: boolean = false;
  modalErrorMsg: String = '';

  statusOptions: string[] = ['Present', 'Late', 'HalfDay', 'Absent', 'Leave', 'Holiday'];

  // The horizontally-scrolling grid container, so the view can be parked on today's column
  // rather than on the 1st of the month.
  @ViewChild('gridWrapper') gridWrapper!: ElementRef<HTMLElement>;

  // "Today" in "YYYY-MM-DD", cached once. Every cell asks whether it is today or in the
  // future, and 31 columns x N people is a lot of calls to rebuild a Date for.
  today: string = '';

  // Live layer. The grid is a historical view, so this only ever touches cells for dates
  // already on screen — see applyPunch().
  liveConnected: boolean = false;
  // The feed strip above the grid: who has walked in, most recent first. Sourced from the
  // grid's own rows rather than /v1/attendance/live, because a PunchEvent carries no name —
  // the feed has to join against people already loaded either way.
  recentArrivals: FeedArrival[] = [];
  // Today's counters. The API's `summary` is month-wide and cannot answer "how many are in
  // right now", so these are recomputed from each row's today cell.
  todayStats: TodayStats = { present: 0, late: 0, punched: 0, absent: 0 };
  private punchSub: Subscription | undefined;
  private connectedSub: Subscription | undefined;
  private reconciledSub: Subscription | undefined;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private attendanceService: AttendanceService,
    private attendanceSocketService: AttendanceSocketService,
    private classShiftService: ClassShiftService,
  ) {
    this.manualForm = this.fb.group({
      status: ['', Validators.required],
      inTime: [''],
      outTime: [''],
    });
  }

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id;
    this.today = this.todayKey();
    const thisYear = new Date().getFullYear();
    for (let y = thisYear - 1; y <= thisYear + 1; y++) this.yearOptions.push(y);
    this.getClassOptions();
    this.getGrid();
    this.getSyncState();

    // Shared, idempotent connection — the live board opens the same socket.
    this.attendanceSocketService.connect();
    this.connectedSub = this.attendanceSocketService.onConnected()
      .subscribe((connected) => { this.liveConnected = connected; });
    this.punchSub = this.attendanceSocketService.onPunch()
      .subscribe((event: PunchEvent) => { this.applyPunchEvent(event); });
    this.reconciledSub = this.attendanceSocketService.onReconciled()
      .subscribe((event: ReconcileEvent) => { this.applyReconciled(event); });
  }

  // The socket service is providedIn:'root', so these subscriptions outlive the component.
  // Without this, leaving and returning to the page would stack a dead handler per visit.
  ngOnDestroy(): void {
    this.punchSub?.unsubscribe();
    this.connectedSub?.unsubscribe();
    this.reconciledSub?.unsubscribe();
  }

  // Native <select> hands back strings — always read the period through these.
  private get year(): number { return Number(this.selectedYear); }
  private get month(): number { return Number(this.selectedMonth); }

  // "YYYY-MM-DD" for today — the date the sync / sync-state calls use.
  todayKey(): string {
    const now = new Date();
    const mm = `${now.getMonth() + 1}`.padStart(2, '0');
    const dd = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }

  // Only the classes this school actually runs — the same list the Class Shift page uses,
  // not the global 15-row /v1/class table.
  getClassOptions(): void {
    this.classShiftService.getClassOptions(this.adminId).subscribe(
      (res: any) => { this.classOptions = res || []; },
      () => { this.classOptions = []; }
    );
  }

  // The classSuffix pipe is typed for a number; class keys travel as strings.
  classNumber(classKey: any): number {
    return Number(classKey);
  }

  /**
   * @param silent keep the current scroll position and skip the spinner. Used by the
   *        reconcile refresh, which happens under the admin without them asking — blanking
   *        the grid and jumping back to today would be the page yanking itself around.
   */
  getGrid(silent: boolean = false): void {
    // Students are class-scoped by design — bail out rather than firing a request the
    // backend will reject.
    if (this.personType === 'student' && !this.selectedClass) {
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

    const params: any = {
      adminId: this.adminId,
      personType: this.personType,
      year: String(this.year),
      month: String(this.month + 1),   // API/DB use 1-12; this.month is JS 0-11
    };
    if (this.personType === 'student') params.class = this.selectedClass;

    this.attendanceService.getAttendanceCalendarMonth(params).subscribe(
      (res: any) => {
        this.monthDays = res?.days || [];
        this.gridRows = res?.rows || [];
        this.summary = res?.summary || {};
        this.loader = false;
        this.seedRecentArrivals();
        this.recomputeTodayStats();
        // After the *ngFor has actually rendered the columns — scrollLeft on a wrapper
        // whose content is still one row wide silently clamps to 0.
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

  // The feed's opening state, from the rows just loaded. Everything after this arrives over
  // the socket and is prepended by applyPunch().
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
    // Lexicographic on the ISO string, newest first — no Date parsing, same comparison the
    // dedupe in applyPunch() uses.
    arrivals.sort((a, b) => (a.punchTime < b.punchTime ? 1 : -1));
    this.recentArrivals = arrivals.slice(0, MAX_RECENT_ARRIVALS);
  }

  private resetTodayStats(): void {
    this.todayStats = { present: 0, late: 0, punched: 0, absent: 0 };
  }

  /**
   * Today's counters across everyone on screen.
   *
   * 'Punched' is deliberately its own bucket rather than being folded into Present: those
   * people have arrived but nothing has yet decided whether they were on time, so counting
   * them as Present would state something the pipeline has not worked out.
   */
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

  /**
   * Park the horizontal scroll on today's column so the page opens on the day somebody
   * actually came here to look at. Earlier dates stay one scroll-left away; later ones are
   * dimmed and sit to the right.
   *
   * No-op when the month on screen is not the current one — there is no "today" to scroll
   * to in April, and forcing a position there would just look broken.
   */
  scrollToToday(): void {
    const wrapper = this.gridWrapper?.nativeElement;
    if (!wrapper || this.monthDays.length === 0) return;

    const index = this.monthDays.findIndex((day) => day.dateKey === this.today);
    if (index < 0) {
      wrapper.scrollLeft = 0;
      return;
    }
    // Clamped by the browser to the real maximum, so late-month dates simply land at the
    // far right rather than overscrolling.
    wrapper.scrollLeft = index * DAY_COLUMN_PX;
  }

  getSyncState(): void {
    this.attendanceService.getSyncState({ adminId: this.adminId, date: this.todayKey() })
      .subscribe((res: any) => { this.syncState = res; }, () => { this.syncState = null; });
  }

  switchPersonType(type: string): void {
    if (this.personType === type) return;
    this.personType = type;
    this.selectedClass = '';
    this.gridRows = [];
    this.monthDays = [];
    this.summary = {};
    // The feed and the counters describe the tab that was on screen, not this one. Clearing
    // them here rather than waiting for the reload stops the previous tab's arrivals being
    // shown against the new tab's heading for the length of a request.
    this.recentArrivals = [];
    this.resetTodayStats();
    this.getGrid();
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

  // --- Presentation helpers ---

  // One CSS class per status; 'Off' and '' (future) stay unpainted so the working days
  // they sit between actually stand out.
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

  // The server's own answer when it sent one — it resolved "today" in the SCHOOL's wall
  // clock, which a browser in another timezone would get wrong. The lexicographic compare
  // is the fallback for cells the socket layer has touched; it is the same comparison
  // services/attendance-calendar.js makes, so the two can never disagree.
  isFuture(day: AttendanceDay): boolean {
    return day.isFuture !== undefined ? day.isFuture : day.dateKey > this.today;
  }

  /**
   * A future day that an approved Leave or an assigned Holiday already covers.
   *
   * These are the only future cells that show anything. The information was entered by the
   * admin and is known now — dimming it to a dash until the date arrived was hiding their
   * own data back at them. Display only: cellClick() still refuses a future date.
   */
  hasFutureInfo(day: AttendanceDay): boolean {
    return this.isFuture(day) && (day.status === 'Leave' || day.status === 'Holiday');
  }

  isToday(day: { dateKey: string }): boolean {
    return day.dateKey === this.today;
  }

  /**
   * A raw punch is held for this cell but nothing has classified it yet, so it shows a pulsing
   * dot and the punch time instead of a status chip.
   *
   * The 'Absent' case is the important one. 'Absent' is DERIVED at read time
   * (services/attendance-calendar.js) for a working day with no DailyAttendance row — so
   * somebody who walked in thirty seconds ago is still labelled 'A' until the reconcile worker
   * runs. Showing a red Absent chip against a person standing in the building is the exact
   * thing this state exists to prevent.
   *
   * A real reconciled status — Present, Late, HalfDay, Leave, Holiday — always wins: once the
   * slow path has decided, its answer is better than the dot's.
   */
  isPendingPunch(day: AttendanceDay): boolean {
    if (!day.livePunch) return false;
    return !day.status || day.status === 'Absent';
  }

  // Hover text for a cell, so a status can be explained without opening the modal.
  // toAmPm, not the timeAmPm pipe — a title string is assembled here, where a pipe cannot
  // reach. Same function the pipe delegates to, so the tooltip and the times printed in
  // the cell itself always read identically.
  cellTooltip(day: AttendanceDay): string {
    if (!day.status) return '';
    // A future Leave/Holiday cell explains itself by NAME — "Holiday: Diwali" says more than
    // a date and a status word for a day nobody has attended yet. There are no punch times
    // to report on a day that has not happened, so the time branch below cannot apply.
    if (this.hasFutureInfo(day)) return this.infoLabel(day);
    if (!day.firstIn) return `${day.dateKey} — ${day.status}`;
    const firstIn = toAmPm(this.timeLabel(day.firstIn));
    const lastOut = toAmPm(this.timeLabel(day.lastOut));
    return `${day.dateKey} — ${day.status} (${firstIn} – ${lastOut})`;
  }

  // "Holiday: Diwali" / "Leave: Casual Leave". Falls back to the bare status when the name
  // did not resolve — a leave type deleted after the request was approved, say.
  private infoLabel(day: AttendanceDay): string {
    const name = day.status === 'Holiday' ? day.holidayName : day.leaveTypeName;
    return name ? `${day.status}: ${name}` : `${day.status}`;
  }

  // punchTime is stored as school wall clock expressed as UTC, so the UTC parts ARE the
  // wall clock. Reading local parts here would re-apply the browser's offset.
  timeLabel(value: string | null): string {
    if (!value) return '–';
    const d = new Date(value);
    return `${`${d.getUTCHours()}`.padStart(2, '0')}:${`${d.getUTCMinutes()}`.padStart(2, '0')}`;
  }

  // Statuses an admin may set by hand. HalfDay is withheld on the student tab because the
  // reconciler can never produce it for a student (see computeStatus) — offering it here
  // would let a manual override create a status the automatic path would never agree with.
  availableStatusOptions(): string[] {
    if (this.personType === 'student') {
      return this.statusOptions.filter((status) => status !== 'HalfDay');
    }
    return this.statusOptions;
  }

  // Both return a primitive `string`, not the `String` wrapper the models use — the
  // titlecase pipe in the template only accepts the primitive.
  personName(person: AttendancePerson): string {
    return `${person.name}`;
  }

  personLabel(person: AttendancePerson): string {
    return person.code ? `${person.name} (${person.code})` : `${person.name}`;
  }

  // --- Day modal ---

  cellClick(row: AttendanceGridRow, day: AttendanceDay): void {
    // A future date has nothing to show and nothing to override. The cell is already
    // pointer-events:none in CSS; this is the guard for anything that reaches the handler
    // another way (keyboard, a programmatic call).
    if (this.isFuture(day)) return;

    this.modalPerson = row.person;
    this.modalDay = day;
    this.punchInfo = [];
    this.modalErrorCheck = false;
    this.modalErrorMsg = '';
    this.isClick = false;
    this.manualForm.reset({
      status: this.statusOptions.includes(day.status) ? day.status : '',
      inTime: this.rawTime(day.firstIn),
      outTime: this.rawTime(day.lastOut),
    });
    this.showModal = true;
    this.getDayPunches(day);
  }

  // "HH:mm" for the manual form, from the same UTC-as-wall-clock frame as timeLabel().
  private rawTime(value: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    return `${`${d.getUTCHours()}`.padStart(2, '0')}:${`${d.getUTCMinutes()}`.padStart(2, '0')}`;
  }

  getDayPunches(day: AttendanceDay): void {
    if (!this.modalPerson) return;
    this.punchLoader = true;
    this.attendanceService.getPunchLog({
      adminId: this.adminId,
      personType: this.personType,
      personId: this.modalPerson._id,
      date: day.dateKey,
    }).subscribe(
      (res: any) => { this.punchInfo = res || []; this.punchLoader = false; },
      () => { this.punchInfo = []; this.punchLoader = false; }
    );
  }

  closeModal(): void {
    this.showModal = false;
    this.modalPerson = null;
    this.modalDay = null;
    this.punchInfo = [];
    this.modalErrorCheck = false;
    this.modalErrorMsg = '';
  }

  successDone(msg: string): void {
    this.closeModal();
    this.getGrid();
    setTimeout(() => this.toastr.success('', msg), 500);
  }

  manualSave(): void {
    if (!this.manualForm.valid || !this.modalDay || !this.modalPerson || this.isClick) return;
    this.modalErrorCheck = false;
    this.modalErrorMsg = '';
    this.isClick = true;

    this.attendanceService.addManualAttendance({
      adminId: this.adminId,
      personType: this.personType,
      personId: this.modalPerson._id,
      date: this.modalDay.dateKey,
      status: this.manualForm.value.status,
      inTime: this.manualForm.value.inTime || '',
      outTime: this.manualForm.value.outTime || '',
      overriddenBy: this.adminId,
    }).subscribe(
      (res: any) => { this.isClick = false; this.successDone(res?.successMsg || 'Attendance saved.'); },
      (err: any) => { this.modalErrorCheck = true; this.modalErrorMsg = err.error; this.isClick = false; }
    );
  }

  // Drops the override so the reconcile worker recomputes the day from the raw punches.
  manualRemove(): void {
    if (!this.modalDay || !this.modalPerson || !this.modalDay.isOverridden || this.isClick) return;
    this.isClick = true;

    this.attendanceService.deleteManualAttendance({
      adminId: this.adminId,
      personType: this.personType,
      personId: this.modalPerson._id,
      date: this.modalDay.dateKey,
    }).subscribe(
      (res: any) => { this.isClick = false; this.successDone(res); },
      (err: any) => { this.modalErrorCheck = true; this.modalErrorMsg = err.error; this.isClick = false; }
    );
  }

  // --- Live punches (Phase 7) ---

  /**
   * A punch batch landed for this school. The grid is updated IN PLACE — no refetch, no
   * debounce timer — because a raw punch carries nothing the grid has to recompute.
   *
   * What deliberately does NOT happen here is a status change. The fast path genuinely cannot
   * tell whether 10:32 is Present or Late: that needs the shift, the roster, holidays and
   * leave, which is the reconcile worker's job. So the cell gains its punch time immediately
   * and its chip fills in on the next load, once reconcile has run.
   */
  private applyPunchEvent(event: PunchEvent): void {
    if (!event || !Array.isArray(event.punches)) return;
    // A punch for staff while the student tab is open belongs to a grid that isn't loaded.
    let touched = false;
    for (const punch of event.punches) {
      if (punch.personType !== this.personType) continue;
      if (this.applyPunch(punch)) touched = true;
    }
    // Once per batch, not once per punch — a 200-punch batch would otherwise walk every row
    // 200 times to produce the same four numbers.
    if (touched) this.recomputeTodayStats();
  }

  /**
   * @returns true if a cell actually changed, so the caller knows whether to recount.
   */
  private applyPunch(punch: PunchEventPunch): boolean {
    const row = this.gridRows.find((gridRow) => `${gridRow.person._id}` === `${punch.personId}`);
    if (!row) return false;

    // Only dates the month on screen actually has a column for — a punch for August while
    // September is displayed has nowhere to go, and the next load will pick it up.
    const day = row.days.find((gridDay) => gridDay.dateKey === punch.dateKey);
    if (!day) return false;

    // DEDUPE. punch-ingest.js publishes every row it offered to the unique punchHash index,
    // not just the ones actually inserted, so a re-sync of a window we already hold
    // re-broadcasts punches this grid has. Comparing against what the cell already shows
    // drops them with no client-side bookkeeping.
    const newest = day.lastOut || day.firstIn;
    if (newest && punch.punchTime <= newest) return false;

    if (!day.firstIn) {
      day.firstIn = punch.punchTime;
    } else if (this.personType !== 'student') {
      // A lone punch is an arrival, never a departure, so the second punch onwards is what
      // fills lastOut — matching how the backend builds the row.
      //
      // Never for a student: computeStatus (services/attendance-status.js) forces lastOut to
      // null for them because "when a child left school" is not something anybody acts on, and
      // punch-ingest does not even store their out-punches. Writing it here would paint a
      // checkout time that vanishes on the next load.
      day.lastOut = punch.punchTime;
    }
    day.punchCount += 1;

    // The cell now holds a punch nothing has classified. isPendingPunch() decides whether that
    // actually shows as a dot — a day already carrying a real status keeps its chip.
    day.livePunch = true;

    // One-shot flash. Cleared on a timer rather than by animationend so a second punch landing
    // mid-animation cannot leave the class stuck on.
    day.flash = true;
    setTimeout(() => { day.flash = false; }, FLASH_MS);

    // The feed is a "who just walked in" list, so it only tracks today and only the arrival.
    if (this.isToday(day)) {
      const personId = `${row.person._id}`;
      this.recentArrivals = [
        { personId, name: `${row.person.name}`, punchTime: punch.punchTime },
        ...this.recentArrivals.filter((arrival) => arrival.personId !== personId),
      ].slice(0, MAX_RECENT_ARRIVALS);
    }

    return true;
  }

  /**
   * The reconcile worker finished a school-day, so the statuses this grid is showing for that
   * date are now stale — every pending dot has a real answer waiting behind it.
   *
   * Refetched rather than patched: reconcile can change any person's status for that date
   * (a leave approved, a holiday added, a late arrival re-graded), and the event deliberately
   * carries no per-person detail. Silent, so it does not blank the grid or scroll it.
   */
  private applyReconciled(event: ReconcileEvent): void {
    if (!event || !event.dateKey) return;
    // A date this month does not show has nothing on screen to correct; the next load of that
    // month reads the reconciled rows anyway.
    if (!this.monthDays.some((day) => day.dateKey === event.dateKey)) return;

    for (const row of this.gridRows) {
      const day = row.days.find((gridDay) => gridDay.dateKey === event.dateKey);
      if (day) day.livePunch = false;
    }
    this.getGrid(true);
  }

  // --- Sync ---

  // On-demand pull, so the pipeline is testable without waiting for the 8am cron window.
  syncNow(): void {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.errorCheck = false;
    this.errorMsg = '';

    this.attendanceService.syncSchoolNow({ adminId: this.adminId, date: this.todayKey() }).subscribe(
      (res: any) => {
        this.isSyncing = false;
        this.getSyncState();
        setTimeout(() => this.toastr.success('', res), 500);
      },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.isSyncing = false; }
    );
  }
}
