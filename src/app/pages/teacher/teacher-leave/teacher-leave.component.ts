import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { AttendanceService } from 'src/app/services/attendance.service';
import { LeaveRequestService } from 'src/app/services/leave-request.service';
import { LeaveTypeService } from 'src/app/services/leave-type.service';
import { ToastrService } from 'ngx-toastr';

// The teacher-facing half of pages/admin/leave-request. Three deliberate differences:
//   1. READ-ONLY ON STATUS. There is no approve or reject and no delete — deciding leave is
//      an admin action, and the backend has no teacher-reachable route for either.
//   2. Two modes, not three: their OWN leave, and leave for a pupil of a class their
//      leavePermission covers. Staff are never reachable from here.
//   3. Nothing identifying is sent. POST /v1/leave-request/teacher takes adminId and the
//      teacher's own personId from the verified token, and strips both from the body — so
//      this page has no way to file against somebody else even if it tried.
//
// Scoping is enforced server-side, not here. Applying for a student outside the permitted
// classes is refused by CreateTeacherLeaveRequest, whatever this form sends.
@Component({
  selector: 'app-teacher-leave',
  templateUrl: './teacher-leave.component.html',
  styleUrls: ['./teacher-leave.component.css']
})
export class TeacherLeaveComponent implements OnInit {

  // 'teacher' = my own leave, 'student' = a pupil's.
  mode: string = 'teacher';

  // The teacher's own classes, from leavePermission. Empty means they have not been granted
  // leave access for any class, which is a different message from "no records".
  myClasses: string[] = [];
  selectedClass: string = '';
  permissionLoaded: boolean = false;

  leaveForm: FormGroup;
  showModal: boolean = false;
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  leaveRequestInfo: any[] = [];

  recordLimit: number = 5;
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;

  adminId!: string;
  teacherInfo: any;
  // TeacherModel._id — NOT the token's `id`, which is the teacher-USER record. Resolved from
  // the teacher lookup below, and used only to read this teacher's own list and balance;
  // the backend never trusts it on a write.
  myPersonId: string = '';

  peopleOptions: any[] = [];
  leaveTypeOptions: any[] = [];
  balanceInfo: any[] = [];
  balanceLoading: boolean = false;
  // Working days in the range currently picked, recomputed on every date change so the form
  // can refuse an over-long leave while it is still being filled in.
  plannedDays: number = 0;
  // Leave is applied for, not recorded after the fact. CreateTeacherLeaveRequest passes
  // allowPastDates: false unconditionally — there is no teacher-reachable backfill — so the
  // picker must not offer a date the backend is certain to refuse.
  today: Date = new Date();

