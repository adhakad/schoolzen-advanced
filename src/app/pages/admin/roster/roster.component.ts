import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { RosterService } from 'src/app/services/roster.service';
import { ShiftService } from 'src/app/services/shift.service';
import { StaffService } from 'src/app/services/staff.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { ToastrService } from 'ngx-toastr';

interface MonthDay {
  day: number;
  dateKey: string;    // "YYYY-MM-DD"
  isWeekend: boolean;
}

@Component({
  selector: 'app-roster',
  templateUrl: './roster.component.html',
  styleUrls: ['./roster.component.css']
})
export class RosterComponent implements OnInit {

  personType: string = 'staff';
  selectedYear: number  = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth();
  monthNames: string[] = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  yearOptions: number[] = [];

  monthDays: MonthDay[]  = [];
  personInfo: any[]      = [];
  shiftInfo: any[]       = [];

  // Flat map: "personId|YYYY-MM-DD" -> shiftId — O(1) cell lookup
  rosterMap: Record<string, string> = {};

  errorMsg: String    = '';
  errorCheck: Boolean = false;
  loader: Boolean     = true;
  adminId!: string;

  // Single-cell modal
  showModal: boolean        = false;
  cellForm: FormGroup;
  cellPerson: any           = null;
  cellDay: MonthDay | null  = null;
  cellRoster: string | null = null;
  isClick: boolean          = false;

