/**
 * Salary Groups — the school's pay scales, set up once and applied on Assign Salary.
 *
 * Reference: docs/schoolzen-planning/v1/payroll/salary-groups.html
 *
 * Toolbar: one row — search + Add Salary Group (no filter row). Add/Edit modal: Name, Mode,
 * Basic, HRA, then add/remove Allowance and Deduction rows (variable count), Status. Delete
 * needs DELETE typed, and is refused (with counts) while anyone is on the group or payroll
 * was generated from it. Writes need the 'payroll' edit grant (`canEdit`).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SalaryGroupsService } from 'src/app/shared/services/payroll/salary-groups.service';
import {
  MODE_LABELS, SalaryGroup, SalaryGroupPayload, SalaryGroupStatus, SalaryMode
} from 'src/app/shared/models/payroll/salary-group.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { rupees } from '../payroll-format';

interface ComponentDraft {
  name: string;
  amount: string;
}

interface GroupForm {
  name: string;
  mode: SalaryMode;
  basic: string;
  hra: string;
  allowances: ComponentDraft[];
  deductions: ComponentDraft[];
  status: SalaryGroupStatus;
}

const emptyForm = (): GroupForm => ({ name: '', mode: 'monthly', basic: '', hra: '', allowances: [], deductions: [], status: 'active' });

/** Non-negative number, typed or blank-as-zero where allowed. */
const validAmount = (value: string, allowBlank = false): boolean => {
  if (String(value).trim() === '') return allowBlank;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
};

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

