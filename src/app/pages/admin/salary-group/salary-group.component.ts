import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SalaryGroupService } from 'src/app/services/salary-group.service';

// SALARY GROUPS — the named pay scales a school puts people on.
//
// Its own lazy route, reached from the Payroll page's settings menu. Naming pay scales is
// setup done a few times a year, so nothing about it belongs in the bundle an admin downloads
// to generate this month's payroll.
//
// NO MONTH, NO PERSON TYPE. A pay scale is not scoped to either, which is why this is the one
// page in the section that takes no query params from the menu that opened it.
@Component({
  selector: 'app-salary-group',
  templateUrl: './salary-group.component.html',
  styleUrls: ['./salary-group.component.css']
})
export class SalaryGroupComponent implements OnInit {
  adminId!: string;

  // '' | 'group' | 'deleteGroup'
  showModal: boolean = false;
  modalMode: string = '';
  updateMode: boolean = false;
  errorCheck: Boolean = false;
  errorMsg: String = '';
  // Double-submit guard, reset in BOTH callbacks of every mutating call.
  isClick: boolean = false;

  groupForm: FormGroup;
  groupList: any[] = [];
  groupNumber: number = 0;
  groupLimit: number = 5;
  groupPaginationValues: Subject<any> = new Subject();
  groupLoader: Boolean = true;
  editGroupId: String = '';
  deleteGroup: any = null;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private salaryGroupService: SalaryGroupService,
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
  }

  ngOnInit(): void {
    const admin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = admin?.id;
    let load: any = this.getSalaryGroup({ page: 1 });
    if (load) {
      setTimeout(() => { this.groupLoader = false; }, 1000);
    }
  }

  // "Per Month" / "Per Day", never the raw 'perMonth' / 'perDay'. The enum is a storage
  // detail and has no business on screen.
  modeLabel(mode: String): string {
    if (mode === 'perDay') return 'Per Day';
    if (mode === 'perMonth') return 'Per Month';
    return '';
  }

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

  // Only this page's list. Assign Salary is a route of its own and reads the groups fresh
  // when it opens, so there is no second table here to keep in step.
  groupSuccessDone(message: string): void {
    this.closeModal();
    this.getSalaryGroup({ page: this.groupNumber || 1 });
    setTimeout(() => { this.toastr.success(message); }, 500);
  }

  // The backend returns business-rule failures as a plain STRING, not an object — see
  // CLAUDE.md's backend error-handling convention.
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
    this.deleteGroup = null;
  }
}