  // Bulk modal
  showBulkModal: boolean  = false;
  bulkForm: FormGroup;
  bulkWeekdays: any[] = [
    { value: 1, label: 'Mon', checked: true  },
    { value: 2, label: 'Tue', checked: true  },
    { value: 3, label: 'Wed', checked: true  },
    { value: 4, label: 'Thu', checked: true  },
    { value: 5, label: 'Fri', checked: true  },
    { value: 6, label: 'Sat', checked: true  },
    { value: 0, label: 'Sun', checked: false },
  ];
  bulkIsClick: boolean    = false;
  bulkErrorCheck: boolean = false;
  bulkErrorMsg: string    = '';

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private rosterService: RosterService,
    private shiftService: ShiftService,
    private staffService: StaffService,
    private teacherService: TeacherService,
  ) {
    this.cellForm = this.fb.group({ shiftId: ['', Validators.required] });
    this.bulkForm = this.fb.group({
      shiftId:   ['', Validators.required],
      fromDate:  ['', Validators.required],
      toDate:    ['', Validators.required],
      personIds: [[], Validators.required],
    });
  }

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id;
    const thisYear = new Date().getFullYear();
    for (let y = thisYear - 1; y <= thisYear + 1; y++) this.yearOptions.push(y);
    this.buildMonthDays();
    this.getShiftList();
    this.getPersonList();
  }

  // Native <select> can hand back strings — always read the period through these.
  private get year(): number  { return Number(this.selectedYear); }
  private get month(): number { return Number(this.selectedMonth); }

  buildMonthDays(): void {
    const y  = this.year;
    const mo = this.month;
    const days: MonthDay[] = [];
    const total = new Date(y, mo + 1, 0).getDate();
    for (let d = 1; d <= total; d++) {
      const mm  = `${mo + 1}`.padStart(2, '0');
      const dd  = `${d}`.padStart(2, '0');
      const dow = new Date(y, mo, d).getDay();
      days.push({
        day:       d,
        dateKey:   `${y}-${mm}-${dd}`,
        isWeekend: dow === 0,
      });
    }
    this.monthDays = days;
  }

  getShiftList(): void {
    this.shiftService.getShiftList(this.adminId).subscribe((res: any) => {
      if (res) this.shiftInfo = res.filter((s: any) => s.status === 'active');
    });
  }

  getPersonList(): void {
    if (this.personType === 'staff') {
      this.staffService.getStaffList(this.adminId).subscribe((res: any) => {
        this.personInfo = res || [];
        this.getRosterMonth();
      }, () => { this.personInfo = []; this.loader = false; });
    } else {
      this.teacherService.getTeacherList(this.adminId).subscribe((res: any) => {
        this.personInfo = res || [];
        this.getRosterMonth();
      }, () => { this.personInfo = []; this.loader = false; });
    }
  }

  getRosterMonth(): void {
    const y  = this.year;
    const mo = this.month;
    // "2026-08-" — used to discard any key that isn't the month on screen
    const prefix = `${y}-${`${mo + 1}`.padStart(2, '0')}-`;

    this.rosterService.getRosterMonth({
      adminId:    this.adminId,
      personType: this.personType,
      year:       String(y),
      month:      String(mo + 1),   // API/DB use 1-12; this.month is JS 0-11
    }).subscribe(
      (res: any) => {
        const raw: Record<string, string> = res?.rosterMap || {};
        const filtered: Record<string, string> = {};
        for (const key of Object.keys(raw)) {
          // key = "personId|YYYY-MM-DD"
          if (key.slice(key.indexOf('|') + 1).startsWith(prefix)) {
            filtered[key] = raw[key];
          }
        }
        this.rosterMap = filtered;
        this.loader = false;
      },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.loader = false; }
    );
  }

  switchPersonType(type: string): void {
    if (this.personType === type) return;
    this.personType = type;
    this.personInfo = [];
    this.rosterMap  = {};
    this.bulkForm.patchValue({ personIds: [] });
    this.getPersonList();
  }

  changeMonth(delta: number): void {
    let m = this.month + delta;
    let y = this.year;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    this.selectedMonth = m;
    this.selectedYear  = y;
    this.buildMonthDays();
    this.getRosterMonth();
  }

  onPeriodChange(): void {
    // Coerce back to numbers — <select> writes strings into the bound property.
    this.selectedYear  = this.year;
    this.selectedMonth = this.month;
    this.buildMonthDays();
    this.getRosterMonth();
  }

  // WRITE direction — datepicker gives LOCAL midnight; read LOCAL parts to avoid UTC shift.
  toDateKey(date: Date): string {
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${mm}-${dd}`;
  }

  // Staff and Teacher have different human-readable identifiers. Shown next to the
  // name so two people with the same name are always distinguishable.
  personCode(person: any): string {
    const code = this.personType === 'staff' ? person?.empCode : person?.teacherUserId;
    return (code === 0 || code) ? String(code) : '';
  }

  personLabel(person: any): string {
    const code = this.personCode(person);
    return code ? `${person?.name} (${code})` : `${person?.name}`;
  }

  getRosterCell(personId: string, dateKey: string): string | null {
    return this.rosterMap[`${personId}|${dateKey}`] || null;
  }

  getShift(shiftId: string): any {
    return this.shiftInfo.find((s: any) => s._id === shiftId);
  }

  shiftShortName(shiftId: string): string {
    const s = this.getShift(shiftId);
    return s ? s.name.trim().charAt(0).toUpperCase() : '?';
  }

  shiftTooltip(shiftId: string): string {
    const s = this.getShift(shiftId);
    return s ? `${s.name} (${s.startTime} - ${s.endTime})` : 'Unknown shift';
  }

  shiftColorIndex(shiftId: string): number {
    const i = this.shiftInfo.findIndex((s: any) => s._id === shiftId);
    return i >= 0 ? i % 6 : 0;
  }

  // ---- Single-cell modal ----

  cellClick(person: any, day: MonthDay): void {
    this.cellPerson = person;
    this.cellDay    = day;
    this.cellRoster = this.getRosterCell(person._id, day.dateKey);
    this.errorCheck = false;
    this.errorMsg   = '';
    this.isClick    = false;
    this.cellForm.reset({ shiftId: this.cellRoster || '' });
    this.showModal  = true;
  }

  closeModal(): void {
    this.showModal  = false;
    this.cellPerson = null;
    this.cellDay    = null;
    this.cellRoster = null;
    this.errorCheck = false;
    this.errorMsg   = '';
  }

  successDone(msg: string): void {
    this.closeModal();
    this.getRosterMonth();
    setTimeout(() => this.toastr.success('', msg), 500);
  }

  cellAssign(): void {
    if (!this.cellForm.valid || !this.cellPerson || !this.cellDay || this.isClick) return;
    this.errorCheck = false;
    this.errorMsg   = '';
    this.isClick    = true;

    this.rosterService.addRoster({
      adminId:    this.adminId,
      personType: this.personType,
      personId:   this.cellPerson._id,
      shiftId:    this.cellForm.value.shiftId,
      date:       this.cellDay.dateKey,
    }).subscribe(
      (res: any) => { this.isClick = false; this.successDone(res); },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.isClick = false; }
    );
  }

  cellClear(): void {
    if (!this.cellRoster || !this.cellPerson || !this.cellDay || this.isClick) return;
    this.isClick = true;

    this.rosterService.deleteRoster({
      adminId:    this.adminId,
      personType: this.personType,
      personId:   this.cellPerson._id,
      date:       this.cellDay.dateKey,
    }).subscribe(
      (res: any) => { this.isClick = false; this.successDone(res); },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.isClick = false; }
    );
  }

  // ---- Bulk modal ----

  openBulkModal(): void {
    this.showBulkModal  = true;
    this.bulkIsClick    = false;
    this.bulkErrorCheck = false;
    this.bulkErrorMsg   = '';
    const y  = this.year;
    const mo = this.month;
    this.bulkForm.reset({
      shiftId:   '',
      fromDate:  new Date(y, mo, 1),
      toDate:    new Date(y, mo + 1, 0),
      personIds: [],
    });
  }

  closeBulkModal(): void {
    this.showBulkModal  = false;
    this.bulkErrorCheck = false;
    this.bulkErrorMsg   = '';
  }

  toggleBulkWeekday(weekday: any): void { weekday.checked = !weekday.checked; }

  selectAllPersons(): void {
    this.bulkForm.patchValue({ personIds: this.personInfo.map((p: any) => p._id) });
  }

  buildBulkParams(): any {
    return {
      adminId:    this.adminId,
      personType: this.personType,
      personIds:  this.bulkForm.value.personIds,
      shiftId:    this.bulkForm.value.shiftId,
      fromDate:   this.toDateKey(new Date(this.bulkForm.value.fromDate)),
      toDate:     this.toDateKey(new Date(this.bulkForm.value.toDate)),
      weekdays:   this.bulkWeekdays.filter(w => w.checked).map(w => w.value),
    };
  }

  bulkAssign(): void {
    if (!this.bulkForm.valid || this.bulkIsClick) return;
    this.bulkErrorCheck = false;
    this.bulkErrorMsg   = '';
    this.bulkIsClick    = true;

    this.rosterService.bulkAssignRoster(this.buildBulkParams()).subscribe(
      (res: any) => {
        this.bulkIsClick = false;
        this.closeBulkModal();
        this.getRosterMonth();
        setTimeout(() => this.toastr.success('', `${res.assignedCount} day(s) assigned.`), 500);
      },
      (err: any) => { this.bulkErrorCheck = true; this.bulkErrorMsg = err.error; this.bulkIsClick = false; }
    );
  }

  bulkClear(): void {
    const v = this.bulkForm.value;
    if (!v.personIds?.length || !v.fromDate || !v.toDate) {
      this.bulkErrorCheck = true;
      this.bulkErrorMsg   = 'Select people and a date range to clear.';
      return;
    }
    if (this.bulkIsClick) return;
    this.bulkErrorCheck = false;
    this.bulkErrorMsg   = '';
    this.bulkIsClick    = true;

    this.rosterService.bulkClearRoster(this.buildBulkParams()).subscribe(
      (res: any) => {
        this.bulkIsClick = false;
        this.closeBulkModal();
        this.getRosterMonth();
        setTimeout(() => this.toastr.success('', `${res.clearedCount} day(s) cleared.`), 500);
      },
      (err: any) => { this.bulkErrorCheck = true; this.bulkErrorMsg = err.error; this.bulkIsClick = false; }
    );
  }
}