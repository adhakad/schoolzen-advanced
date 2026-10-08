/**
 * Designations — job titles, OPTIONALLY under a department.
 *
 * Reference: docs/schoolzen-planning/v1/staff/designations.html
 *
 * Two toolbar rows: search + Create, then the Department filter on its own row. Department
 * is genuinely optional on THIS page — the form's dropdown has "-- None --" and the filter
 * has "Not set" (standalone designations only). Manage Staff is the other context, where a
 * designation needs a department first; the two rules are deliberately different.
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
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { Department, LookupSummary, StaffRecordStatus } from 'src/app/shared/models/staff/department.model';
import { Designation } from 'src/app/shared/models/staff/designation.model';
import { validationErrorsOf } from 'src/app/shared/utils/api-error.util';

interface DesignationForm {
  id: string | null;
  title: string;
  /** '' = "-- None --" (standalone). */
  departmentId: string;
  status: StaffRecordStatus;
}

const EMPTY_FORM: DesignationForm = { id: null, title: '', departmentId: '', status: 'active' };
const KNOWN_FIELDS = ['title', 'departmentId', 'status'];
/** The filter value for standalone designations — matches the API's `departmentId=none`. */
export const NO_DEPARTMENT = 'none';

@Component({
  selector: 'app-designations',
  templateUrl: './designations.component.html',
  styleUrls: ['./designations.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignationsComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  search = '';
  departmentFilter = '';

  rows: Designation[] = [];
  page = 1;
  limit = 10;
  total = 0;
  summary: LookupSummary = { total: 0, active: 0 };

  departments: Department[] = [];
  /** The department dropdowns' own failure state — never a silently empty menu. */
  departmentsError = '';

  readonly statusOptions: readonly DdOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];
  filterOptions: DdOption[] = [{ value: '', label: 'All departments' }];
  formDepartmentOptions: DdOption[] = [{ value: '', label: '-- None --' }];

  formOpen = false;
  saving = false;
  formTitle = 'Create Designation';
  form: DesignationForm = { ...EMPTY_FORM };
  fieldErrors: Record<string, string> = {};
  formError = '';

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteTarget: Designation | null = null;
  deleting = false;

  private searchInput$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: DesignationsService,
    private departmentsApi: DepartmentsService,
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
    this.loadDepartments();
    this.fetch();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- lookups ------------------------------------------------------------------------

  loadDepartments(): void {
    this.departmentsError = '';
    this.departmentsApi.getOptions(this.adminId)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.departments = res.rows || [];
        this.buildDepartmentOptions();
        this.cdr.markForCheck();
      }, () => {
        this.departments = [];
        this.departmentsError = "Couldn't load departments.";
        this.buildDepartmentOptions();
        this.cdr.markForCheck();
      });
  }

  private buildDepartmentOptions(): void {
    const all = this.departments.map((dept) => ({ value: dept._id, label: dept.name }));
    this.filterOptions = [{ value: '', label: 'All departments' }, { value: NO_DEPARTMENT, label: 'Not set' }, ...all];
    // New picks only from active departments; an inactive one stays selectable for the row
    // that already has it, so editing doesn't silently drop it.
    const keep = this.form.departmentId;
    this.formDepartmentOptions = [
      { value: '', label: '-- None --' },
      ...this.departments
        .filter((dept) => dept.status === 'active' || dept._id === keep)
        .map((dept) => ({ value: dept._id, label: dept.name }))
    ];
  }

  // --- list ---------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.api.getDesignations(this.adminId, {
      search: this.search, departmentId: this.departmentFilter, page: this.page, limit: this.limit
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.total = res.total || 0;
      this.summary = res.summary || this.summary;
      this.loading = false;
      this.cdr.markForCheck();
    }, () => {
      this.rows = [];
      this.loadError = "Couldn't load designations.";
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value);
  }

  onDepartmentFilter(value: string): void {
    this.departmentFilter = value;
    this.page = 1;
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

  trackByRow = (_index: number, row: Designation): string => row._id;

  // --- add / edit ---------------------------------------------------------------------

  onCreate(): void {
    this.openForm('Create Designation', { ...EMPTY_FORM });
  }

  onEdit(row: Designation): void {
    this.openForm('Edit Designation', { id: row._id, title: row.title, departmentId: row.departmentId || '', status: row.status });
  }

  private openForm(title: string, form: DesignationForm): void {
    this.formTitle = title;
    this.form = form;
    this.buildDepartmentOptions();
    this.fieldErrors = {};
    this.formError = '';
    this.saving = false;
    this.formOpen = true;
  }

  onTitleChange(value: string): void {
    this.form = { ...this.form, title: value };
    delete this.fieldErrors['title'];
  }

  onFormDepartmentChange(value: string): void {
    this.form = { ...this.form, departmentId: value };
    delete this.fieldErrors['departmentId'];
  }

  onStatusChange(value: string): void {
    this.form = { ...this.form, status: value === 'inactive' ? 'inactive' : 'active' };
  }

  get submitDisabled(): boolean {
    return this.saving || !this.form.title.trim();
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

    const payload = {
      adminId: this.adminId,
      title: this.form.title.trim(),
      // "-- None --" is a real choice: a standalone designation.
      departmentId: this.form.departmentId || null,
      status: this.form.status
    };
    const request = this.form.id
      ? this.api.updateDesignation(this.form.id, payload)
      : this.api.createDesignation(payload);

    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.formOpen = false;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
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

  onDelete(row: Designation): void {
    this.deleteTarget = row;
    const held = row.staffCount || 0;
    this.confirmConfig = {
      title: 'Delete Designation',
      message: 'Delete "' + row.title + '"? This can\'t be undone.',
      scopeNote: held
        ? held + (held === 1 ? ' staff member holds' : ' staff members hold') + ' this designation — they will be left without one.'
        : undefined,
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: held ? 'DELETE' : undefined
    };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const row = this.deleteTarget;
    this.deleteTarget = null;
    if (!row || this.deleting) return;
    this.deleting = true;
    this.api.deleteDesignation(this.adminId, row._id, true)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.deleting = false;
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.fetch();
      }, () => {
        this.deleting = false;
        this.cdr.markForCheck();
      });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteTarget = null;
  }
}
