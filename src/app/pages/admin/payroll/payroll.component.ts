import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { PayrollService } from 'src/app/services/payroll.service';
import { SalaryGroupService } from 'src/app/services/salary-group.service';
import { SalaryPaymentService } from 'src/app/services/salary-payment.service';
import { SalarySlipService } from 'src/app/services/salary-slip.service';
import { SalaryStructureService } from 'src/app/services/salary-structure.service';
import { SchoolService } from 'src/app/services/school.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';

// ONE PAGE, FOUR VIEWS, ONE SIDEBAR ENTRY.
//
// Generate Payroll and Payment History are the daily screens and are the only two in the tab
// strip. Salary Groups and Assign Salary are setup jobs done a few times a year, so they sit
// behind the settings icon — the same split the Fees page makes when it tucks "Create Fee
// Structure" and "Fee Reminder" under its gear instead of giving them top-level nav.
//
// They are VIEWS OF THIS COMPONENT, not routes. Fees links out to separate pages; here all
// four share the Month/Year selection and the staff list, and routing away and back would
// lose both.
//
// STAFF AND TEACHERS ARE BOTH PAYABLE. One personType selector is shared by the Assign,
// Generate and Payment History tabs rather than one per tab: assigning a scale and then
// generating against it is one job done in sequence, and having to pick Teachers twice to
// complete it is the kind of friction that gets a teacher paid off the staff list by accident.
//
// THE ORDER OF THE WORK IS SALARY GROUPS -> ASSIGN SALARY -> GENERATE -> RECORD PAYMENT, and
// every screen fails loudly when the one before it has not been done: generating without an
// assignment reports "No salary group is assigned", recording a payment against a DRAFT is
// refused. None of that is enforced by hiding tabs — an admin arriving mid-setup needs to
// see what is missing, not find the page empty.
@Component({
  selector: 'app-payroll',
  templateUrl: './payroll.component.html',
  styleUrls: ['./payroll.component.css']
})
export class PayrollComponent implements OnInit {
  // 'generate' | 'payments' | 'salaryGroups' | 'assignSalary'
  activeTab: string = 'generate';

  adminId!: string;
  adminName: string = '';

  // ---- Modal state --------------------------------------------------------
  // One modal element, switched by modalMode rather than a boolean per body: eight bodies as
  // eight booleans is where the leave page's four already sits at its limit.
  // '' | 'group' | 'deleteGroup' | 'assign' | 'bulkAssign' | 'view' | 'lock' | 'unlock' | 'payment'
  showModal: boolean = false;
  modalMode: string = '';
  updateMode: boolean = false;
  errorCheck: Boolean = false;
  errorMsg: String = '';
  // Double-submit guard, reset in BOTH callbacks of every mutating call.
  isClick: boolean = false;

