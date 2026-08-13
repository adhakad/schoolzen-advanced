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
  dateKey: string;
  isWeekend: boolean;
}

@Component({
  selector: 'app-roster',
  templateUrl: './roster.component.html',
  styleUrls: ['./roster.component.css']
})
export class RosterComponent implements OnInit {
  personType: string = 'staff';
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth();
  monthNames: string[] = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  yearOptions: number[] = [];

  monthDays: MonthDay[] = [];
  personInfo: any[] = [];
  shiftInfo: any[] = [];
  // `${personId}|${dateKey}` -> roster row, so a grid cell is an O(1) lookup
  rosterMap: any = {};

  errorMsg: String = '';
  errorCheck: Boolean = false;
  loader: Boolean = true;
  adminId!: string;

  // Single-cell assign modal
  showModal: boolean = false;
  cellForm: FormGroup;
  cellPerson: any = null;
  cellDay: MonthDay | null = null;
  cellRoster: any = null;
  isClick: boolean = false;

  // Bulk assign modal — its own guard/error state, so the two modals never block each other
  showBulkModal: boolean = false;
  bulkForm: FormGroup;
  bulkWeekdays: any[] = [
    { value: 1, label: 'Mon', checked: true },
    { value: 2, label: 'Tue', checked: true },
    { value: 3, label: 'Wed', checked: true },
    { value: 4, label: 'Thu', checked: true },
    { value: 5, label: 'Fri', checked: true },
    { value: 6, label: 'Sat', checked: true },
    { value: 0, label: 'Sun', checked: false },
  ];
  bulkIsClick: boolean = false;
  bulkErrorCheck: boolean = false;
  bulkErrorMsg: string = '';

  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private rosterService: RosterService, private shiftService: ShiftService, private staffService: StaffService, private teacherService: TeacherService) {
    this.cellForm = this.fb.group({
      shiftId: ['', Validators.required],
    })
    this.bulkForm = this.fb.group({
      shiftId: ['', Validators.required],
      fromDate: ['', Validators.required],
      toDate: ['', Validators.required],
      personIds: [[], Validators.required],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    const thisYear = new Date().getFullYear();
    for (let y = thisYear - 1; y <= thisYear + 1; y++) {
      this.yearOptions.push(y);
    }
    this.buildMonthDays();
    this.getShiftList();
    this.getPersonList();
  }

  // Day columns for the selected month, weekends flagged for tinting.
  buildMonthDays() {
    const days: MonthDay[] = [];
    const totalDays = new Date(this.selectedYear, this.selectedMonth + 1, 0).getDate();
    for (let day = 1; day <= totalDays; day++) {
      const month = `${this.selectedMonth + 1}`.padStart(2, '0');
      const dayPart = `${day}`.padStart(2, '0');
      const weekday = new Date(this.selectedYear, this.selectedMonth, day).getDay();
      days.push({
        day: day,
        dateKey: `${this.selectedYear}-${month}-${dayPart}`,
        isWeekend: weekday === 0,
      });
    }
    this.monthDays = days;
  }

  getShiftList() {
    this.shiftService.getShiftList(this.adminId).subscribe((res: any) => {
      if (res) {
        this.shiftInfo = res.filter((shift: any) => shift.status === 'active');
      }
    })
  }

  getPersonList() {
    if (this.personType === 'staff') {
      this.staffService.getStaffList(this.adminId).subscribe((res: any) => {
        if (res) {
          this.personInfo = res;
        }
        this.getRosterMonth();
      }, err => {
        this.personInfo = [];
        this.loader = false;
      })
    } else {
      this.teacherService.getTeacherList(this.adminId).subscribe((res: any) => {
        if (res) {
          this.personInfo = res;
        }
        this.getRosterMonth();
      }, err => {
        this.personInfo = [];
        this.loader = false;
      })
    }
  }

  getRosterMonth() {
    let params: any = {
      adminId: this.adminId,
      personType: this.personType,
      year: this.selectedYear,
      month: this.selectedMonth,
    };
    this.rosterService.getRosterMonth(params).subscribe((res: any) => {
      let map: any = {};
      if (res && res.rosterList) {
        for (const roster of res.rosterList) {
          // Stored as UTC midnight, so the UTC date parts are the calendar day.
          map[`${roster.personId}|${this.toDateKey(new Date(roster.date))}`] = roster;
        }
      }
      this.rosterMap = map;
      this.loader = false;
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.loader = false;
    })
  }

  switchPersonType(type: string) {
    if (this.personType === type) {
      return;
    }
    this.personType = type;
    this.personInfo = [];
    this.rosterMap = {};
    this.bulkForm.patchValue({ personIds: [] });
    this.getPersonList();
  }

  changeMonth(delta: number) {
    let month = this.selectedMonth + delta;
    if (month < 0) {
      month = 11;
      this.selectedYear = this.selectedYear - 1;
    } else if (month > 11) {
      month = 0;
      this.selectedYear = this.selectedYear + 1;
    }
    this.selectedMonth = month;
    this.buildMonthDays();
    this.getRosterMonth();
  }

  onPeriodChange() {
    this.buildMonthDays();
    this.getRosterMonth();
  }

  // A Date's LOCAL parts -> "YYYY-MM-DD". Always used before sending a date to the
  // backend: passing the raw Date would serialise to UTC and shift every roster by a
  // day for any school east or west of UTC.
  toDateKey(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  getRosterCell(personId: String, dateKey: string) {
    return this.rosterMap[`${personId}|${dateKey}`];
  }

  getShift(shiftId: String) {
    return this.shiftInfo.find((shift: any) => shift._id === shiftId);
  }

  shiftShortName(shiftId: String) {
    const shift = this.getShift(shiftId);
    return shift ? shift.name.toString().trim().charAt(0).toUpperCase() : '?';
  }

  shiftTooltip(shiftId: String) {
    const shift = this.getShift(shiftId);
    return shift ? `${shift.name} (${shift.startTime} - ${shift.endTime})` : 'Unknown shift';
  }

  // Stable colour per shift, so a cell and the legend always agree.
  shiftColorIndex(shiftId: String) {
    const index = this.shiftInfo.findIndex((shift: any) => shift._id === shiftId);
    return index >= 0 ? (index % 6) : 0;
  }

  cellClick(person: any, day: MonthDay) {
    this.cellPerson = person;
    this.cellDay = day;
    this.cellRoster = this.getRosterCell(person._id, day.dateKey);
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.cellForm.reset({ shiftId: this.cellRoster ? this.cellRoster.shiftId : '' });
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.cellPerson = null;
    this.cellDay = null;
    this.cellRoster = null;
    this.errorCheck = false;
    this.errorMsg = '';
  }

  successDone(res: any) {
    this.closeModal();
    this.getRosterMonth();
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  cellAssign() {
    if (this.cellForm.valid && this.cellPerson && this.cellDay) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;
      let params: any = {
        adminId: this.adminId,
        personType: this.personType,
        personId: this.cellPerson._id,
        shiftId: this.cellForm.value.shiftId,
        date: this.cellDay.dateKey,
      };
      this.rosterService.addRoster(params).subscribe((res: any) => {
        if (res) {
          this.isClick = false;
          this.successDone(res);
        }
      }, err => {
        this.errorCheck = true;
        this.errorMsg = err.error;
        this.isClick = false;
      })
    }
  }

  cellClear() {
    if (!this.cellRoster) {
      return;
    }
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.rosterService.deleteRoster(this.cellRoster._id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    })
  }

  openBulkModal() {
    this.showBulkModal = true;
    this.bulkIsClick = false;
    this.bulkErrorCheck = false;
    this.bulkErrorMsg = '';
    // Default the range to the month currently on screen.
    const firstDay = new Date(this.selectedYear, this.selectedMonth, 1);
    const lastDay = new Date(this.selectedYear, this.selectedMonth + 1, 0);
    this.bulkForm.reset({ shiftId: '', fromDate: firstDay, toDate: lastDay, personIds: [] });
  }

  closeBulkModal() {
    this.showBulkModal = false;
    this.bulkErrorCheck = false;
    this.bulkErrorMsg = '';
  }

  toggleBulkWeekday(weekday: any) {
    weekday.checked = !weekday.checked;
  }

  selectAllPersons() {
    this.bulkForm.patchValue({ personIds: this.personInfo.map((person: any) => person._id) });
  }

  buildBulkParams() {
    return {
      adminId: this.adminId,
      personType: this.personType,
      personIds: this.bulkForm.value.personIds,
      shiftId: this.bulkForm.value.shiftId,
      fromDate: this.toDateKey(new Date(this.bulkForm.value.fromDate)),
      toDate: this.toDateKey(new Date(this.bulkForm.value.toDate)),
      weekdays: this.bulkWeekdays.filter((weekday: any) => weekday.checked).map((weekday: any) => weekday.value),
    };
  }

  bulkAssign() {
    if (this.bulkForm.valid) {
      if (this.bulkIsClick) {
        return;
      }
      this.bulkErrorCheck = false;
      this.bulkErrorMsg = '';
      this.bulkIsClick = true;
      this.rosterService.bulkAssignRoster(this.buildBulkParams()).subscribe((res: any) => {
        this.bulkIsClick = false;
        this.closeBulkModal();
        this.getRosterMonth();
        setTimeout(() => {
          this.toastr.success('', `${res.assignedCount} day(s) assigned.`);
        }, 500);
      }, err => {
        this.bulkErrorCheck = true;
        this.bulkErrorMsg = err.error;
        this.bulkIsClick = false;
      })
    }
  }

  // Same range/person selection as bulkAssign, minus the shift — the only practical way to
  // undo a bulk assign made over the wrong range.
  bulkClear() {
    if (!this.bulkForm.value.personIds || this.bulkForm.value.personIds.length === 0 || !this.bulkForm.value.fromDate || !this.bulkForm.value.toDate) {
      this.bulkErrorCheck = true;
      this.bulkErrorMsg = 'Select the people and the date range you want to clear.';
      return;
    }
    if (this.bulkIsClick) {
      return;
    }
    this.bulkErrorCheck = false;
    this.bulkErrorMsg = '';
    this.bulkIsClick = true;
    this.rosterService.bulkClearRoster(this.buildBulkParams()).subscribe((res: any) => {
      this.bulkIsClick = false;
      this.closeBulkModal();
      this.getRosterMonth();
      setTimeout(() => {
        this.toastr.success('', `${res.clearedCount} day(s) cleared.`);
      }, 500);
    }, err => {
      this.bulkErrorCheck = true;
      this.bulkErrorMsg = err.error;
      this.bulkIsClick = false;
    })
  }
}
