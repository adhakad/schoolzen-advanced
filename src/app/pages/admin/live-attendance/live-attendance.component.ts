import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceService } from 'src/app/services/attendance.service';
import { AttendanceSocketService } from 'src/app/services/attendance-socket.service';
import { ClassShiftService } from 'src/app/services/class-shift.service';
import { LiveBoardPerson, PunchEvent, PunchEventPunch } from 'src/app/modal/attendance.model';

// How many arrivals the side feed keeps. It is a "what just happened" list, not a log — the
// per-person punch trail already lives behind the calendar's day modal.
const MAX_RECENT_ARRIVALS = 50;

// How long a freshly-arrived row stays highlighted.
const FLASH_MS = 6000;

@Component({
  selector: 'app-live-attendance',
  templateUrl: './live-attendance.component.html',
  styleUrls: ['./live-attendance.component.css']
})
export class LiveAttendanceComponent implements OnInit, OnDestroy {

  personType: string = 'staff';
  // Students only, and required — same rule as the calendar grid: a whole school's roll is
  // not a live board, and the backend refuses the request without it.
  selectedClass: string = '';
  classOptions: String[] = [];

  people: LiveBoardPerson[] = [];
  // Split into two rendered lists ONCE per change, not per change-detection cycle. Binding
  // *ngFor to a method would hand Angular a brand-new array every tick, re-creating every row
  // and restarting the arrival flash animation on each one.
  arrivedPeople: LiveBoardPerson[] = [];
  pendingPeople: LiveBoardPerson[] = [];
  total: number = 0;
  arrivedCount: number = 0;
  notArrivedCount: number = 0;
  recentArrivals: LiveBoardPerson[] = [];

  liveConnected: boolean = false;

  errorMsg: String = '';
  errorCheck: Boolean = false;
  loader: Boolean = false;
  adminId!: string;
  today: string = '';

  private punchSub: Subscription | undefined;
  private connectedSub: Subscription | undefined;

  constructor(
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private attendanceService: AttendanceService,
    private attendanceSocketService: AttendanceSocketService,
    private classShiftService: ClassShiftService,
  ) { }

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id;
    this.today = this.todayKey();
    this.getClassOptions();
    this.getBoard();

