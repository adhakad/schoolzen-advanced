/**
 * Assign Salary — puts staff on a pay scale; no scale means no payroll for them.
 *
 * Reference: docs/schoolzen-planning/v1/payroll/assign-salary.html
 *
 * Toolbar: search + "Assign to Selected" (bulk), then Department → Designation. A row shows
 * its group (+ mode tag, + "Has a personal override" when this person's figures deviate from
 * the group), Effective From, and Assign / Change. The single modal can carry per-field
 * overrides — blank keeps the group's value, 0 means none. A bulk assign never touches
 * anyone's existing overrides.
 *
 * Everything here needs the 'payroll-assign' permission (enforced by the API); without the
 * edit grant (`canEdit`) the assign controls are hidden.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AssignSalaryService } from 'src/app/shared/services/payroll/assign-salary.service';
import { SalaryGroupsService } from 'src/app/shared/services/payroll/salary-groups.service';
import { AssignGridRow, SalaryOverrides } from 'src/app/shared/models/payroll/assign-salary.model';
import { MODE_LABELS, SalaryGroup, SalaryMode } from 'src/app/shared/models/payroll/salary-group.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { StaffCascadeValue } from '../staff-cascade-filter/staff-cascade-filter.component';
import { shortDate, todayKey } from '../payroll-format';

interface AssignForm {
  salaryGroupId: string;
  effectiveFrom: string;
  override: boolean;
  basic: string;
  hra: string;
}

const blankToNull = (value: string): number | null => (String(value).trim() === '' ? null : Number(value));
const validOverride = (value: string): boolean => String(value).trim() === '' || (Number.isFinite(Number(value)) && Number(value) >= 0);

@Component({
  selector: 'app-assign-salary',
  templateUrl: './assign-salary.component.html',
  styleUrls: ['./assign-salary.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssignSalaryComponent implements OnInit, OnDestroy {
  adminId = '';
  filter: StaffCascadeValue = { departmentId: '', designationId: '' };
  search = '';

  rows: AssignGridRow[] = [];
  total = 0;
  page = 1;
  limit = 25;
  summary = { staff: 0, assigned: 0, withOverride: 0 };
  canEdit = false;
  loading = true;
  loadError = '';
  selected = new Set<string>();

  // modal (single or bulk)
  modalOpen = false;
  modalTitle = '';
  bulk = false;
  target: AssignGridRow | null = null;
  groups: SalaryGroup[] = [];
  groupOptions: DdOption[] = [];
  groupsError = '';
  form: AssignForm = { salaryGroupId: '', effectiveFrom: '', override: false, basic: '', hra: '' };
  fieldErrors: Record<string, string> = {};
  formError = '';
  saving = false;

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: AssignSalaryService,
    private groupsApi: SalaryGroupsService,
    private adminAuthService: AdminAuthService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) {
      this.loading = false;
      return;
    }
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.page = 1;
      this.fetch();
    });
    this.fetch();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: StaffCascadeValue): void {
    this.filter = value;
    this.page = 1;
    this.selected.clear();
    this.fetch();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.fetch();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.page = 1;
    this.fetch();
  }

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.grid(this.adminId, { ...this.filter, search: this.search, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.summary = res.summary || { staff: 0, assigned: 0, withOverride: 0 };
        this.canEdit = Boolean(res.canEdit);
        this.loading = false;
        this.cdr.markForCheck();
      }, (error) => {
        this.rows = [];
        this.total = 0;
        this.loading = false;
        this.loadError = errorMessageOf(error, "Couldn't load staff.");
        this.cdr.markForCheck();
      });
  }

  // --- display --------------------------------------------------------------------------

  modeLabel(mode: SalaryMode | null): string {
    return mode ? MODE_LABELS[mode] : '';
  }

  date(value: string | null | undefined): string {
    return shortDate(value);
  }

  subLine(row: AssignGridRow): string {
    return [row.code, row.designation].filter(Boolean).join(' · ');
  }

  // --- selection ------------------------------------------------------------------------

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row._id));
  }

  toggleAll(): void {
    if (this.allSelected) this.rows.forEach((row) => this.selected.delete(row._id));
    else this.rows.forEach((row) => this.selected.add(row._id));
  }

  toggleRow(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  // --- modal ----------------------------------------------------------------------------

  openSingle(row: AssignGridRow): void {
    const current = row.assignment;
    const overrides = current && current.overrides;
    this.bulk = false;
    this.target = row;
    this.modalTitle = `Assign Salary Group — ${row.name}`;
    this.form = {
      salaryGroupId: current && !current.groupMissing ? current.salaryGroupId : '',
      effectiveFrom: current ? current.effectiveFrom : todayKey(),
      override: Boolean(overrides && (overrides.basic !== null || overrides.hra !== null)),
      basic: overrides && overrides.basic !== null && overrides.basic !== undefined ? String(overrides.basic) : '',
      hra: overrides && overrides.hra !== null && overrides.hra !== undefined ? String(overrides.hra) : ''
    };
    this.openModal();
  }

  openBulk(): void {
    if (!this.selected.size) return;
    this.bulk = true;
    this.target = null;
    this.modalTitle = `Assign Salary Group — ${this.selected.size} selected`;
    this.form = { salaryGroupId: '', effectiveFrom: todayKey(), override: false, basic: '', hra: '' };
    this.openModal();
  }

  private openModal(): void {
    this.fieldErrors = {};
    this.formError = '';
    this.modalOpen = true;
    this.loadGroups();
  }

  loadGroups(): void {
    this.groupsError = '';
    this.groupsApi.options(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.groups = res.rows || [];
      this.groupOptions = this.groups.map((group) => ({ value: group._id, label: `${group.name} · ${MODE_LABELS[group.mode]}` }));
      this.cdr.markForCheck();
    }, (error) => {
      this.groups = [];
      this.groupOptions = [];
      this.groupsError = errorMessageOf(error, "Couldn't load salary groups.");
      this.cdr.markForCheck();
    });
  }

  closeModal(): void {
    if (this.saving) return;
    this.modalOpen = false;
  }

  private validate(): boolean {
    const errors: Record<string, string> = {};
    if (!this.form.salaryGroupId) errors['salaryGroupId'] = 'Choose a salary group.';
    if (!this.form.effectiveFrom) errors['effectiveFrom'] = 'Choose a valid date.';
    if (this.form.override && !validOverride(this.form.basic)) errors['overrides.basic'] = 'Enter a valid amount.';
    if (this.form.override && !validOverride(this.form.hra)) errors['overrides.hra'] = 'Enter a valid amount.';
    this.fieldErrors = errors;
    return !Object.keys(errors).length;
  }

  submit(): void {
    if (this.saving) return;
    this.formError = '';
    if (!this.validate()) {
      this.cdr.markForCheck();
      return;
    }
    this.saving = true;
    const done = (message: string) => {
      this.saving = false;
      this.modalOpen = false;
      this.selected.clear();
      this.snackBar.open(message, 'Close', { duration: 3500 });
      this.fetch();
    };
    const fail = (error: unknown) => {
      this.saving = false;
      const validation = validationErrorsOf(error);
      if (validation && Object.keys(validation.fields).length) this.fieldErrors = validation.fields;
      else this.formError = errorMessageOf(error, "Couldn't assign the salary group.");
      this.cdr.markForCheck();
    };

    if (this.bulk) {
      this.api.bulkAssign({
        adminId: this.adminId, staffIds: [...this.selected], salaryGroupId: this.form.salaryGroupId, effectiveFrom: this.form.effectiveFrom
      }).pipe(takeUntil(this.destroyed$)).subscribe((res) => done(res.message), fail);
      return;
    }
    const existing = this.target && this.target.assignment && this.target.assignment.overrides;
    // Only Basic/HRA are edited here; any allowance/deduction override already on the
    // person is carried through untouched. Unticking "Override" clears Basic/HRA only.
    const overrides: SalaryOverrides = {
      basic: this.form.override ? blankToNull(this.form.basic) : null,
      hra: this.form.override ? blankToNull(this.form.hra) : null,
      allowances: existing ? existing.allowances : null,
      deductions: existing ? existing.deductions : null
    };
    this.api.assign({
      adminId: this.adminId, staffId: this.target!._id, salaryGroupId: this.form.salaryGroupId, effectiveFrom: this.form.effectiveFrom, overrides
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => done(res.message), fail);
  }

  trackById = (_index: number, row: { _id: string }): string => row._id;
}
