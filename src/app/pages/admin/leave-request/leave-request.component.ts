import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceService } from 'src/app/services/attendance.service';
import { ClassShiftService } from 'src/app/services/class-shift.service';
import { LeaveRequestService } from 'src/app/services/leave-request.service';
import { LeaveTypeService } from 'src/app/services/leave-type.service';
import { ToastrService } from 'ngx-toastr';

// The approval desk. Apply on anyone's behalf, then approve or reject.
//
// APPROVE IS THE ONLY DESTRUCTIVE-FEELING ACTION HERE, because it writes one
// DailyAttendance row per granted day. Reject writes nothing. Delete on an APPROVED request
// is the undo — it removes those rows again and queues the days for recompute — which is
// why it confirms through the same modal rather than firing from the icon directly.
//
// The person picker deliberately reuses AttendanceService.getAttendancePeople: staff,
// teachers and students spell "active" three different ways across their collections, and
// that endpoint already owns the quirk (services/person-lookup.js). Re-deriving it here
// would be a second place to get it wrong.
@Component({
  selector: 'app-leave-request',
  templateUrl: './leave-request.component.html',
  styleUrls: ['./leave-request.component.css']
})
export class LeaveRequestComponent implements OnInit {
  leaveForm: FormGroup;
  showModal: boolean = false;
  // Create is the default modal body; these three each swap it for a confirmation.
  deleteMode: boolean = false;
  approveMode: boolean = false;
  rejectMode: boolean = false;
  actionRequest: any = null;

  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  leaveRequestInfo: any[] = [];

  // Pending first: this page exists to clear a queue, and an admin opening it wants the
  // things waiting on them, not a history.
  statusFilter: string = 'Pending';
  personTypeFilter: string = 'all';

  recordLimit: number = 5;
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  adminId!: string;
  adminName: string = '';

  // ---- Apply-form state ---------------------------------------------------
  formPersonType: string = 'staff';
  formClass: string = '';
  classOptions: String[] = [];
  peopleOptions: any[] = [];
  leaveTypeOptions: any[] = [];
  balanceInfo: any[] = [];
  balanceLoading: boolean = false;

