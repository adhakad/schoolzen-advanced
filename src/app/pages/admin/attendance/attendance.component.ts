import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceService } from 'src/app/services/attendance.service';
import { ClassService } from 'src/app/services/class.service';
import { AttendanceDay, AttendancePerson, PunchLogEntry } from 'src/app/modal/attendance.model';

@Component({
  selector: 'app-attendance',
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.css']
})
export class AttendanceComponent implements OnInit {

  personType: string = 'staff';
  personId: string = '';
  selectedClass: string = '';

  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth();   // JS 0-11 on screen; sent to the API as 1-12
  monthNames: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  yearOptions: number[] = [];

  personInfo: AttendancePerson[] = [];
  classInfo: any[] = [];
  monthDays: AttendanceDay[] = [];
  summary: any = {};
  syncState: any = null;

  errorMsg: String = '';
  errorCheck: Boolean = false;
  loader: Boolean = false;
  adminId!: string;
  isSyncing: boolean = false;

  // Day modal
  showModal: boolean = false;
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
    private classService: ClassService,
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
    this.getClassList();
    this.getPersonList();
    this.getSyncState();
  }

  // Native <select> hands back strings — always read the period through these.
  private get year(): number { return Number(this.selectedYear); }
  private get month(): number { return Number(this.selectedMonth); }

  // "YYYY-MM-DD" for the currently selected month's 1st — also the date the sync/
  // sync-state calls use when the month on screen is the current one.
  todayKey(): string {
    const now = new Date();
    const mm = `${now.getMonth() + 1}`.padStart(2, '0');
    const dd = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }

  getClassList(): void {
    this.classService.getClassList().subscribe((res: any) => {
      if (res) this.classInfo = res;
    });
  }

  getPersonList(): void {
    const params: any = { adminId: this.adminId, personType: this.personType };
    if (this.personType === 'student' && this.selectedClass) params.class = this.selectedClass;

    this.attendanceService.getAttendancePeople(params).subscribe(
      (res: any) => {
        this.personInfo = res || [];
        // Keep the grid honest — a person from the previous type is no longer valid here.
        this.personId = '';
        this.monthDays = [];
        this.summary = {};
      },
      (err: any) => { this.personInfo = []; this.errorCheck = true; this.errorMsg = err.error; }
    );
  }

  getCalendar(): void {
    if (!this.personId) { this.monthDays = []; this.summary = {}; return; }
    this.loader = true;
    this.errorCheck = false;
    this.errorMsg = '';

    this.attendanceService.getAttendanceCalendar({
      adminId: this.adminId,
      personType: this.personType,
      personId: this.personId,
      year: String(this.year),
      month: String(this.month + 1),   // API/DB use 1-12; this.month is JS 0-11
    }).subscribe(
      (res: any) => {
        this.monthDays = res?.days || [];
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
    this.getPersonList();
  }

  onClassChange(): void { this.getPersonList(); }

  onPersonChange(): void { this.getCalendar(); }

  changeMonth(delta: number): void {
    let m = this.month + delta;
    let y = this.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    this.selectedMonth = m;
    this.selectedYear = y;
    this.getCalendar();
  }

  onPeriodChange(): void {
    // Coerce back to numbers — <select> writes strings into the bound property.
    this.selectedYear = this.year;
    this.selectedMonth = this.month;
    this.getCalendar();
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

  // punchTime is stored as school wall clock expressed as UTC, so the UTC parts ARE the
  // wall clock. Reading local parts here would re-apply the browser's offset.
  timeLabel(value: string | null): string {
    if (!value) return '–';
    const d = new Date(value);
    return `${`${d.getUTCHours()}`.padStart(2, '0')}:${`${d.getUTCMinutes()}`.padStart(2, '0')}`;
  }

  personLabel(person: AttendancePerson): string {
    return person.code ? `${person.name} (${person.code})` : `${person.name}`;
  }

  // --- Day modal ---

  dayClick(day: AttendanceDay): void {
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
    this.punchLoader = true;
    this.attendanceService.getPunchLog({
      adminId: this.adminId,
      personType: this.personType,
      personId: this.personId,
      date: day.dateKey,
    }).subscribe(
      (res: any) => { this.punchInfo = res || []; this.punchLoader = false; },
      () => { this.punchInfo = []; this.punchLoader = false; }
    );
  }

  closeModal(): void {
    this.showModal = false;
    this.modalDay = null;
    this.punchInfo = [];
    this.modalErrorCheck = false;
    this.modalErrorMsg = '';
  }

  successDone(msg: string): void {
    this.closeModal();
    this.getCalendar();
    setTimeout(() => this.toastr.success('', msg), 500);
  }

  manualSave(): void {
    if (!this.manualForm.valid || !this.modalDay || this.isClick) return;
    this.modalErrorCheck = false;
    this.modalErrorMsg = '';
    this.isClick = true;

    this.attendanceService.addManualAttendance({
      adminId: this.adminId,
      personType: this.personType,
      personId: this.personId,
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
    if (!this.modalDay || !this.modalDay.isOverridden || this.isClick) return;
    this.isClick = true;

    this.attendanceService.deleteManualAttendance({
      adminId: this.adminId,
      personType: this.personType,
      personId: this.personId,
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
