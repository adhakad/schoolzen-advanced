import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SalaryGroupService } from 'src/app/services/salary-group.service';
import { SalaryStructureService } from 'src/app/services/salary-structure.service';

// ASSIGN SALARY — putting staff and teachers on a pay scale.
//
// Its own lazy route, reached from the Payroll page's settings menu, which passes the
// Staff/Teachers selection along as a query param so arriving here does not silently reset
// the list to Staff after somebody spent the previous screen looking at teachers.
//
// OVERRIDES ARE NULL-OR-A-VALUE, NEVER FALSY. An overrideHra of 0 is a real instruction
// (this person gets no HRA) and blank means "use the group's" — the two must stay
// distinguishable all the way to the backend. See models/salary-structure.js.
@Component({
  selector: 'app-salary-structure',
  templateUrl: './salary-structure.component.html',
  styleUrls: ['./salary-structure.component.css']
})
export class SalaryStructureComponent implements OnInit {
  adminId!: string;

  // '' | 'assign' | 'bulkAssign'
  showModal: boolean = false;
  modalMode: string = '';
  errorCheck: Boolean = false;
  errorMsg: String = '';
  // Double-submit guard, reset in BOTH callbacks of every mutating call.
  isClick: boolean = false;

  personTypeFilter: string = 'staff';

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

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private salaryGroupService: SalaryGroupService,
    private salaryStructureService: SalaryStructureService,
  ) {
    this.assignForm = this.fb.group({
      salaryGroupId: ['', Validators.required],
      effectiveFrom: ['', Validators.required],
      // Blank means "use the group's". They are NOT given 0 as a default — see the class
      // header.
      overrideBasic: [''],
      overrideHra: [''],
      overrideAllowances: this.fb.array([]),
      overrideDeductions: this.fb.array([]),
    })
  }

  ngOnInit(): void {
    const admin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = admin?.id;
    // Carried from the Payroll page's settings menu. Absent on a direct URL, which falls back
    // to Staff rather than failing — the page has to work when it is opened cold.
    const personType = this.route.snapshot.queryParamMap.get('personType');
    if (personType === 'staff' || personType === 'teacher') this.personTypeFilter = personType;

    this.getActiveGroups();
    let load: any = this.getAssignSalary({ page: 1 });
    if (load) {
      setTimeout(() => { this.assignLoader = false; }, 1000);
    }
  }

  personTypeLabel(personType: String): string {
    return personType === 'teacher' ? 'Teachers' : 'Staff';
  }

  modeLabel(mode: String): string {
    if (mode === 'perDay') return 'Per Day';
    if (mode === 'perMonth') return 'Per Month';
    return '';
  }

  // Changing the person type invalidates the selection as well as the list. A staff id left
  // ticked while the teacher list is on screen would be submitted against the teacher
  // collection and come back silently skipped as "not found".
  switchPersonType(): void {
    this.selectedPersonIds = [];
    this.getAssignSalary({ page: 1 });
  }

  get overrideAllowanceRows(): FormArray { return this.assignForm.get('overrideAllowances') as FormArray; }
  get overrideDeductionRows(): FormArray { return this.assignForm.get('overrideDeductions') as FormArray; }

  newComponentRow(name: any = '', amount: any = ''): FormGroup {
    return this.fb.group({
      name: [name, Validators.required],
      amount: [amount, Validators.required],
    });
  }

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

  // The assign picker's options.
  getActiveGroups(): void {
    this.salaryGroupService.getActiveSalaryGroupList(this.adminId).subscribe(
      (res: any) => { this.activeGroups = res || []; },
      () => { this.activeGroups = []; }
    );
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

  // Only this page's list. Generate Payroll is a route of its own and reads assignments
  // fresh when it opens.
  assignSuccessDone(message: string): void {
    this.closeModal();
    this.getAssignSalary({ page: this.assignNumber || 1 });
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
    this.errorCheck = false;
    this.errorMsg = '';
    this.assignRow = null;
  }
}