  // ---- Shared scope selection --------------------------------------------
  // Who is being paid. Shared by Assign Salary, Generate and Payment History — see the class
  // header for why it is one selector rather than one per tab.
  personTypeFilter: string = 'staff';
  // Generate and Payment History read the same month. Keeping one pair of fields means
  // switching tabs after generating March does not silently drop the reader back to today.
  filterMonth: number = new Date().getMonth() + 1;
  filterYear: number = new Date().getFullYear();
  monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];
  yearOptions: number[] = [];

  // ---- Tab 1: Salary Groups ----------------------------------------------
  groupForm: FormGroup;
  groupList: any[] = [];
  groupNumber: number = 0;
  groupLimit: number = 5;
  groupPaginationValues: Subject<any> = new Subject();
  groupLoader: Boolean = true;
  editGroupId: String = '';
  deleteGroup: any = null;

  // ---- Tab 2: Assign Salary ----------------------------------------------
  assignForm: FormGroup;
  assignList: any[] = [];
  assignNumber: number = 0;
  assignLimit: number = 5;
  assignPaginationValues: Subject<any> = new Subject();
  assignLoader: Boolean = true;
  // The picker only ever offers ACTIVE groups — a retired scale must not reach a new person.
  activeGroups: any[] = [];
  assignRow: any = null;
  // Overrides are collapsed by default: most staff are on their group's numbers unchanged,
  // and four always-visible optional fields would suggest otherwise.
  overrideEnabled: boolean = false;
  overrideComponentsEnabled: boolean = false;
  selectedPersonIds: string[] = [];
  bulkGroupId: string = '';
  bulkEffectiveFrom: any = '';

  // ---- Tab 3: Generate Payroll -------------------------------------------
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

  // ---- Tab 4: Payment History --------------------------------------------
  paymentForm: FormGroup;
  historyList: any[] = [];
  paymentNumber: number = 0;
  paymentLimit: number = 5;
  paymentPaginationValues: Subject<any> = new Subject();
  paymentLoader: Boolean = true;
  paymentModeFilter: string = 'all';
  paymentStatusFilter: string = 'all';
  paymentRow: any = null;

  // ---- Salary slip --------------------------------------------------------
  // A SEPARATE modal from the one modalMode drives. The slip is a printable document, not a
  // form: it uses the fee receipt's wider print-model-dialog and its body is the thing that
  // gets sent to the printer, so sharing the compact form modal would fight both layouts.
  showSlipModal: boolean = false;
  slipPayload: any = null;
  slipLoading: boolean = false;
  // Read once on init and reused by every slip — the school's own header block, exactly as
  // the fee receipt reads it. Nothing about a slip asks the admin to re-enter it.
  schoolInfo: any = null;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private salaryGroupService: SalaryGroupService,
    private salaryStructureService: SalaryStructureService,
    private payrollService: PayrollService,
    private salaryPaymentService: SalaryPaymentService,
    private salarySlipService: SalarySlipService,
    private schoolService: SchoolService,
    private printPdfService: PrintPdfService,
  ) {
    this.groupForm = this.fb.group({
      name: ['', Validators.required],
      basic: ['', Validators.required],
      hra: [0],
      calculationMode: ['perMonth', Validators.required],
      status: ['active'],
      allowances: this.fb.array([]),
      deductions: this.fb.array([]),
    })

    this.assignForm = this.fb.group({
      salaryGroupId: ['', Validators.required],
      effectiveFrom: ['', Validators.required],
      // Blank means "use the group's". They are NOT given 0 as a default: 0 is a real
      // instruction (this person gets no HRA) and the two must stay distinguishable all the
      // way to the backend. See models/salary-structure.js.
      overrideBasic: [''],
      overrideHra: [''],
      overrideAllowances: this.fb.array([]),
      overrideDeductions: this.fb.array([]),
    })

    this.paymentForm = this.fb.group({
      amountPaid: ['', Validators.required],
      paymentDate: ['', Validators.required],
      paymentMode: ['', Validators.required],
      referenceNumber: [''],
      remarks: [''],
    })
  }

  ngOnInit(): void {
    const admin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = admin?.id;
    this.adminName = admin?.name || '';
    this.buildYearOptions();
    this.getActiveGroups();
    this.getSchool();
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

  // ---- Tab switching ------------------------------------------------------

  // Each tab fetches on FIRST arrival only if it has nothing — switching back and forth
  // should not re-hit the API for a list that has not changed. Anything that mutates a list
  // refetches it directly.
  switchTab(tab: string): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.closeModal();
    if (tab === 'salaryGroups' && this.groupList.length === 0) {
      this.getSalaryGroup({ page: 1 });
      setTimeout(() => { this.groupLoader = false; }, 1000);
    }
    if (tab === 'assignSalary' && this.assignList.length === 0) {
      this.getAssignSalary({ page: 1 });
      setTimeout(() => { this.assignLoader = false; }, 1000);
    }
    if (tab === 'generate' && this.payrollList.length === 0) {
      this.getPayroll({ page: 1 });
      setTimeout(() => { this.payrollLoader = false; }, 1000);
    }
    if (tab === 'payments' && this.historyList.length === 0) {
      this.getPaymentHistory({ page: 1 });
      setTimeout(() => { this.paymentLoader = false; }, 1000);
    }
  }

  // The period is shared, so changing it invalidates both period-scoped lists. Refetching
  // only the visible one would leave the other showing March under an April heading.
  switchPeriod(): void {
    this.selectedPayrollPersonIds = [];
    if (this.activeTab === 'generate') this.getPayroll({ page: 1 });
    if (this.activeTab === 'payments') this.getPaymentHistory({ page: 1 });
  }

  // Changing the person type invalidates EVERY selection as well as the lists. A staff id left
  // ticked while the teacher list is on screen would be submitted against the teacher
  // collection and come back silently skipped as "not found".
  switchPersonType(): void {
    this.selectedPersonIds = [];
    this.selectedPayrollPersonIds = [];
    if (this.activeTab === 'assignSalary') this.getAssignSalary({ page: 1 });
    if (this.activeTab === 'generate') this.getPayroll({ page: 1 });
    if (this.activeTab === 'payments') this.getPaymentHistory({ page: 1 });
  }

  // ---- Plain-language labels ---------------------------------------------

  // "Per Month" / "Per Day", never the raw 'perMonth' / 'perDay'. The enum is a storage
  // detail and has no business on screen.
  modeLabel(mode: String): string {
    if (mode === 'perDay') return 'Per Day';
    if (mode === 'perMonth') return 'Per Month';
    return '';
  }

  // Staff / Teachers for the selector and the empty states. Plain language, never the raw
  // enum, the same rule the calculation mode follows.
  personTypeLabel(personType: String): string {
    return personType === 'teacher' ? 'Teachers' : 'Staff';
  }

  paymentModeLabel(mode: String): string {
    switch (mode) {
      case 'cash': return 'Cash';
      case 'bankTransfer': return 'Bank Transfer';
      case 'upi': return 'UPI';
      case 'cheque': return 'Cheque';
      default: return '';
    }
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

  // =========================================================================
  // TAB 1 — SALARY GROUPS
  // =========================================================================

  get allowanceRows(): FormArray { return this.groupForm.get('allowances') as FormArray; }
  get deductionRows(): FormArray { return this.groupForm.get('deductions') as FormArray; }

  newComponentRow(name: any = '', amount: any = ''): FormGroup {
    return this.fb.group({
      name: [name, Validators.required],
      amount: [amount, Validators.required],
    });
  }

  addAllowanceRow(): void { this.allowanceRows.push(this.newComponentRow()); }
  removeAllowanceRow(index: number): void { this.allowanceRows.removeAt(index); }
  addDeductionRow(): void { this.deductionRows.push(this.newComponentRow()); }
  removeDeductionRow(index: number): void { this.deductionRows.removeAt(index); }

  getSalaryGroup($event: any) {
    return new Promise((resolve) => {
      let params: any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.groupLimit,
        adminId: this.adminId,
      };
      this.groupLimit = params.limit;

      this.salaryGroupService.salaryGroupPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.groupList = res.salaryGroupList;
          this.groupNumber = params.page;
          this.groupPaginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countSalaryGroup });
          return resolve(true);
        }
      });
    });
  }

  // The assign picker's options. Refetched after every group write so a group created on tab
  // 1 is assignable on tab 2 without a page reload.
  getActiveGroups(): void {
    this.salaryGroupService.getActiveSalaryGroupList(this.adminId).subscribe(
      (res: any) => { this.activeGroups = res || []; },
      () => { this.activeGroups = []; }
    );
  }

  addSalaryGroupModel(): void {
    this.resetGroupForm();
    this.updateMode = false;
    this.modalMode = 'group';
    this.showModal = true;
  }

  updateSalaryGroupModel(group: any): void {
    this.resetGroupForm();
    this.editGroupId = group._id;
    this.groupForm.patchValue({
      name: group.name,
      basic: group.basic,
      hra: group.hra,
      calculationMode: group.calculationMode,
      status: group.status,
    });
    for (const allowance of group.allowances || []) {
      this.allowanceRows.push(this.newComponentRow(allowance.name, allowance.amount));
    }
    for (const deduction of group.deductions || []) {
      this.deductionRows.push(this.newComponentRow(deduction.name, deduction.amount));
    }
    this.updateMode = true;
    this.modalMode = 'group';
    this.showModal = true;
  }

  deleteSalaryGroupModel(group: any): void {
    this.deleteGroup = group;
    this.modalMode = 'deleteGroup';
    this.showModal = true;
  }

  resetGroupForm(): void {
    this.groupForm.reset({ name: '', basic: '', hra: 0, calculationMode: 'perMonth', status: 'active' });
    this.allowanceRows.clear();
    this.deductionRows.clear();
    this.editGroupId = '';
    this.errorCheck = false;
    this.errorMsg = '';
  }

  salaryGroupAddUpdate(): void {
    if (this.groupForm.invalid) {
      this.groupForm.markAllAsTouched();
      return;
    }
    if (this.isClick) return;
    this.isClick = true;

    const payload: any = {
      adminId: this.adminId,
      name: this.groupForm.value.name,
      basic: Number(this.groupForm.value.basic),
      hra: Number(this.groupForm.value.hra) || 0,
      calculationMode: this.groupForm.value.calculationMode,
      status: this.groupForm.value.status,
      allowances: (this.groupForm.value.allowances || []).map((row: any) => ({
        name: row.name, amount: Number(row.amount) || 0,
      })),
      deductions: (this.groupForm.value.deductions || []).map((row: any) => ({
        name: row.name, amount: Number(row.amount) || 0,
      })),
    };

    if (this.updateMode) {
      payload._id = this.editGroupId;
      this.salaryGroupService.updateSalaryGroup(payload).subscribe(
        (res: any) => { this.isClick = false; this.groupSuccessDone('Salary group updated successfully.'); },
        (err: any) => { this.isClick = false; this.showError(err); }
      );
    } else {
      this.salaryGroupService.addSalaryGroup(payload).subscribe(
        (res: any) => { this.isClick = false; this.groupSuccessDone('Salary group created successfully.'); },
        (err: any) => { this.isClick = false; this.showError(err); }
      );
    }
  }

  salaryGroupDelete(): void {
    if (this.isClick) return;
    this.isClick = true;
    this.salaryGroupService.deleteSalaryGroup(this.deleteGroup._id).subscribe(
      (res: any) => { this.isClick = false; this.groupSuccessDone('Salary group deleted successfully.'); },
      (err: any) => { this.isClick = false; this.showError(err); }
    );
  }

  // A group write changes what the assign picker can offer AND what an assign row displays,
  // so all three are refreshed rather than just the table that was edited.
  groupSuccessDone(message: string): void {
    this.closeModal();
    this.getSalaryGroup({ page: this.groupNumber || 1 });
    this.getActiveGroups();
    if (this.assignList.length > 0) this.getAssignSalary({ page: this.assignNumber || 1 });
    setTimeout(() => { this.toastr.success(message); }, 500);
  }

  // =========================================================================
  // TAB 2 — ASSIGN SALARY
  // =========================================================================

  get overrideAllowanceRows(): FormArray { return this.assignForm.get('overrideAllowances') as FormArray; }
  get overrideDeductionRows(): FormArray { return this.assignForm.get('overrideDeductions') as FormArray; }

  addOverrideAllowanceRow(): void { this.overrideAllowanceRows.push(this.newComponentRow()); }
  removeOverrideAllowanceRow(index: number): void { this.overrideAllowanceRows.removeAt(index); }
  addOverrideDeductionRow(): void { this.overrideDeductionRows.push(this.newComponentRow()); }
  removeOverrideDeductionRow(index: number): void { this.overrideDeductionRows.removeAt(index); }

  getAssignSalary($event: any) {
    return new Promise((resolve) => {
      let params: any = {
        filters: { personType: this.personTypeFilter },
        page: $event.page,
        limit: $event.limit ? $event.limit : this.assignLimit,
        adminId: this.adminId,
      };
      this.assignLimit = params.limit;

      this.salaryStructureService.assignSalaryPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.assignList = res.assignList;
          this.assignNumber = params.page;
          this.assignPaginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countPeople });
          return resolve(true);
        }
      });
    });
  }

  isPersonSelected(personId: any): boolean {
    return this.selectedPersonIds.indexOf(String(personId)) > -1;
  }

  togglePerson(personId: any): void {
    const key = String(personId);
    const index = this.selectedPersonIds.indexOf(key);
    if (index > -1) this.selectedPersonIds.splice(index, 1);
    else this.selectedPersonIds.push(key);
  }

  // "All" means all on THIS page, which is what the header checkbox sits above. A checkbox
  // that silently selected staff on pages the admin cannot see would make the count in the
  // toolbar unverifiable.
  get allPeopleSelected(): boolean {
    return this.assignList.length > 0
      && this.assignList.every((row) => this.isPersonSelected(row.personId));
  }

  toggleAllPeople(): void {
    if (this.allPeopleSelected) {
      for (const row of this.assignList) {
        const index = this.selectedPersonIds.indexOf(String(row.personId));
        if (index > -1) this.selectedPersonIds.splice(index, 1);
      }
    } else {
      for (const row of this.assignList) {
        if (!this.isPersonSelected(row.personId)) this.selectedPersonIds.push(String(row.personId));
      }
    }
  }

  assignSalaryModel(row: any): void {
    this.assignRow = row;
    this.overrideEnabled = false;
    this.overrideComponentsEnabled = false;
    this.assignForm.reset({ salaryGroupId: '', effectiveFrom: '', overrideBasic: '', overrideHra: '' });
    this.overrideAllowanceRows.clear();
    this.overrideDeductionRows.clear();
    this.errorCheck = false;
    this.errorMsg = '';
    this.modalMode = 'assign';
    this.showModal = true;

    // Pre-fill from whatever the person is on now, so re-assigning is an edit rather than a
    // blank form the admin has to reconstruct.
    if (row.salaryGroupId) {
      this.salaryStructureService.getSalaryStructureByPerson(
        this.adminId, row.personType, row.personId,
      ).subscribe(
        (res: any) => {
          if (!res) return;
          this.assignForm.patchValue({
            salaryGroupId: res.salaryGroupId,
            effectiveFrom: res.effectiveFrom,
            // null round-trips back to '' so an untouched override does not become a 0.
            overrideBasic: res.overrideBasic === null || res.overrideBasic === undefined ? '' : res.overrideBasic,
            overrideHra: res.overrideHra === null || res.overrideHra === undefined ? '' : res.overrideHra,
          });
          const hasBasicOrHra = (res.overrideBasic !== null && res.overrideBasic !== undefined)
            || (res.overrideHra !== null && res.overrideHra !== undefined);
          this.overrideComponentsEnabled = Array.isArray(res.overrideAllowances)
            || Array.isArray(res.overrideDeductions);
          this.overrideEnabled = hasBasicOrHra || this.overrideComponentsEnabled;
          for (const allowance of res.overrideAllowances || []) {
            this.overrideAllowanceRows.push(this.newComponentRow(allowance.name, allowance.amount));
          }
          for (const deduction of res.overrideDeductions || []) {
            this.overrideDeductionRows.push(this.newComponentRow(deduction.name, deduction.amount));
          }
        },
        () => { }
      );
    }
  }

  // Unticking the override box clears what was typed. Leaving stale values behind would mean
  // re-ticking it silently restored numbers the admin thought they had abandoned.
  toggleOverride(): void {
    this.overrideEnabled = !this.overrideEnabled;
    if (!this.overrideEnabled) {
      this.assignForm.patchValue({ overrideBasic: '', overrideHra: '' });
      this.overrideComponentsEnabled = false;
      this.overrideAllowanceRows.clear();
      this.overrideDeductionRows.clear();
    }
  }

  // Seeded from the group being assigned, so the admin edits a copy of the real list rather
  // than retyping it. An empty seed still means "this person gets none", which is why the
  // rows are shown even when the group has no components.
  toggleOverrideComponents(): void {
    this.overrideComponentsEnabled = !this.overrideComponentsEnabled;
    this.overrideAllowanceRows.clear();
    this.overrideDeductionRows.clear();
    if (!this.overrideComponentsEnabled) return;
    const group = this.activeGroups.find((item) => item._id === this.assignForm.value.salaryGroupId);
    if (!group) return;
    for (const allowance of group.allowances || []) {
      this.overrideAllowanceRows.push(this.newComponentRow(allowance.name, allowance.amount));
    }
    for (const deduction of group.deductions || []) {
      this.overrideDeductionRows.push(this.newComponentRow(deduction.name, deduction.amount));
    }
  }

  // '' -> null, and a typed 0 stays 0. This one conversion is the difference between "use the
  // group's HRA" and "this person gets no HRA".
  private overrideValue(raw: any): number | null {
    if (raw === '' || raw === null || raw === undefined) return null;
    return Number(raw);
  }

  assignSalarySubmit(): void {
    if (this.assignForm.get('salaryGroupId')?.invalid || this.assignForm.get('effectiveFrom')?.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }
    if (this.isClick) return;
    this.isClick = true;

    const payload: any = {
      adminId: this.adminId,
      personType: this.assignRow.personType,
      personId: this.assignRow.personId,
      salaryGroupId: this.assignForm.value.salaryGroupId,
      effectiveFrom: this.assignForm.value.effectiveFrom,
      overrideBasic: this.overrideEnabled ? this.overrideValue(this.assignForm.value.overrideBasic) : null,
      overrideHra: this.overrideEnabled ? this.overrideValue(this.assignForm.value.overrideHra) : null,
      overrideAllowances: this.overrideEnabled && this.overrideComponentsEnabled
        ? (this.assignForm.value.overrideAllowances || []).map((row: any) => ({ name: row.name, amount: Number(row.amount) || 0 }))
        : null,
      overrideDeductions: this.overrideEnabled && this.overrideComponentsEnabled
        ? (this.assignForm.value.overrideDeductions || []).map((row: any) => ({ name: row.name, amount: Number(row.amount) || 0 }))
        : null,
    };

    this.salaryStructureService.assignSalary(payload).subscribe(
      (res: any) => { this.isClick = false; this.assignSuccessDone('Salary group assigned successfully.'); },
      (err: any) => { this.isClick = false; this.showError(err); }
    );
  }

  bulkAssignModel(): void {
    this.bulkGroupId = '';
    this.bulkEffectiveFrom = '';
    this.errorCheck = false;
    this.errorMsg = '';
    this.modalMode = 'bulkAssign';
    this.showModal = true;
  }

  bulkAssignSubmit(): void {
    if (!this.bulkGroupId || !this.bulkEffectiveFrom) return;
    if (this.isClick) return;
    this.isClick = true;

    this.salaryStructureService.bulkAssignSalary({
      adminId: this.adminId,
      personType: this.personTypeFilter,
      salaryGroupId: this.bulkGroupId,
      effectiveFrom: this.bulkEffectiveFrom,
      personIds: this.selectedPersonIds,
    }).subscribe(
      (res: any) => {
        this.isClick = false;
        this.selectedPersonIds = [];
        this.assignSuccessDone(typeof res === 'string' ? res : 'Salary group assigned successfully.');
      },
      (err: any) => { this.isClick = false; this.showError(err); }
    );
  }

  // An assignment changes what Generate can do with that person, so the payroll list is
  // refreshed too when it has already been loaded.
  assignSuccessDone(message: string): void {
    this.closeModal();
    this.getAssignSalary({ page: this.assignNumber || 1 });
    if (this.payrollList.length > 0) this.getPayroll({ page: this.payrollNumber || 1 });
    setTimeout(() => { this.toastr.success(message); }, 500);
  }

  // =========================================================================
  // TAB 3 — GENERATE PAYROLL
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
        setTimeout(() => { this.toastr.success('Payroll generated successfully.'); }, 500);
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

  // Locking is what makes a payroll payable, so the Payment History list changes too.
  payrollSuccessDone(message: string): void {
    this.closeModal();
    this.getPayroll({ page: this.payrollNumber || 1 });
    if (this.historyList.length > 0) this.getPaymentHistory({ page: this.paymentNumber || 1 });
    setTimeout(() => { this.toastr.success(message); }, 500);
  }

  // =========================================================================
  // TAB 4 — PAYMENT HISTORY
  // =========================================================================

  getPaymentHistory($event: any) {
    return new Promise((resolve) => {
      let params: any = {
        filters: {
          personType: this.personTypeFilter,
          month: this.filterMonth,
          year: this.filterYear,
          paymentMode: this.paymentModeFilter === 'all' ? '' : this.paymentModeFilter,
          paymentStatus: this.paymentStatusFilter === 'all' ? '' : this.paymentStatusFilter,
        },
        page: $event.page,
        limit: $event.limit ? $event.limit : this.paymentLimit,
        adminId: this.adminId,
      };
      this.paymentLimit = params.limit;

      this.salaryPaymentService.paymentHistoryList(params).subscribe((res: any) => {
        if (res) {
          this.historyList = res.historyList;
          this.paymentNumber = params.page;
          this.paymentPaginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countPayroll });
          return resolve(true);
        }
      });
    });
  }

  switchPaymentFilter(): void {
    this.getPaymentHistory({ page: 1 });
  }

  // Only a locked payroll with something still owed can take a payment. A fully paid row has
  // nothing left to record, and a DRAFT is refused by the backend.
  canRecordPayment(row: any): boolean {
    return row.paymentStatus !== 'Fully Paid' && row.remainingAmount > 0;
  }

  recordPaymentModel(row: any): void {
    this.paymentRow = row;
    this.errorCheck = false;
    this.errorMsg = '';
    this.paymentForm.reset({
      // Pre-filled with what is actually outstanding — the common case is paying it in full,
      // and the remainder after an advance is a number nobody should have to work out.
      amountPaid: row.remainingAmount,
      paymentDate: new Date(),
      paymentMode: '',
      referenceNumber: '',
      remarks: '',
    });
    this.modalMode = 'payment';
    this.showModal = true;
  }

  recordPayment(): void {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    if (this.isClick) return;
    this.isClick = true;

    // personType/personId are deliberately NOT sent - the backend copies them off the
    // referenced Payroll, which is the authority on whose salary this is.
    this.salaryPaymentService.recordPayment({
      adminId: this.adminId,
      payrollId: this.paymentRow.payrollId,
      amountPaid: Number(this.paymentForm.value.amountPaid),
      paymentDate: this.paymentForm.value.paymentDate,
      paymentMode: this.paymentForm.value.paymentMode,
      referenceNumber: this.paymentForm.value.referenceNumber || '',
      paidBy: this.adminName || this.adminId,
      remarks: this.paymentForm.value.remarks || '',
    } as any).subscribe(
      (res: any) => {
        this.isClick = false;
        this.closeModal();
        this.getPaymentHistory({ page: this.paymentNumber || 1 });
        // A payment changes the Generate tab's paid column too.
        if (this.payrollList.length > 0) this.getPayroll({ page: this.payrollNumber || 1 });
        setTimeout(() => { this.toastr.success('Payment recorded successfully.'); }, 500);
      },
      (err: any) => { this.isClick = false; this.showError(err); }
    );
  }

  // =========================================================================
  // SALARY SLIP
  //
  // The printable monthly statement. Issuable only once the payroll is LOCKED and money has
  // actually moved against it — a slip documents a payment, not a calculation.
  //
  // The print path is the fee receipt's, unchanged: build an HTML string with inline styles,
  // hand it to PrintPdfService.printContent(), let the browser produce the PDF. No new print
  // mechanism and no second PDF library.
  // =========================================================================

  getSchool(): void {
    this.schoolService.getSchool(this.adminId).subscribe(
      (res: any) => { if (res) this.schoolInfo = res; },
      () => { this.schoolInfo = null; }
    );
  }

  // A locked row with at least one payment. An unpaid locked payroll gets no slip — there is
  // nothing to acknowledge yet — which is why this is not simply "is it locked".
  canGenerateSlip(row: any): boolean {
    return row.paymentStatus === 'Fully Paid' || row.paymentStatus === 'Partially Paid';
  }

  // One call whether a slip exists or not: the backend issues one if there is none and
  // refreshes it if there is, keeping the original slip number either way.
  generateSlipModel(row: any): void {
    if (this.isClick) return;
    this.isClick = true;
    this.slipPayload = null;
    this.slipLoading = true;
    this.showSlipModal = true;

    this.salarySlipService.generateSalarySlip({
      adminId: this.adminId,
      payrollId: row.payrollId,
      generatedBy: this.adminName || this.adminId,
    }).subscribe(
      (res: any) => {
        this.isClick = false;
        this.slipLoading = false;
        this.slipPayload = res;
      },
      (err: any) => {
        this.isClick = false;
        this.slipLoading = false;
        this.showSlipModal = false;
        this.toastr.error(this.readError(err));
      }
    );
  }

  closeSlipModal(): void {
    this.showSlipModal = false;
    this.slipPayload = null;
    this.slipLoading = false;
  }

  // Mirrors printStudentData() in pages/admin/admin-student-fees-statement exactly — same
  // service, same call, same close-after-print.
  printSalarySlip(): void {
    const printContent = this.getSlipPrintContent();
    this.printPdfService.printContent(printContent);
    this.closeSlipModal();
  }

  // The fee receipt's getPrintContent(), adapted to the slip's element.
  //
  // The styles are inlined into the print document rather than read from the component's
  // stylesheet because the print window is a NEW document with none of Angular's scoped CSS —
  // the receipt hit the same wall and solved it the same way. Font sizes and the watermark
  // block are copied from it verbatim so the two documents look like siblings.
  private getSlipPrintContent(): string {
    const schoolLogo = this.schoolInfo ? this.schoolInfo.schoolLogo : '';
    let printHtml = '<html>';
    printHtml += '<head>';
    printHtml += '<style>';
    printHtml += '@page { size: A3; margin: 10mm; }';
    printHtml += 'body {width: 100%; height: 100%; margin: 0; padding: 0; }';
    printHtml += 'div {margin: 0; padding: 0;}';
    printHtml += '.custom-container {font-family: Arial, sans-serif;overflow: auto; width: 100%; height: auto; box-sizing: border-box;}';
    printHtml += '.table-container {width: 100%;height: auto; background-color: #fff;border: 2px solid #454545; box-sizing: border-box;}';
    printHtml += '.logo { height: 80px;margin-top:15px;margin-left:10px;}';
    printHtml += '.school-name {display: flex; align-items: center; justify-content: center; text-align: center; }';
    printHtml += '.school-name h3 { color: #0a0a0a !important; font-size: 26px !important;font-weight: bolder;margin-top:-125px !important; margin-bottom: 0 !important; }';
    printHtml += '.address{margin-top: -42px;}';
    printHtml += '.address p{font-size:18px;margin-top: -15px !important;}';
    printHtml += '.title-lable {text-align: center;margin-top: -10px;margin-bottom: 0;}';
    printHtml += '.title-lable p {color: #0a0a0a !important;font-size: 22px;font-weight: bold;letter-spacing: .5px;}';
    printHtml += '.info-table {width:100%;color: #0a0a0a !important;border: none;font-size: 18px;margin-top: -8px;margin-bottom: 6px;padding-top:8px;display: inline-table;}';
    printHtml += '.table-container .info-table th, .table-container .info-table td{color: #0a0a0a !important;text-align:left;padding-left:15px;}';
    printHtml += '.custom-table {width: 100%;color: #0a0a0a !important;border-collapse:collapse;margin-bottom: -8px;display: inline-table;border-radius:5px;}';
    printHtml += '.custom-table th{height: 32px;text-align: center;border:1px solid #454545;line-height:15px;font-size: 18px;}';
    printHtml += '.custom-table tr{height: 32px;}';
    printHtml += '.custom-table td {text-align: center;border:1px solid #454545;font-size: 18px;}';
    printHtml += '.text-bold { font-weight: bold;}';
    printHtml += '.text-left { text-align: left;padding-left: 15px;}';
    printHtml += '.text-right { text-align: right;padding-right: 15px;}';
    // The digital footprint. Smaller and greyer than the body on purpose — it is provenance,
    // not content, and must not compete with the figures above it.
    printHtml += '.slip-footprint {text-align: center;font-size: 13px !important;color: #454545 !important;margin-top: 6px;padding-bottom: 10px;}';
    printHtml += 'p {color: #0a0a0a !important;font-size:18px;}';
    printHtml += 'h4 {color: #0a0a0a !important;}';
    printHtml += '.watermark-container {position: fixed;top: 0;left: 0;width: 100%;height: 100%;z-index: 1000;pointer-events: none;}';
    printHtml += '.watermark-logo {position: absolute;top: 25%;left: 50%;text-align: center;transform: translate(-50%, -50%) rotate(360deg);opacity: 0.19;width: 35%;height: auto;max-width: 500px;}';
    printHtml += '@media print {';
    printHtml += '  .watermark-container { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }';
    printHtml += '}';
    printHtml += '</style>';
    printHtml += '</head>';
    printHtml += '<body>';
    printHtml += '<div class="watermark-container">';
    if (schoolLogo) {
      printHtml += `<img src="${schoolLogo}" class="watermark-logo" alt="School Logo Watermark">`;
    }
    printHtml += '</div>';
    const slipElement = document.getElementById('salary-slip');
    if (slipElement) {
      printHtml += slipElement.outerHTML;
    }
    printHtml += '</body></html>';
    return printHtml;
  }

  // ₹-prefixed, no decimals — the exact formatCurrency the fee receipt uses, so the two
  // documents render money identically.
  formatCurrency(value: any): string {
    const amount = parseInt(value);
    if (!isNaN(amount)) {
      return '₹ ' + amount.toLocaleString(undefined);
    }
    return '₹ 0';
  }

  // Sunday-safe plain rendering of the attendance summary line the slip carries. One line, not
  // a table — the full breakdown lives in the View modal on the Generate tab.
  attendanceSummaryLine(payroll: any): string {
    if (!payroll) return '';
    return `Present ${payroll.presentDays} · Leave ${payroll.leaveDays} · Absent ${payroll.absentDays}`
      + ` · Working Days ${payroll.totalWorkingDays}`;
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
    this.updateMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.actionPayroll = null;
    this.payrollDetail = null;
    this.paymentRow = null;
    this.assignRow = null;
    this.deleteGroup = null;
    this.unlockConfirmed = false;
  }
}
