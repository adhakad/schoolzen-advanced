import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { toAmPm } from 'src/app/pipes/time-am-pm.pipe';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassShiftService } from 'src/app/services/class-shift.service';
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
  // Active shifts only — what the assign dropdown offers and what the legend lists.
  shiftInfo: any[]       = [];
  // EVERY shift, deactivated ones included, keyed by id. A rostered cell must always be
  // able to name the shift it points at — see getShiftList().
  shiftById: Record<string, any> = {};

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

  // ---- STUDENT TAB (ClassShift) ------------------------------------------
  // Students are NOT rostered day by day — there is no grid on this tab and no period
  // picker, because a class's shift is permanent until somebody changes it. One row per
  // class covers every pupil in it for every date at once, which is why the backend model
  // (class-shift.js) has no date dimension.
  //
  // Everything below is additive: the staff/teacher state above is untouched.
  classOptions: String[]    = [];
  classShiftInfo: any[]     = [];   // current class -> shift assignments, with the shift joined in
  selectedClasses: String[] = [];   // ticked chips in the assign form
  studentShiftId: string    = '';
  studentIsClick: boolean   = false;
  studentErrorCheck: boolean = false;
  studentErrorMsg: string    = '';

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private classShiftService: ClassShiftService,
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

  // RESOLVING a shift and OFFERING one are different questions, and conflating them was a
  // bug: a cell rostered weeks ago may point at a shift since deactivated, and filtering it
  // out of the lookup made that cell render as a '?' chip with an "Unknown shift" tooltip —
  // an assignment that is perfectly real, shown as if it were broken. Every shift goes into
  // the lookup; only the ASSIGNABLE list is filtered to active ones.
  getShiftList(): void {
    this.shiftService.getShiftList(this.adminId).subscribe((res: any) => {
      if (!res) return;
      this.shiftById = {};
      for (const shift of res) this.shiftById[shift._id] = shift;
      this.shiftInfo = res.filter((s: any) => s.status === 'active');
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

    // Students take a completely different path — no person list, no monthly roster fetch.
    // Neither is meaningful for them: getPersonList() would call a staff/teacher service,
    // and getRosterMonth() would query a collection whose personType enum excludes them.
    if (type === 'student') {
      this.loader = true;
      this.getClassOptions();
      this.getClassShiftList();
      return;
    }
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
    return this.shiftById[shiftId] || null;
  }

  shiftShortName(shiftId: string): string {
    const s = this.getShift(shiftId);
    return s ? s.name.trim().charAt(0).toUpperCase() : '?';
  }

  shiftTooltip(shiftId: string): string {
    const s = this.getShift(shiftId);
    // toAmPm, not the timeAmPm pipe — this string is built here rather than in the
    // template, so a pipe cannot reach it. Same function the pipe delegates to, so the
    // tooltip and the legend below the grid can never disagree about the format.
    return s ? `${s.name} (${toAmPm(s.startTime)} - ${toAmPm(s.endTime)})` : 'Unknown shift';
  }

  // Colour comes from the shift's position in the ACTIVE list, so a cell and the legend
  // below the grid always agree. A deactivated shift has no legend entry to agree with, so
  // it gets a neutral grey of its own rather than silently borrowing the first shift's
  // purple and reading as that shift.
  shiftChipClass(shiftId: string): string {
    const i = this.shiftInfo.findIndex((s: any) => s._id === shiftId);
    return i >= 0 ? `shift-chip shift-color-${i % 6}` : 'shift-chip shift-color-retired';
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

  // ==========================================================================
  // STUDENT TAB — class -> shift assignment
  //
  // Nothing below touches the staff/teacher grid, its modals, or its month navigation.
  // A student's shift is a property of their CLASS, so there is no per-person cell to
  // click and no month to page through: one assignment stands until it is changed.
  // ==========================================================================

  // The classes this school actually runs, from its own student records — not the global
  // /v1/class table, which returns the same 15 rows to every school.
  getClassOptions(): void {
    this.classShiftService.getClassOptions(this.adminId).subscribe(
      (res: any) => { this.classOptions = res || []; },
      ()          => { this.classOptions = []; }
    );
  }

  getClassShiftList(): void {
    this.classShiftService.getClassShiftList(this.adminId).subscribe(
      (res: any) => { this.classShiftInfo = res || []; this.loader = false; },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.loader = false; }
    );
  }

  // ---- Class chip selection ----

  toggleClass(classKey: String): void {
    const index = this.selectedClasses.indexOf(classKey);
    if (index > -1) this.selectedClasses.splice(index, 1);
    else this.selectedClasses.push(classKey);
  }

  isClassSelected(classKey: String): boolean {
    return this.selectedClasses.indexOf(classKey) > -1;
  }

  selectAllClasses(): void {
    this.selectedClasses = [...this.classOptions];
  }

  clearClasses(): void {
    this.selectedClasses = [];
  }

  // "Class 1-5" / "Class 6-10" shortcuts. Filters the school's OWN class list numerically
  // rather than assuming 1..12 exist — a school that only runs up to class 8 just gets
  // fewer chips selected instead of a range that half-misses.
  // Sentinel classes 200/201/202 (Nursery/LKG/UKG) sort far above any real range, so they
  // are never caught by these.
  selectClassRange(from: number, to: number): void {
    this.selectedClasses = this.classOptions.filter((classKey: String) => {
      const value = Number(classKey);
      return Number.isFinite(value) && value >= from && value <= to;
    });
  }

  // The classSuffix pipe is typed for a number and compares numerically ("1st", "Nursery"
  // for the 200/201/202 sentinels). Class keys travel as strings here to match the
  // ClassShift model, so coerce at the render boundary rather than widening a shared pipe.
  classNumber(classKey: any): number {
    return Number(classKey);
  }

  // The shift a class is currently on, shown inline on the chip so the consequence of
  // ticking it is visible before submitting.
  // Returns a primitive `string`, not the `String` wrapper the models use — the titlecase
  // pipe only accepts the primitive.
  currentShiftName(classKey: String): string {
    const row = this.classShiftInfo.find((item: any) => String(item.class) === String(classKey));
    return row ? String(row.shiftName) : '';
  }

  // ---- Assign ----

  // Seeds the form from an existing row so "Change" is one click away from being submitted,
  // rather than making the user hunt for that class in the chip list.
  changeClassShift(row: any): void {
    this.selectedClasses    = [String(row.class)];
    this.studentShiftId     = String(row.shiftId);
    this.studentErrorCheck  = false;
    this.studentErrorMsg    = '';
  }

  studentAssign(): void {
    if (!this.studentShiftId || this.selectedClasses.length === 0) {
      this.studentErrorCheck = true;
      this.studentErrorMsg   = 'Select a shift and at least one class.';
      return;
    }
    if (this.studentIsClick) return;
    this.studentErrorCheck = false;
    this.studentErrorMsg   = '';
    this.studentIsClick    = true;

    this.classShiftService.bulkAssignClassShift({
      adminId: this.adminId,
      shiftId: this.studentShiftId,
      classes: this.selectedClasses,
    }).subscribe(
      (res: any) => {
        this.studentIsClick  = false;
        this.selectedClasses = [];
        this.studentShiftId  = '';
        this.getClassShiftList();
        setTimeout(() => this.toastr.success('', res), 500);
      },
      (err: any) => {
        this.studentErrorCheck = true;
        this.studentErrorMsg   = err.error;
        this.studentIsClick    = false;
      }
    );
  }
}