import { Component, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { PayrollService } from 'src/app/services/payroll.service';

// GENERATE PAYROLL — the landing page of the Payroll section, and now only that.
//
// This used to be one component holding four screens behind an `activeTab` string. Payment
// History, Salary Groups and Assign Salary are separate lazy-loaded routes now, so opening
// Payroll downloads the payroll table and nothing else: not three other tables, not four HTTP
// services, not the printable salary slip's markup. Each of those pages pays for itself only
// when somebody goes there.
//
// WHAT THAT COSTS, AND WHY IT IS WORTH IT. The four screens used to share one Month/Year and
// one Staff/Teachers selection, and routing away lost them. The settings menu therefore
// carries the current scope to the sub-pages as query params, and they read it on init — the
// selection survives the navigation without the four screens having to live in one component
// to do it. Salary Groups takes no scope because it has none: a pay scale is not a month.
//
// STAFF AND TEACHERS ARE BOTH PAYABLE, keyed by personType + personId all the way down.
//
// THE ORDER OF THE WORK IS SALARY GROUPS -> ASSIGN SALARY -> GENERATE -> RECORD PAYMENT, and
// every screen fails loudly when the one before it has not been done: generating without an
// assignment reports "No salary group is assigned". None of that is enforced by hiding the
// links — an admin arriving mid-setup needs to see what is missing, not find the menu empty.
@Component({
  selector: 'app-payroll',
  templateUrl: './payroll.component.html',
  styleUrls: ['./payroll.component.css']
})
export class PayrollComponent implements OnInit {
  adminId!: string;
  adminName: string = '';

  // ---- Modal state --------------------------------------------------------
  // One modal element, switched by modalMode rather than a boolean per body.
  // '' | 'view' | 'lock' | 'unlock'
  showModal: boolean = false;
  modalMode: string = '';
  errorCheck: Boolean = false;
  errorMsg: String = '';
  // Double-submit guard, reset in BOTH callbacks of every mutating call.
  isClick: boolean = false;

  // ---- Scope selection ----------------------------------------------------
  personTypeFilter: string = 'staff';
  filterMonth: number = new Date().getMonth() + 1;
  filterYear: number = new Date().getFullYear();
  monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];
  yearOptions: number[] = [];

  // ---- The list -----------------------------------------------------------
  payrollList: any[] = [];
  payrollNumber: number = 0;
  payrollLimit: number = 5;
  payrollPaginationValues: Subject<any> = new Subject();
  payrollLoader: Boolean = true;
  payrollStatusFilter: string = 'all';
  selectedPayrollPersonIds: string[] = [];
  // The row currently being viewed, locked or unlocked.
  actionPayroll: any = null;
  payrollDetail: any = null;
  // The gate on the unlock confirmation. The backend schema requires confirm: true, so this
  // checkbox is not decoration — an unticked box cannot produce a valid request.
  unlockConfirmed: boolean = false;

  constructor(
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private payrollService: PayrollService,
  ) { }

  ngOnInit(): void {
    const admin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = admin?.id;
    this.adminName = admin?.name || '';
    this.buildYearOptions();
    let load: any = this.getPayroll({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.payrollLoader = false;
      }, 1000);
    }
  }

  // Two years back for a regeneration, one forward for a school that closes its books early.
  // A free-typed year is how a payroll ends up filed under 2062.
  buildYearOptions(): void {
    const thisYear = new Date().getFullYear();
    for (let year = thisYear - 2; year <= thisYear + 1; year += 1) {
      this.yearOptions.push(year);
    }
  }

  switchPeriod(): void {
    this.selectedPayrollPersonIds = [];
    this.getPayroll({ page: 1 });
  }

  // Changing the person type invalidates the selection as well as the list. A staff id left
  // ticked while the teacher list is on screen would be submitted against the teacher
  // collection and come back silently skipped as "not found".
  switchPersonType(): void {
    this.selectedPayrollPersonIds = [];
    this.getPayroll({ page: 1 });
  }

  // ---- Plain-language labels ---------------------------------------------

  // "Per Month" / "Per Day", never the raw 'perMonth' / 'perDay'. The enum is a storage
  // detail and has no business on screen.
  modeLabel(mode: String): string {
    if (mode === 'perDay') return 'Per Day';
    if (mode === 'perMonth') return 'Per Month';
    return '';
  }

  personTypeLabel(personType: String): string {
    return personType === 'teacher' ? 'Teachers' : 'Staff';
  }

  monthLabel(month: number): string {
    const found = this.monthOptions.find((option) => option.value === Number(month));
    return found ? found.label : '';
  }

  // Not generated is a real third state alongside DRAFT and LOCKED, and the row has to be
  // able to say so rather than showing a blank cell.
  payrollStatusLabel(row: any): string {
    if (!row.status) return 'Not generated';
    return row.status === 'LOCKED' ? 'Locked' : 'Draft';
  }

  payrollStatusClass(row: any): string {
    if (!row.status) return 'status-notgenerated';
    return row.status === 'LOCKED' ? 'status-locked' : 'status-draft';
  }

  paymentStatusClass(status: String): string {
    if (status === 'Fully Paid') return 'status-fullypaid';
    if (status === 'Partially Paid') return 'status-partiallypaid';
    return 'status-unpaid';
  }

  // A record generated before the month ended still has days that have not happened. The
  // salary is costed on the whole month either way — see services/payroll-attendance.js — so
  // the number is not provisional, but the attendance behind part of it is.
  isEstimate(payroll: any): boolean {
    if (!payroll) return false;
    return (payroll.pendingDays || 0) > 0;
  }

  // =========================================================================
  // THE LIST
  // =========================================================================

  getPayroll($event: any) {
    return new Promise((resolve) => {
      let params: any = {
        filters: {
          personType: this.personTypeFilter,
          month: this.filterMonth,
          year: this.filterYear,
          status: this.payrollStatusFilter,
        },
        page: $event.page,
        limit: $event.limit ? $event.limit : this.payrollLimit,
        adminId: this.adminId,
      };
      this.payrollLimit = params.limit;

      this.payrollService.payrollPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.payrollList = res.payrollList;
          this.payrollNumber = params.page;
          this.payrollPaginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countPeople });
          return resolve(true);
        }
      });
    });
  }

  isPayrollPersonSelected(personId: any): boolean {
    return this.selectedPayrollPersonIds.indexOf(String(personId)) > -1;
  }

  togglePayrollPerson(personId: any): void {
    const key = String(personId);
    const index = this.selectedPayrollPersonIds.indexOf(key);
    if (index > -1) this.selectedPayrollPersonIds.splice(index, 1);
    else this.selectedPayrollPersonIds.push(key);
  }

  get allPayrollPeopleSelected(): boolean {
    return this.payrollList.length > 0
      && this.payrollList.every((row) => this.isPayrollPersonSelected(row.personId));
  }

  toggleAllPayrollPeople(): void {
    if (this.allPayrollPeopleSelected) {
      for (const row of this.payrollList) {
        const index = this.selectedPayrollPersonIds.indexOf(String(row.personId));
        if (index > -1) this.selectedPayrollPersonIds.splice(index, 1);
      }
    } else {
      for (const row of this.payrollList) {
        if (!this.isPayrollPersonSelected(row.personId)) this.selectedPayrollPersonIds.push(String(row.personId));
      }
    }
  }

  // A locked row is not offered a Generate button at all — the backend refuses it anyway, and
  // an enabled button that always errors is worse than no button.
  canGenerate(row: any): boolean {
    return row.status !== 'LOCKED';
  }

  generatePayroll(row: any): void {
    if (this.isClick) return;
    this.isClick = true;
    this.actionPayroll = row;

    this.payrollService.generatePayroll({
      adminId: this.adminId,
      personType: row.personType,
      personId: row.personId,
      month: this.filterMonth,
      year: this.filterYear,
    }).subscribe(
      (res: any) => {
        this.isClick = false;
        this.actionPayroll = null;
        this.getPayroll({ page: this.payrollNumber || 1 });
        setTimeout(() => {
          this.toastr.success('Payroll generated successfully.');
          // Generating for a month still running is allowed and produces a real DRAFT — but
          // the days that have not happened are a projection, and the admin is told so
          // rather than discovering it on a payslip. '' for a completed month.
          if (res && res.warning) this.toastr.warning(res.warning, '', { timeOut: 9000 });
        }, 500);
      },
      (err: any) => {
        this.isClick = false;
        this.actionPayroll = null;
        // Straight to a toast, not the modal: this action has no modal open to show it in.
        this.toastr.error(this.readError(err));
      }
    );
  }

  bulkGeneratePayroll(): void {
    if (this.selectedPayrollPersonIds.length === 0) return;
    if (this.isClick) return;
    this.isClick = true;

    this.payrollService.bulkGeneratePayroll({
      adminId: this.adminId,
      personType: this.personTypeFilter,
      month: this.filterMonth,
      year: this.filterYear,
      personIds: this.selectedPayrollPersonIds,
    }).subscribe(
      (res: any) => {
        this.isClick = false;
        this.selectedPayrollPersonIds = [];
        this.getPayroll({ page: this.payrollNumber || 1 });
        const skipped = (res && res.skipped) ? res.skipped : [];
        setTimeout(() => {
          this.toastr.success(`${res.generated} payroll record(s) generated.`);
          // One line for the whole batch, not one per person: mid-month is a fact about the
          // month, and sixty copies of it would bury the skipped list below.
          if (res && res.warning) this.toastr.warning(res.warning, '', { timeOut: 9000 });
          // Named individually, not counted. "1 skipped" tells an admin something went wrong
          // without telling them which of the twelve people they selected to go and fix.
          for (const entry of skipped) {
            this.toastr.warning(`${entry.name}: ${entry.reason}`);
          }
        }, 500);
      },
      (err: any) => { this.isClick = false; this.toastr.error(this.readError(err)); }
    );
  }

  // The itemised breakdown, in a modal — this never navigates away from Payroll.
  viewPayrollModel(row: any): void {
    this.actionPayroll = row;
    this.payrollDetail = null;
    this.modalMode = 'view';
    this.showModal = true;
    this.payrollService.getSinglePayroll(row.payrollId).subscribe(
      (res: any) => { this.payrollDetail = res; },
      (err: any) => { this.showError(err); }
    );
  }

  lockPayrollModel(row: any): void {
    this.actionPayroll = row;
    this.errorCheck = false;
    this.errorMsg = '';
    this.modalMode = 'lock';
    this.showModal = true;
  }

  unlockPayrollModel(row: any): void {
    this.actionPayroll = row;
    this.unlockConfirmed = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.modalMode = 'unlock';
    this.showModal = true;
  }

  lockPayroll(): void {
    if (this.isClick) return;
    this.isClick = true;
    this.payrollService.lockPayroll(this.actionPayroll.payrollId, {
      adminId: this.adminId,
      lockedBy: this.adminName || this.adminId,
    }).subscribe(
      (res: any) => { this.isClick = false; this.payrollSuccessDone('Payroll locked successfully.'); },
      (err: any) => { this.isClick = false; this.showError(err); }
    );
  }

  unlockPayroll(): void {
    // The gate. The backend schema requires confirm: true, so sending an unconfirmed request
    // would only earn a validation failure — this stops it at the button instead.
    if (!this.unlockConfirmed) return;
    if (this.isClick) return;
    this.isClick = true;
    this.payrollService.unlockPayroll(this.actionPayroll.payrollId, {
      adminId: this.adminId,
      confirm: true,
      unlockedBy: this.adminName || this.adminId,
    }).subscribe(
      (res: any) => { this.isClick = false; this.payrollSuccessDone('Payroll unlocked successfully.'); },
      (err: any) => { this.isClick = false; this.showError(err); }
    );
  }

  // Only this page's own list. Payment History is a route now and refetches when it is
  // opened, so there is nothing here to keep in step with it.
  payrollSuccessDone(message: string): void {
    this.closeModal();
    this.getPayroll({ page: this.payrollNumber || 1 });
    setTimeout(() => { this.toastr.success(message); }, 500);
  }

  // =========================================================================
  // SHARED
  // =========================================================================

  // The backend returns business-rule failures as a plain STRING, not an object — see
  // CLAUDE.md's backend error-handling convention. Both shapes are read so a 500 (which
  // returns a plain string too) still surfaces something legible.
  readError(err: any): string {
    if (!err) return 'Something went wrong!';
    if (typeof err.error === 'string') return err.error;
    if (err.error && err.error.errorMsg) return err.error.errorMsg;
    if (typeof err.message === 'string') return err.message;
    return 'Something went wrong!';
  }

  showError(err: any): void {
    this.errorCheck = true;
    this.errorMsg = this.readError(err);
  }

  closeModal(): void {
    this.showModal = false;
    this.modalMode = '';
    this.errorCheck = false;
    this.errorMsg = '';
    this.actionPayroll = null;
    this.payrollDetail = null;
    this.unlockConfirmed = false;
  }
}
