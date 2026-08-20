import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceService } from 'src/app/services/attendance.service';
import { ClassShiftService } from 'src/app/services/class-shift.service';
import { AttendanceDay, AttendanceGridRow, AttendancePerson, PunchLogEntry } from 'src/app/modal/attendance.model';

@Component({
  selector: 'app-attendance',
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.css']
})
export class AttendanceComponent implements OnInit {

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

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private attendanceService: AttendanceService,
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
    const thisYear = new Date().getFullYear();
    for (let y = thisYear - 1; y <= thisYear + 1; y++) this.yearOptions.push(y);
    this.getClassOptions();
    this.getGrid();
    this.getSyncState();
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

  getGrid(): void {
    // Students are class-scoped by design — bail out rather than firing a request the
    // backend will reject.
    if (this.personType === 'student' && !this.selectedClass) {
      this.gridRows = [];
      this.monthDays = [];
      this.summary = {};
      return;
    }

    this.loader = true;
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
      },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.loader = false; }
    );
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
      Present: 'P', Late: 'L', HalfDay: 'H', Absent: 'A',
      Leave: 'LV', Holiday: 'HO', Off: '–',
    };
    return map[day.status] || '';
  }

  // Hover text for a cell, so a status can be explained without opening the modal.
  cellTooltip(day: AttendanceDay): string {
    if (!day.status) return '';
    if (!day.firstIn) return `${day.dateKey} — ${day.status}`;
    return `${day.dateKey} — ${day.status} (${this.timeLabel(day.firstIn)} – ${this.timeLabel(day.lastOut)})`;
  }

  // punchTime is stored as school wall clock expressed as UTC, so the UTC parts ARE the
  // wall clock. Reading local parts here would re-apply the browser's offset.
  timeLabel(value: string | null): string {
    if (!value) return '–';
    const d = new Date(value);
    return `${`${d.getUTCHours()}`.padStart(2, '0')}:${`${d.getUTCMinutes()}`.padStart(2, '0')}`;
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