    // The connection is shared and idempotent — the calendar page calls this too, and whichever
    // page loads second reuses the socket the first one opened.
    this.attendanceSocketService.connect();
    this.connectedSub = this.attendanceSocketService.onConnected()
      .subscribe((connected) => { this.liveConnected = connected; });
    this.punchSub = this.attendanceSocketService.onPunch()
      .subscribe((event: PunchEvent) => { this.applyPunchEvent(event); });
  }

  // First page in the admin area to need this: the subscriptions above outlive the component
  // because the socket service is providedIn:'root'. Without this, navigating away and back
  // would leave a dead component still handling every punch.
  //
  // Deliberately does NOT disconnect the socket — see the lifecycle note in
  // services/attendance-socket.service.ts.
  ngOnDestroy(): void {
    this.punchSub?.unsubscribe();
    this.connectedSub?.unsubscribe();
  }

  // "YYYY-MM-DD" for today, matching the key format the backend and the punch payload use.
  todayKey(): string {
    const now = new Date();
    const mm = `${now.getMonth() + 1}`.padStart(2, '0');
    const dd = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }

  // Only the classes this school actually runs — same source as the calendar page.
  getClassOptions(): void {
    this.classShiftService.getClassOptions(this.adminId).subscribe(
      (res: any) => { this.classOptions = res || []; },
      () => { this.classOptions = []; }
    );
  }

  classNumber(classKey: any): number {
    return Number(classKey);
  }

  // The opening snapshot. Fetched once per selection change — never polled, because everything
  // after it arrives over the socket.
  getBoard(): void {
    if (this.personType === 'student' && !this.selectedClass) {
      this.people = [];
      this.recentArrivals = [];
      this.total = 0;
      this.arrivedCount = 0;
      this.notArrivedCount = 0;
      this.splitPeople();
      return;
    }

    this.loader = true;
    this.errorCheck = false;
    this.errorMsg = '';

    const params: any = {
      adminId: this.adminId,
      personType: this.personType,
      date: this.today,
    };
    if (this.personType === 'student') params.class = this.selectedClass;

    this.attendanceService.getLiveBoard(params).subscribe(
      (res: any) => {
        this.people = res?.people || [];
        this.total = res?.total || 0;
        this.arrivedCount = res?.arrivedCount || 0;
        this.notArrivedCount = res?.notArrivedCount || 0;
        // Seed the feed from whoever has already arrived — the board is sorted newest-arrival
        // first by the backend, so this is the same order live punches will prepend in.
        this.recentArrivals = this.people.filter((person) => person.arrived).slice(0, MAX_RECENT_ARRIVALS);
        this.splitPeople();
        this.loader = false;
      },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.loader = false; }
    );
  }

  switchPersonType(type: string): void {
    if (this.personType === type) return;
    this.personType = type;
    this.selectedClass = '';
    this.people = [];
    this.recentArrivals = [];
    this.getBoard();
  }

  onClassChange(): void { this.getBoard(); }

  // --- The live path ---

  private applyPunchEvent(event: PunchEvent): void {
    if (!event || !Array.isArray(event.punches)) return;

    for (const punch of event.punches) {
      // A terminal with a skewed clock emits punches either side of midnight, and the board
      // only ever shows today. Person type has to match the tab on screen too.
      if (punch.dateKey !== this.today) continue;
      if (punch.personType !== this.personType) continue;
      this.applyPunch(punch);
    }
  }

  private applyPunch(punch: PunchEventPunch): void {
    const person = this.people.find((row) => `${row._id}` === `${punch.personId}`);
    // Not on screen: a different class, or someone whose record is inactive. Nothing to do —
    // the board is scoped to the roll it loaded.
    if (!person) return;

    // DEDUPE. punch-ingest.js builds the published payload from every row it offered to the
    // unique punchHash index, not just the ones that were actually inserted, so a re-sync of a
    // window we already hold re-broadcasts punches this board has seen. Comparing against the
    // newest punch already known drops them without any client-side bookkeeping.
    const newest = person.lastPunch || person.firstIn;
    if (newest && punch.punchTime <= newest) return;

    const wasArrived = person.arrived;

    if (!person.firstIn) {
      person.firstIn = punch.punchTime;
    } else {
      // The second punch onwards is a re-sighting, which is exactly what lastPunch means — a
      // single punch is an arrival, never a departure.
      person.lastPunch = punch.punchTime;
    }
    person.punchCount += 1;
    person.arrived = true;

    if (!wasArrived) {
      this.arrivedCount += 1;
      this.notArrivedCount = Math.max(0, this.notArrivedCount - 1);
      // Newest arrival to the top, matching the order the backend sorts the opening snapshot in.
      this.people = [person, ...this.people.filter((row) => row !== person)];
      this.splitPeople();
    }

    // Flash the row, then let it settle back into the list.
    person.justArrived = true;
    setTimeout(() => { person.justArrived = false; }, FLASH_MS);

    this.recentArrivals = [person, ...this.recentArrivals.filter((row) => row !== person)]
      .slice(0, MAX_RECENT_ARRIVALS);
  }

  // Rebuild the two rendered lists. Called only when membership actually changes — a punch for
  // someone who had already arrived updates their row in place and needs no re-split.
  //
  // The board shows ARRIVED / NOT ARRIVED, not an in/out toggle: these terminals routinely ship
  // with IN/OUT unconfigured and send every punch as state '0', so punchState is not something
  // any part of this pipeline branches on — see models/punch-log.js.
  private splitPeople(): void {
    this.arrivedPeople = this.people.filter((person) => person.arrived);
    this.pendingPeople = this.people.filter((person) => !person.arrived);
  }

  // --- Presentation helpers ---

  // punchTime is school wall clock expressed as UTC, so the UTC parts ARE the wall clock.
  // Reading local parts would re-apply the browser's offset. Same function as the calendar's.
  timeLabel(value: string | null): string {
    if (!value) return '–';
    const d = new Date(value);
    return `${`${d.getUTCHours()}`.padStart(2, '0')}:${`${d.getUTCMinutes()}`.padStart(2, '0')}`;
  }

  personName(person: LiveBoardPerson): string {
    return `${person.name}`;
  }

  refresh(): void {
    this.getBoard();
    setTimeout(() => this.toastr.success('', 'Board refreshed.'), 500);
  }
}