@Component({
  selector: 'app-salary-groups',
  templateUrl: './salary-groups.component.html',
  styleUrls: ['./salary-groups.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SalaryGroupsComponent implements OnInit, OnDestroy {
  adminId = '';
  search = '';
  rows: SalaryGroup[] = [];
  total = 0;
  page = 1;
  limit = 10;
  summary = { total: 0, active: 0 };
  canEdit = false;
  loading = true;
  loadError = '';

  readonly modeOptions: DdOption[] = [{ value: 'monthly', label: 'Per Month' }, { value: 'daily', label: 'Per Day' }];
  readonly statusOptions: DdOption[] = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
  readonly componentBlocks = [
    { key: 'allowances', title: 'Allowances', empty: 'Add one for medical or similar.' },
    { key: 'deductions', title: 'Deductions', empty: 'Add one for PF or similar.' }
  ] as const;

  // Add / Edit modal
  modalOpen = false;
  editingId = '';
  form: GroupForm = emptyForm();
  fieldErrors: Record<string, string> = {};
  formError = '';
  saving = false;

  // Delete
  deleteOpen = false;
  deleteTarget: SalaryGroup | null = null;
  deleteInput = '';
  deleteError = '';
  deleting = false;

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: SalaryGroupsService,
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
    this.api.list(this.adminId, { search: this.search, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.summary = res.summary || { total: 0, active: 0 };
        this.canEdit = Boolean(res.canEdit);
        this.loading = false;
        this.cdr.markForCheck();
      }, (error) => {
        // A failed fetch is said out loud — never rendered as "no salary groups yet".
        this.rows = [];
        this.total = 0;
        this.loading = false;
        this.loadError = errorMessageOf(error, "Couldn't load salary groups.");
        this.cdr.markForCheck();
      });
  }

  // --- display --------------------------------------------------------------------------

  modeLabel(mode: SalaryMode): string {
    return MODE_LABELS[mode] || mode;
  }

  money(value: number): string {
    return rupees(value);
  }

  componentsLine(group: SalaryGroup): string {
    const allowances = (group.allowances || []).length;
    const deductions = (group.deductions || []).length;
    if (!allowances && !deductions) return '';
    return `${plural(allowances, 'allowance', 'allowances')} · ${plural(deductions, 'deduction', 'deductions')}`;
  }

  get modeHint(): string {
    return this.form.mode === 'daily'
      ? 'The amounts below are per day worked — paid leave is paid, absences are not.'
      : 'The amounts below are a full month — absences are deducted from it.';
  }

  // --- Add / Edit -----------------------------------------------------------------------

  openAdd(): void {
    this.editingId = '';
    this.form = emptyForm();
    this.resetFormErrors();
    this.modalOpen = true;
  }

  openEdit(group: SalaryGroup): void {
    this.editingId = group._id;
    this.form = {
      name: group.name,
      mode: group.mode,
      basic: String(group.basic),
      hra: String(group.hra),
      allowances: (group.allowances || []).map((c) => ({ name: c.name, amount: String(c.amount) })),
      deductions: (group.deductions || []).map((c) => ({ name: c.name, amount: String(c.amount) })),
      status: group.status
    };
    this.resetFormErrors();
    this.modalOpen = true;
  }

  closeModal(): void {
    if (this.saving) return;
    this.modalOpen = false;
  }

  addComponent(list: 'allowances' | 'deductions'): void {
    this.form[list] = [...this.form[list], { name: '', amount: '' }];
  }

  removeComponent(list: 'allowances' | 'deductions', index: number): void {
    this.form[list] = this.form[list].filter((_item, i) => i !== index);
  }

  private resetFormErrors(): void {
    this.fieldErrors = {};
    this.formError = '';
  }

  /** Client-side mirror of the server's checks — a negative amount never round-trips. */
  private validate(): boolean {
    const errors: Record<string, string> = {};
    if (!this.form.name.trim()) errors['name'] = 'Name is required.';
    if (!validAmount(this.form.basic)) errors['basic'] = 'Enter a valid amount.';
    if (!validAmount(this.form.hra, true)) errors['hra'] = 'Enter a valid amount.';
    (['allowances', 'deductions'] as const).forEach((list) => {
      this.form[list].forEach((item, i) => {
        if (!item.name.trim()) errors[`${list}.${i}.name`] = 'Name is required.';
        if (!validAmount(item.amount)) errors[`${list}.${i}.amount`] = 'Enter a valid amount.';
      });
    });
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
    const payload: SalaryGroupPayload = {
      adminId: this.adminId,
      name: this.form.name.trim(),
      mode: this.form.mode,
      basic: Number(this.form.basic),
      hra: String(this.form.hra).trim() === '' ? 0 : Number(this.form.hra),
      allowances: this.form.allowances.map((c) => ({ name: c.name.trim(), amount: Number(c.amount) })),
      deductions: this.form.deductions.map((c) => ({ name: c.name.trim(), amount: Number(c.amount) })),
      status: this.form.status
    };
    this.saving = true;
    const request = this.editingId ? this.api.update(this.editingId, payload) : this.api.create(payload);
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.modalOpen = false;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error) => {
      this.saving = false;
      const validation = validationErrorsOf(error);
      if (validation && Object.keys(validation.fields).length) this.fieldErrors = validation.fields;
      else this.formError = errorMessageOf(error, "Couldn't save the salary group.");
      this.cdr.markForCheck();
    });
  }

  // --- Delete ---------------------------------------------------------------------------

  openDelete(group: SalaryGroup): void {
    this.deleteTarget = group;
    this.deleteInput = '';
    this.deleteError = '';
    this.deleteOpen = true;
  }

  closeDelete(): void {
    if (this.deleting) return;
    this.deleteOpen = false;
    this.deleteTarget = null;
  }

  /** Known up front from the row's counts — the button stays disabled and says why. */
  get deleteBlockedReason(): string {
    const group = this.deleteTarget;
    if (!group) return '';
    if (group.assigned) return `This salary group is assigned to ${plural(group.assigned, 'staff member', 'staff members')} and cannot be deleted. Move them to another group on Assign Salary first.`;
    if (group.payrolls) return `This salary group has ${plural(group.payrolls, 'generated payroll record', 'generated payroll records')} and cannot be deleted. Mark it inactive instead.`;
    return '';
  }

  get deleteEnabled(): boolean {
    return this.deleteInput === 'DELETE' && !this.deleteBlockedReason && !this.deleting;
  }

  confirmDelete(): void {
    if (!this.deleteEnabled || !this.deleteTarget) return;
    this.deleting = true;
    this.deleteError = '';
    this.api.remove(this.adminId, this.deleteTarget._id, this.deleteInput).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.deleting = false;
      this.deleteOpen = false;
      this.deleteTarget = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error) => {
      this.deleting = false;
      this.deleteError = errorMessageOf(error, "Couldn't delete the salary group.");
      this.cdr.markForCheck();
    });
  }

  trackById = (_index: number, row: { _id: string }): string => row._id;
  trackByIndex = (index: number): number => index;
  trackByKey = (_index: number, block: { key: string }): string => block.key;
}