  // Double-submit guard
  isClick: boolean = false;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private attendanceService: AttendanceService,
    private classShiftService: ClassShiftService,
    private leaveRequestService: LeaveRequestService,
    private leaveTypeService: LeaveTypeService,
  ) {
    this.leaveForm = this.fb.group({
      personId: ['', Validators.required],
      leaveTypeId: ['', Validators.required],
      fromDate: ['', Validators.required],
      toDate: ['', Validators.required],
      reason: [''],
    })
  }

  ngOnInit(): void {
    const admin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = admin?.id;
    this.adminName = admin?.name || '';
    this.getClassOptions();
    let load: any = this.getLeaveRequest({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  getClassOptions(): void {
    this.classShiftService.getClassOptions(this.adminId).subscribe(
      (res: any) => { this.classOptions = res || []; },
      () => { this.classOptions = []; }
    );
  }

  classNumber(classKey: any): number {
    return Number(classKey);
  }

  getLeaveRequest($event: any) {
    return new Promise((resolve, reject) => {
      let params: any = {
        filters: {
          status: this.statusFilter,
          personType: this.personTypeFilter,
        },
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

  switchStatus(status: string): void {
    this.statusFilter = status;
    this.getLeaveRequest({ page: 1 });
  }

  switchPersonTypeFilter(personType: string): void {
    this.personTypeFilter = personType;
    this.getLeaveRequest({ page: 1 });
  }

  // ---- Apply form ---------------------------------------------------------

  // Changing the person type invalidates BOTH dependent lists: the people, and the leave
  // types (a type may be restricted to one kind of person). Clearing the selections too,
  // rather than leaving a stale id in the form, is what stops a staff member being filed
  // against a student-only leave type.
  switchFormPersonType(personType: string): void {
    this.formPersonType = personType;
    this.formClass = '';
    this.peopleOptions = [];
    this.balanceInfo = [];
    this.leaveForm.patchValue({ personId: '', leaveTypeId: '' });
    this.getLeaveTypeOptions();
    if (personType !== 'student') this.getPeopleOptions();
  }

  onFormClassChange(): void {
    this.peopleOptions = [];
    this.balanceInfo = [];
    this.leaveForm.patchValue({ personId: '' });
    if (this.formClass) this.getPeopleOptions();
  }

  getPeopleOptions(): void {
    const params: any = { adminId: this.adminId, personType: this.formPersonType };
    if (this.formPersonType === 'student') params.class = this.formClass;

    this.attendanceService.getAttendancePeople(params).subscribe(
      (res: any) => { this.peopleOptions = res || []; },
      () => { this.peopleOptions = []; }
    );
  }

  getLeaveTypeOptions(): void {
    this.leaveTypeService.getApplicableLeaveTypeList(this.adminId, this.formPersonType).subscribe(
      (res: any) => { this.leaveTypeOptions = res || []; },
      () => { this.leaveTypeOptions = []; }
    );
  }

  // Balance is per person AND per year, so it can only be fetched once a person is chosen.
  // Fetched for every type at once rather than for the selected one, so switching type in
  // the dropdown does not cost another round-trip.
  onPersonChange(): void {
    this.balanceInfo = [];
    const personId = this.leaveForm.value.personId;
    if (!personId) return;

    this.balanceLoading = true;
    this.leaveRequestService.getLeaveBalance({
      adminId: this.adminId,
      personType: this.formPersonType,
      personId: personId,
      year: String(new Date().getFullYear()),
    }).subscribe(
      (res: any) => { this.balanceInfo = res || []; this.balanceLoading = false; },
      () => { this.balanceInfo = []; this.balanceLoading = false; }
    );
  }

  // The row of the balance strip matching whatever type is currently selected.
  get selectedBalance(): any {
    const typeId = this.leaveForm.value.leaveTypeId;
    if (!typeId) return null;
    return this.balanceInfo.find((row: any) => String(row.leaveTypeId) === String(typeId)) || null;
  }

  // ---- Modal state --------------------------------------------------------

  closeModal() {
    this.showModal = false;
    this.deleteMode = false;
    this.approveMode = false;
    this.rejectMode = false;
    this.actionRequest = null;
    this.errorCheck = false;
    this.errorMsg = '';
  }

  private openModal(): void {
    this.showModal = true;
    this.deleteMode = false;
    this.approveMode = false;
    this.rejectMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
  }

  addLeaveRequestModel() {
    this.openModal();
    this.actionRequest = null;
    this.formPersonType = 'staff';
    this.formClass = '';
    this.peopleOptions = [];
    this.balanceInfo = [];
    this.leaveForm.reset({ personId: '', leaveTypeId: '', fromDate: '', toDate: '', reason: '' });
    this.getLeaveTypeOptions();
    this.getPeopleOptions();
  }

  approveLeaveRequestModel(request: any) {
    this.openModal();
    this.approveMode = true;
    this.actionRequest = request;
  }

  rejectLeaveRequestModel(request: any) {
    this.openModal();
    this.rejectMode = true;
    this.actionRequest = request;
  }

  deleteLeaveRequestModel(request: any) {
    this.openModal();
    this.deleteMode = true;
    this.actionRequest = request;
  }

  successDone(res: any) {
    this.closeModal();
    this.successMsg = '';
    this.getLeaveRequest({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  private handleError(err: any) {
    this.errorCheck = true;
    this.errorMsg = err.error;
    this.isClick = false;
  }

  // ---- Actions ------------------------------------------------------------

  // The datepicker hands back a LOCAL-midnight Date. Reading its LOCAL parts — never
  // toISOString(), which shifts a day for anyone east of UTC — is the same conversion
  // roster.component.ts uses, and the backend expects exactly this "YYYY-MM-DD" shape.
  private toDateKey(value: any): string {
    const date = new Date(value);
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${mm}-${dd}`;
  }

  leaveRequestAdd() {
    if (!this.leaveForm.valid) return;
    if (this.isClick) {
      return;
    }
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;

    const data = {
      adminId: this.adminId,
      personType: this.formPersonType,
      personId: this.leaveForm.value.personId,
      leaveTypeId: this.leaveForm.value.leaveTypeId,
      fromDate: this.toDateKey(this.leaveForm.value.fromDate),
      toDate: this.toDateKey(this.leaveForm.value.toDate),
      reason: this.leaveForm.value.reason || '',
    };

    this.leaveRequestService.addLeaveRequest(data).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => this.handleError(err))
  }

  leaveRequestApprove() {
    if (!this.actionRequest || this.isClick) {
      return;
    }
    this.isClick = true;
    this.leaveRequestService.approveLeaveRequest(this.actionRequest._id, { actionBy: this.adminName })
      .subscribe((res: any) => {
        if (res) {
          this.isClick = false;
          this.successDone(res);
        }
      }, err => this.handleError(err))
  }

  leaveRequestReject() {
    if (!this.actionRequest || this.isClick) {
      return;
    }
    this.isClick = true;
    this.leaveRequestService.rejectLeaveRequest(this.actionRequest._id, { actionBy: this.adminName })
      .subscribe((res: any) => {
        if (res) {
          this.isClick = false;
          this.successDone(res);
        }
      }, err => this.handleError(err))
  }

  leaveRequestDelete() {
    if (!this.actionRequest || this.isClick) {
      return;
    }
    this.isClick = true;
    this.leaveRequestService.deleteLeaveRequest(this.actionRequest._id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => this.handleError(err))
  }
}