  // Double-submit guard
  isClick: boolean = false;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private teacherAuthService: TeacherAuthService,
    private teacherService: TeacherService,
    private attendanceService: AttendanceService,
    private leaveRequestService: LeaveRequestService,
    private leaveTypeService: LeaveTypeService,
  ) {
    this.leaveForm = this.fb.group({
      personId: [''],
      leaveTypeId: ['', Validators.required],
      fromDate: ['', Validators.required],
      toDate: ['', Validators.required],
      reason: [''],
    })
  }

  ngOnInit(): void {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    // adminId, not id — a teacher's token carries the school separately from their own id,
    // and every /v1/... read here is school-scoped like the admin's.
    this.adminId = this.teacherInfo?.adminId;
    this.loadMyPermissions();
    this.getLeaveTypeOptions();
  }

  /**
   * The classes this teacher may apply for, plus their own teacher record id.
   *
   * Read from the permissions the side-nav has usually already cached; otherwise fetched the
   * same way it fetches them, so a hard refresh straight onto this URL still works.
   */
  private loadMyPermissions(): void {
    const cached = this.teacherAuthService.getPermissions();
    if (cached) {
      this.applyPermissions(cached);
      return;
    }
    if (!this.teacherInfo) { this.permissionLoaded = true; this.loader = false; return; }

    this.teacherService.getTeacherById({
      adminId: this.teacherInfo.adminId,
      teacherUserId: this.teacherInfo.id,
    }).subscribe(
      (res: any) => {
        if (res) this.teacherAuthService.setPermissions(res);
        this.applyPermissions(res);
      },
      () => { this.permissionLoaded = true; this.loader = false; }
    );
  }

  private applyPermissions(res: any): void {
    this.myPersonId = res?._id ? String(res._id) : '';

    // Optional-chained: leavePermission arrived in Phase 8, so a teacher saved before that
    // simply has no such field — the same treatment attendancePermission gets.
    const permission = res?.leavePermission;
    const classes: any[] = (permission?.status && Array.isArray(permission.classes))
      ? permission.classes
      : [];

    // 0 is the "none" sentinel every permission block defaults to, not a real class.
    this.myClasses = classes
      .filter((className) => Number(className) > 0)
      .map((className) => String(className));

    this.permissionLoaded = true;
    if (this.myClasses.length > 0) this.selectedClass = this.myClasses[0];

    this.getLeaveRequest({ page: 1 });
    setTimeout(() => { this.loader = false; }, 1000);
  }

  // True when the picker is worth showing at all — a picker with a single option is a
  // control that can only be set to what it already says.
  get showClassPicker(): boolean {
    return this.myClasses.length > 1;
  }

  get canApplyForStudents(): boolean {
    return this.myClasses.length > 0;
  }

  // Two-way bound to its mat-select, so the new value is already on the field by the time
  // selectionChange fires — this only has to reload what depends on it.
  switchMode(): void {
    this.leaveRequestInfo = [];
    this.peopleOptions = [];
    this.balanceInfo = [];
    this.getLeaveTypeOptions();
    this.getLeaveRequest({ page: 1 });
  }

  onClassChange(): void {
    this.peopleOptions = [];
    this.balanceInfo = [];
    this.leaveForm.patchValue({ personId: '' });
    this.getLeaveRequest({ page: 1 });
  }

  getLeaveRequest($event: any) {
    return new Promise((resolve, reject) => {
      // My-leave mode narrows to this one person; student mode shows the whole school's
      // student requests. Narrowing the latter to just this teacher's classes would need a
      // per-class filter the list endpoint does not take, and a teacher seeing that a pupil
      // elsewhere is on leave is not a disclosure worth a new endpoint.
      const filters: any = { status: 'all', personType: this.mode };
      if (this.mode === 'teacher') {
        if (!this.myPersonId) { this.leaveRequestInfo = []; return resolve(true); }
        filters.personId = this.myPersonId;
      }

      let params: any = {
        filters,
        page: $event.page,
        limit: $event.limit ? $event.limit : this.recordLimit,
        adminId: this.adminId,
      };
      this.recordLimit = params.limit;

      this.leaveRequestService.leaveRequestPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.leaveRequestInfo = res.leaveRequestList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countLeaveRequest });
          return resolve(true);
        }
      });
    });
  }

  getLeaveTypeOptions(): void {
    this.leaveTypeService.getApplicableLeaveTypeList(this.adminId, this.mode).subscribe(
      (res: any) => { this.leaveTypeOptions = res || []; },
      () => { this.leaveTypeOptions = []; }
    );
  }

  getPeopleOptions(): void {
    if (!this.selectedClass) { this.peopleOptions = []; return; }
    this.attendanceService.getAttendancePeople({
      adminId: this.adminId,
      personType: 'student',
      class: this.selectedClass,
    }).subscribe(
      (res: any) => { this.peopleOptions = res || []; },
      () => { this.peopleOptions = []; }
    );
  }

  private loadBalance(personId: string): void {
    this.balanceInfo = [];
    if (!personId) return;

    this.balanceLoading = true;
    this.leaveRequestService.getLeaveBalance({
      adminId: this.adminId,
      personType: this.mode,
      personId: personId,
      year: String(new Date().getFullYear()),
    }).subscribe(
      (res: any) => { this.balanceInfo = res || []; this.balanceLoading = false; },
      () => { this.balanceInfo = []; this.balanceLoading = false; }
    );
  }

  onPersonChange(): void {
    this.loadBalance(this.leaveForm.value.personId);
  }

  // ---- Reading a row ------------------------------------------------------
  //
  // The same five labels the admin approvals table shows, so a teacher and the office are
  // reading the same words about the same request. "Completed" is the display-only split of
  // Approved that the backend flags with isCompleted: the leave was taken and the row is
  // finished, as against one still to come.

  statusLabel(request: any): string {
    if (request.status === 'Approved' && request.isCompleted) return 'Completed';
    return request.status;
  }

  statusClass(request: any): string {
    return 'status-' + this.statusLabel(request).toLowerCase();
  }

  statusNote(request: any): string {
    switch (this.statusLabel(request)) {
      case 'Pending': return 'Waiting for approval';
      case 'Approved': return 'Marked on the attendance register';
      case 'Completed': return 'These leave days have passed';
      case 'Rejected': return 'Was never applied to attendance';
      case 'Cancelled': return 'Leave was undone, days returned to balance';
      default: return '';
    }
  }

  // A range cannot end before it starts, and neither end may be in the past.
  get minToDate(): Date {
    return this.leaveForm.value.fromDate ? new Date(this.leaveForm.value.fromDate) : this.today;
  }

  get selectedBalance(): any {
    const typeId = this.leaveForm.value.leaveTypeId;
    if (!typeId) return null;
    return this.balanceInfo.find((row: any) => String(row.leaveTypeId) === String(typeId)) || null;
  }

  // "Priya has 8 Sick Leave day(s) left of 12 this year." The same fact the old number-in-a-
  // box showed, written the way it would be said out loud. In my-leave mode the name is the
  // teacher's own, so it reads "You have ...".
  get balanceSentence(): string {
    const balance = this.selectedBalance;
    if (!balance) return '';
    // See the admin page: a person with no entitlement row reads back the type's school-wide
    // cap, which is not days they can actually take. notAssigned says so instead.
    if (balance.assigned === false) return '';
    if (this.mode === 'teacher') {
      return `You have ${balance.remaining} ${balance.name} day(s) left of ${balance.allocated} this year.`;
    }
    const student = this.peopleOptions.find(
      (option: any) => String(option._id) === String(this.leaveForm.value.personId),
    );
    const name = student && student.name ? student.name : 'This student';
    return `${name} has ${balance.remaining} ${balance.name} day(s) left of ${balance.allocated} this year.`;
  }

  // ---- Live day count and balance check -----------------------------------

  // Recomputed as soon as either picker changes, so the form can say "that is more than you
  // have left" before it is submitted rather than after a round-trip.
  onDateChange(): void {
    this.plannedDays = this.countWorkingDays(this.leaveForm.value.fromDate, this.leaveForm.value.toDate);
  }

  /**
   * Sundays excluded, matching WEEKLY_OFF_DAYS in the backend's expandLeaveDates.
   *
   * DECLARED HOLIDAYS ARE NOT EXCLUDED HERE — the browser does not have the school's holiday
   * calendar. So this count can only ever be equal to or LARGER than what the server will
   * grant, which means it errs towards warning about a leave the server would have allowed,
   * never towards letting through one it will refuse. createRequest applies the same balance
   * rule with the real holiday list and stays the authority.
   */
  private countWorkingDays(from: any, to: any): number {
    if (!from || !to) return 0;
    const start = new Date(from);
    const end = new Date(to);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

    let count = 0;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    // A guard against a pathological range rather than a real limit.
    let guard = 0;
    while (cursor <= last && guard < 400) {
      if (cursor.getDay() !== 0) count++;
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
    return count;
  }

  // A leave type nobody has granted this person cannot be approved, so saying so on the form
  // is kinder than letting the request sit Pending until the office hits the refusal.
  get notAssigned(): boolean {
    const balance = this.selectedBalance;
    return !!balance && balance.assigned === false;
  }

  get balanceExceeded(): boolean {
    const balance = this.selectedBalance;
    return !!balance && this.plannedDays > 0 && this.plannedDays > balance.remaining;
  }

  get exceededMessage(): string {
    const balance = this.selectedBalance;
    if (!balance) return '';
    const whose = this.mode === 'teacher' ? 'you have' : 'this student has';
    return `These dates come to ${this.plannedDays} working day(s), but ${whose} only `
      + `${balance.remaining} ${balance.name} day(s) left. Choose shorter dates.`;
  }

  closeModal() {
    this.showModal = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.plannedDays = 0;
  }

  addLeaveRequestModel() {
    this.showModal = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.balanceInfo = [];
    this.plannedDays = 0;
    this.leaveForm.reset({ personId: '', leaveTypeId: '', fromDate: '', toDate: '', reason: '' });

    if (this.mode === 'student') {
      this.getPeopleOptions();
    } else {
      // Own leave: there is nobody to pick, so the balance can load immediately.
      this.loadBalance(this.myPersonId);
    }
  }

  successDone(res: any) {
    this.closeModal();
    this.successMsg = '';
    this.getLeaveRequest({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  // The datepicker hands back a LOCAL-midnight Date. Reading its LOCAL parts — never
  // toISOString(), which shifts a day for anyone east of UTC — is the same conversion the
  // roster and admin leave pages use.
  private toDateKey(value: any): string {
    const date = new Date(value);
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${mm}-${dd}`;
  }

  leaveRequestAdd() {
    if (!this.leaveForm.valid) return;
    if (this.mode === 'student' && !this.leaveForm.value.personId) {
      this.errorCheck = true;
      this.errorMsg = 'Select a student!';
      return;
    }
    if (this.isClick) {
      return;
    }
    this.errorCheck = false;
    this.errorMsg = '';

    // Mirrors the backend guard so the teacher is told before the round-trip. The picker's
    // [min] already blocks it; this catches a value patched in some other way.
    const fromKey = this.toDateKey(this.leaveForm.value.fromDate);
    if (fromKey < this.toDateKey(this.today)) {
      this.errorCheck = true;
      this.errorMsg = 'Leave can only be applied from today onwards.';
      return;
    }
    // The submit button is already disabled in this state; this is the same guard for a form
    // submitted by keyboard. createRequest refuses it server-side either way.
    if (this.balanceExceeded) {
      this.errorCheck = true;
      this.errorMsg = this.exceededMessage;
      return;
    }
    this.isClick = true;

    // No adminId and no personId for own leave — the backend resolves both from the token
    // and strips them from the body if they are sent anyway.
    const data: any = {
      personType: this.mode,
      leaveTypeId: this.leaveForm.value.leaveTypeId,
      fromDate: fromKey,
      toDate: this.toDateKey(this.leaveForm.value.toDate),
      reason: this.leaveForm.value.reason || '',
    };
    if (this.mode === 'student') data.personId = this.leaveForm.value.personId;

    this.leaveRequestService.addTeacherLeaveRequest(data).subscribe((res: any) => {
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
