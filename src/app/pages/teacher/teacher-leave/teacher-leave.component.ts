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

  classNumber(classKey: any): number {
    return Number(classKey);
  }

  switchMode(mode: string): void {
    this.mode = mode;
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

  get selectedBalance(): any {
    const typeId = this.leaveForm.value.leaveTypeId;
    if (!typeId) return null;
    return this.balanceInfo.find((row: any) => String(row.leaveTypeId) === String(typeId)) || null;
  }

  closeModal() {
    this.showModal = false;
    this.errorCheck = false;
    this.errorMsg = '';
  }

  addLeaveRequestModel() {
    this.showModal = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.balanceInfo = [];
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
    this.isClick = true;

    // No adminId and no personId for own leave — the backend resolves both from the token
    // and strips them from the body if they are sent anyway.
    const data: any = {
      personType: this.mode,
      leaveTypeId: this.leaveForm.value.leaveTypeId,
      fromDate: this.toDateKey(this.leaveForm.value.fromDate),
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
