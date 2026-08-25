import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceService } from 'src/app/services/attendance.service';
import { ClassShiftService } from 'src/app/services/class-shift.service';
import { LeaveRequestService } from 'src/app/services/leave-request.service';
import { LeaveTypeService } from 'src/app/services/leave-type.service';
import { ToastrService } from 'ngx-toastr';

// THE APPROVALS QUEUE, AND NOTHING ELSE.
//
// Apply on somebody's behalf, then approve, reject or cancel. Setting how many days a person
// is allowed lives on its own settings page (pages/admin/leave-limit) — it used to be a
// second tab here and the two jobs crowded each other.
//
// Approve is the only action that writes DailyAttendance (one row per granted day). Reject
// writes nothing. Cancel is the undo for an APPROVED leave: it removes those rows again and
// keeps the request as a record with its reason. The two are never merged — declining a
// request and taking back a granted one are different decisions with different consequences.
// Delete erases the request entirely and is offered only on Rejected and Cancelled rows.
//
// COMPLETED IS A LABEL, NOT A STATUS. An approved leave whose last day has passed is still
// stored as 'Approved'; the row shows "Completed" and offers no action, because there is
// nothing left to take back and the backend refuses to cancel it.
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
  // Create is the default modal body; these four each swap it for a confirmation.
  deleteMode: boolean = false;
  approveMode: boolean = false;
  rejectMode: boolean = false;
  cancelMode: boolean = false;
  actionRequest: any = null;

  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  leaveRequestInfo: any[] = [];

  // Pending first: this page exists to clear a queue, and an admin opening it wants the
  // things waiting on them, not a history.
  statusFilter: string = 'Pending';
  personTypeFilter: string = 'all';
  // Shown against the Pending option so the queue's size is visible before it is opened.
  // Read from the same pagination endpoint with limit 1, so the count is always the
  // backend's own and needs no extra route.
  pendingCount: number = 0;

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
  // Working days in the range currently picked, recomputed on every date change so the form
  // can refuse an over-long leave before it is submitted.
  plannedDays: number = 0;
  // Leave is applied for, not recorded after the fact — the backend rejects a past fromDate
  // outright, so the picker must not offer one either.
  today: Date = new Date();

  // ---- Approve-override state ---------------------------------------------
  // The backend refuses an approval that would overdraw the balance. That is a policy, not a
  // law: this flag turns the refusal into an "Approve anyway" the admin can take responsibility
  // for, which re-sends the same call with forceApprove.
  balanceBlocked: boolean = false;

  // ---- Cancel state -------------------------------------------------------
  cancelReason: string = '';

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
    this.getPendingCount();
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

  // One row is fetched purely for its count — the filter needs the number, not the rows.
  getPendingCount(): void {
    this.leaveRequestService.leaveRequestPaginationList({
      adminId: this.adminId,
      filters: { status: 'Pending', personType: 'all' },
      page: 1,
      limit: 1,
    }).subscribe(
      (res: any) => { this.pendingCount = res ? res.countLeaveRequest : 0; },
      () => { this.pendingCount = 0; }
    );
  }

  // Both filters are two-way bound to their mat-select, so the new value is already on the
  // field by the time selectionChange fires — these only have to refetch.
  switchStatus(): void {
    this.getLeaveRequest({ page: 1 });
  }

  switchPersonTypeFilter(): void {
    this.getLeaveRequest({ page: 1 });
  }

  // ---- Reading a row ------------------------------------------------------

  // The four stored statuses become five labels. "Completed" is the display-only split of
  // Approved that the backend flags with isCompleted — see the class header.
  statusLabel(request: any): string {
    if (request.status === 'Approved' && request.isCompleted) return 'Completed';
    return request.status;
  }

  // The colour class. Completed gets its own so a finished leave does not read as a live one.
  statusClass(request: any): string {
    return 'status-' + this.statusLabel(request).toLowerCase();
  }

  // One plain line under the badge saying what the status MEANS for attendance and balance.
  // Somebody who has never seen this page should be able to tell Approved, Completed,
  // Rejected and Cancelled apart by reading the row, which a single coloured word cannot do.
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

  // Cancel undoes an approval by deleting the attendance rows it wrote. Once the last day has
  // passed there is nothing to undo — the leave was actually taken — so the row goes
  // read-only. The backend refuses it too; this only stops the button being offered.
  canCancel(request: any): boolean {
    return request.status === 'Approved' && !request.isCompleted;
  }

  // ---- Apply form ---------------------------------------------------------

  // Changing the person type invalidates BOTH dependent lists: the people, and the leave
  // types (a type may be restricted to one kind of person). Clearing the selections too,
  // rather than leaving a stale id in the form, is what stops a staff member being filed
  // against a student-only leave type.
  switchFormPersonType(): void {
    this.formClass = '';
    this.peopleOptions = [];
    this.balanceInfo = [];
    this.leaveForm.patchValue({ personId: '', leaveTypeId: '' });
    this.getLeaveTypeOptions();
    if (this.formPersonType !== 'student') this.getPeopleOptions();
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

  // The balance row matching whatever type is currently selected.
  get selectedBalance(): any {
    const typeId = this.leaveForm.value.leaveTypeId;
    if (!typeId) return null;
    return this.balanceInfo.find((row: any) => String(row.leaveTypeId) === String(typeId)) || null;
  }

  // "Priya has 8 Sick Leave day(s) left of 12 this year." The same fact the old number-in-a-
  // box showed, written the way a clerk would say it out loud — and naming the person, so it
  // is obvious whose balance is on screen after the dropdown above has been changed twice.
  get balanceSentence(): string {
    const balance = this.selectedBalance;
    if (!balance) return '';
    // Nothing to report for a person who was never given this leave — GetLeaveBalance falls
    // back to the type's school-wide cap for them, and quoting it would promise days that
    // cannot be approved. The notAssigned warning replaces this line entirely.
    if (balance.assigned === false) return '';
    const person = this.peopleOptions.find(
      (option: any) => String(option._id) === String(this.leaveForm.value.personId),
    );
    const name = person && person.name ? person.name : 'This person';
    return `${name} has ${balance.remaining} ${balance.name} day(s) left of ${balance.allocated} this year.`;
  }

  // A range cannot end before it starts, and neither end may be in the past.
  get minToDate(): Date {
    return this.leaveForm.value.fromDate ? new Date(this.leaveForm.value.fromDate) : this.today;
  }

  // ---- Live day count and balance check -----------------------------------

  // Recomputed as soon as either picker changes, so the form can say "that is more than
  // Priya has left" while the admin is still filling it in rather than after a round-trip.
  onDateChange(): void {
    this.plannedDays = this.countWorkingDays(this.leaveForm.value.fromDate, this.leaveForm.value.toDate);
  }

  /**
   * Sundays excluded, matching WEEKLY_OFF_DAYS in the backend's expandLeaveDates.
   *
   * DECLARED HOLIDAYS ARE NOT EXCLUDED HERE — the browser does not have the school's holiday
   * calendar, and fetching it per keystroke to shave a day off a preview would be a poor
   * trade. So this count can only ever be equal to or LARGER than what the server will
   * actually grant, which means it errs towards warning about a leave the server would have
   * allowed, never towards letting through one it will refuse. The server stays the
   * authority; createRequest applies the same balance rule with the real holiday list.
   */
  private countWorkingDays(from: any, to: any): number {
    if (!from || !to) return 0;
    const start = new Date(from);
    const end = new Date(to);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

    let count = 0;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    // A guard against a pathological range rather than a real limit — a year of leave is
    // already well past anything a school grants.
    let guard = 0;
    while (cursor <= last && guard < 400) {
      if (cursor.getDay() !== 0) count++;
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
    return count;
  }

  // True only when there is a real balance to compare against. A person with no entitlement
  // for this type has no row at all, and the "not assigned" hint below covers that case.
  get balanceExceeded(): boolean {
    const balance = this.selectedBalance;
    return !!balance && this.plannedDays > 0 && this.plannedDays > balance.remaining;
  }

  // A leave type nobody has granted this person cannot be approved, so saying so on the form
  // is kinder than letting the request sit Pending until an admin hits the refusal.
  get notAssigned(): boolean {
    const balance = this.selectedBalance;
    return !!balance && balance.assigned === false;
  }

  get exceededMessage(): string {
    const balance = this.selectedBalance;
    if (!balance) return '';
    return `These dates come to ${this.plannedDays} working day(s), but only ${balance.remaining} `
      + `${balance.name} day(s) are left. Shorten the dates, or set a higher limit on the `
      + `Leave Limits page.`;
  }

  // ---- Modal state --------------------------------------------------------

  closeModal() {
    this.showModal = false;
    this.deleteMode = false;
    this.approveMode = false;
    this.rejectMode = false;
    this.cancelMode = false;
    this.actionRequest = null;
    this.errorCheck = false;
    this.errorMsg = '';
    this.balanceBlocked = false;
    this.cancelReason = '';
    this.plannedDays = 0;
  }

  private openModal(): void {
    this.showModal = true;
    this.deleteMode = false;
    this.approveMode = false;
    this.rejectMode = false;
    this.cancelMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.balanceBlocked = false;
    this.cancelReason = '';
    this.isClick = false;
  }

  addLeaveRequestModel() {
    this.openModal();
    this.actionRequest = null;
    this.formPersonType = 'staff';
    this.formClass = '';
    this.peopleOptions = [];
    this.balanceInfo = [];
    this.plannedDays = 0;
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

  cancelLeaveRequestModel(request: any) {
    this.openModal();
    this.cancelMode = true;
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
    this.getPendingCount();
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

    // Mirrors the backend guard so the admin is told before the round-trip. The picker's
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

    const data = {
      adminId: this.adminId,
      personType: this.formPersonType,
      personId: this.leaveForm.value.personId,
      leaveTypeId: this.leaveForm.value.leaveTypeId,
      fromDate: fromKey,
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

  // `force` is only ever true on the second press, after the backend has said the balance is
  // short and the admin has read exactly how short in the message it sent back.
  leaveRequestApprove(force: boolean = false) {
    if (!this.actionRequest || this.isClick) {
      return;
    }
    this.isClick = true;
    const data: any = { actionBy: this.adminName };
    if (force) data.forceApprove = true;

    this.leaveRequestService.approveLeaveRequest(this.actionRequest._id, data)
      .subscribe((res: any) => {
        if (res) {
          this.isClick = false;
          this.successDone(res);
        }
      }, err => {
        this.handleError(err);
        // A balance refusal is the one error worth offering a way past. Everything else — a
        // person with no limit set for this leave type especially — is a dead end here and
        // has to be fixed on the Leave Limits page, not waved through from a dialog.
        if (typeof err.error === 'string' && err.error.indexOf('Not enough') === 0) {
          this.balanceBlocked = true;
        }
      })
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

  leaveRequestCancel() {
    if (!this.actionRequest || this.isClick) {
      return;
    }
    if (!this.cancelReason || !this.cancelReason.trim()) {
      this.errorCheck = true;
      this.errorMsg = 'A cancellation reason is required.';
      return;
    }
    this.isClick = true;
    this.leaveRequestService.cancelLeaveRequest(this.actionRequest._id, {
      cancellationReason: this.cancelReason.trim(),
      actionBy: this.adminName,
    }).subscribe((res: any) => {
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
