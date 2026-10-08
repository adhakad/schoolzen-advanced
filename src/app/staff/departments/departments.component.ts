/**
 * Departments — simple CRUD list (Name, Status, Action).
 *
 * Reference: docs/schoolzen-planning/v1/staff/departments.html
 *
 * One toolbar row (search + Create, no filters). Deleting a department still used by staff
 * or designations needs typed DELETE; the counts come with the list, so the dialog says what
 * will be affected BEFORE the attempt.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { Department, LookupSummary, StaffRecordStatus } from 'src/app/shared/models/staff/department.model';
import { validationErrorsOf } from 'src/app/shared/utils/api-error.util';

interface DepartmentForm {
  id: string | null;
  name: string;
  status: StaffRecordStatus;
}

const EMPTY_FORM: DepartmentForm = { id: null, name: '', status: 'active' };
const KNOWN_FIELDS = ['name', 'status'];

const plural = (count: number, one: string, many: string): string => count + ' ' + (count === 1 ? one : many);

@Component({
  selector: 'app-departments',
  templateUrl: './departments.component.html',
  styleUrls: ['./departments.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DepartmentsComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  search = '';

  rows: Department[] = [];
  page = 1;
  limit = 10;
  total = 0;
  summary: LookupSummary = { total: 0, active: 0 };

  readonly statusOptions: readonly DdOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];

  formOpen = false;
  /** Double-submit guard. */
  saving = false;
  formTitle = 'Create Department';
  form: DepartmentForm = { ...EMPTY_FORM };
  fieldErrors: Record<string, string> = {};
  formError = '';

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteTarget: Department | null = null;
  deleting = false;

  private searchInput$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: DepartmentsService,
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
    this.searchInput$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroyed$))
      .subscribe((value) => {
        this.search = value;
        this.page = 1;
        this.fetch();
      });
    this.fetch();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- list ---------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.api.getDepartments(this.adminId, { search: this.search, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.summary = res.summary || this.summary;
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        this.rows = [];
        this.loadError = "Couldn't load departments.";
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value);
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

  trackByRow = (_index: number, row: Department): string => row._id;

  // --- add / edit ---------------------------------------------------------------------

  onCreate(): void {
    this.openForm('Create Department', { ...EMPTY_FORM });
  }

  onEdit(row: Department): void {
    this.openForm('Edit Department', { id: row._id, name: row.name, status: row.status });
  }

  private openForm(title: string, form: DepartmentForm): void {
    this.formTitle = title;
    this.form = form;
    this.fieldErrors = {};
    this.formError = '';
    this.saving = false;
    this.formOpen = true;
  }

  onNameChange(value: string): void {
    this.form = { ...this.form, name: value };
    delete this.fieldErrors['name'];
  }

  onStatusChange(value: string): void {
    this.form = { ...this.form, status: value === 'inactive' ? 'inactive' : 'active' };
  }

  get submitDisabled(): boolean {
    return this.saving || !this.form.name.trim();
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  onFormSubmit(): void {
    if (this.submitDisabled) return;
    this.saving = true;
    this.fieldErrors = {};
    this.formError = '';

    const payload = { adminId: this.adminId, name: this.form.name.trim(), status: this.form.status };
    const request = this.form.id
      ? this.api.updateDepartment(this.form.id, payload)
      : this.api.createDepartment(payload);

    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.formOpen = false;
      // DEPARTMENT_DEACTIVATE_BLOCKED is a warning: saved, but staff still belong here.
      const warning = res?.warnings?.[0]?.message;
      this.snackBar.open(warning ? res.message + ' ' + warning : res.message, 'Close', { duration: warning ? 6000 : 3000 });
      this.fetch();
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.saving = false;
      const inline = validationErrorsOf(error);
      if (inline) {
        Object.keys(inline.fields).forEach((field) => {
          if (KNOWN_FIELDS.indexOf(field) === -1) this.formError = this.formError || inline.fields[field];
          else this.fieldErrors[field] = inline.fields[field];
        });
        if (!Object.keys(inline.fields).length) this.formError = inline.message;
      }
      this.cdr.markForCheck();
    });
  }

  // --- delete -------------------------------------------------------------------------

  inUse(row: Department): boolean {
    return (row.staffCount || 0) + (row.designationCount || 0) > 0;
  }

  onDelete(row: Department): void {
    this.deleteTarget = row;
    const parts: string[] = [];
    if (row.staffCount) parts.push(plural(row.staffCount, 'staff member', 'staff'));
    if (row.designationCount) parts.push(plural(row.designationCount, 'designation', 'designations'));
    this.confirmConfig = this.inUse(row)
      ? {
        title: 'Delete Department',
        message: 'Delete "' + row.name + '"? This can\'t be undone.',
        scopeNote: parts.join(' and ') + ' use this department — they will be left without one.',
        confirmLabel: 'Delete',
        variant: 'warning',
        typeToConfirm: 'DELETE'
      }
      : {
        title: 'Delete Department',
        message: 'Delete "' + row.name + '"? This can\'t be undone.',
        confirmLabel: 'Delete',
        variant: 'warning'
      };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const row = this.deleteTarget;
    this.deleteTarget = null;
    if (!row || this.deleting) return;
    this.deleting = true;
    // Confirmed: in use, the admin typed DELETE; not in use, nothing depends on it.
    this.api.deleteDepartment(this.adminId, row._id, true)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.deleting = false;
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.fetch();
      }, () => {
        // ErrorInterceptor has already said what went wrong.
        this.deleting = false;
        this.cdr.markForCheck();
      });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteTarget = null;
  }
}
