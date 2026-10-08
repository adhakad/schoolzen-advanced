/**
 * Leave Create — the types of leave the school offers, and whether each is paid.
 *
 * Reference: docs/schoolzen-planning/v1/leave/leave-create.html
 *
 * ONE plain toolbar row (search + Create), no filter row. A type still used by any
 * assignment or request can't be deleted — blocked up front with both counts; an unused
 * one needs a typed DELETE.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { LeaveTypesService } from 'src/app/shared/services/leave/leave-types.service';
import {
  LeaveType, LeaveTypePayload, LeaveTypeStatus, WHO_CAN_TAKE_LABELS, WhoCanTake
} from 'src/app/shared/models/leave/leave-type.model';
import { validationErrorsOf } from 'src/app/shared/utils/api-error.util';

interface LeaveTypeForm {
  id: string | null;
  name: string;
  whoCanTake: WhoCanTake;
  defaultDays: string;
  isPaid: boolean;
  status: LeaveTypeStatus;
}

const EMPTY_FORM: LeaveTypeForm = { id: null, name: '', whoCanTake: 'everyone', defaultDays: '', isPaid: true, status: 'active' };
const KNOWN_FIELDS = ['name', 'whoCanTake', 'defaultDays', 'isPaid', 'status'];

const plural = (count: number, one: string, many: string): string => count + ' ' + (count === 1 ? one : many);

@Component({
  selector: 'app-leave-create',
  templateUrl: './leave-create.component.html',
  styleUrls: ['./leave-create.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaveCreateComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  search = '';

  rows: LeaveType[] = [];
  page = 1;
  limit = 10;
  total = 0;
  summary = { total: 0, active: 0 };

  readonly whoLabels = WHO_CAN_TAKE_LABELS;
  readonly whoOptions: readonly DdOption[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'staff', label: 'Staff only' },
    { value: 'students', label: 'Students only' }
  ];
  readonly statusOptions: readonly DdOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];

  formOpen = false;
  /** Double-submit guard. */
  saving = false;
  formTitle = 'Create Leave Type';
  form: LeaveTypeForm = { ...EMPTY_FORM };
  fieldErrors: Record<string, string> = {};
  formError = '';

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteTarget: LeaveType | null = null;
  deleting = false;

  private searchInput$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: LeaveTypesService,
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
    this.api.getTypes(this.adminId, { search: this.search, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.summary = res.summary || this.summary;
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        this.rows = [];
        this.loadError = "Couldn't load leave types.";
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value.trim());
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

  trackByRow = (_index: number, row: LeaveType): string => row._id;

  // --- add / edit ---------------------------------------------------------------------

  onCreate(): void {
    this.openForm('Create Leave Type', { ...EMPTY_FORM });
  }

  onEdit(row: LeaveType): void {
    this.openForm('Edit Leave Type', {
      id: row._id,
      name: row.name,
      whoCanTake: row.whoCanTake,
      defaultDays: String(row.defaultDays),
      isPaid: row.isPaid,
      status: row.status
    });
  }

  private openForm(title: string, form: LeaveTypeForm): void {
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

  onDaysChange(value: string): void {
    this.form = { ...this.form, defaultDays: value };
    delete this.fieldErrors['defaultDays'];
  }

  onWhoChange(value: string): void {
    this.form = { ...this.form, whoCanTake: (value as WhoCanTake) || 'everyone' };
    delete this.fieldErrors['whoCanTake'];
  }

  onPaidChange(isPaid: boolean): void {
    this.form = { ...this.form, isPaid };
  }

  onStatusChange(value: string): void {
    this.form = { ...this.form, status: value === 'inactive' ? 'inactive' : 'active' };
  }

  get daysValid(): boolean {
    const days = Number(this.form.defaultDays);
    return String(this.form.defaultDays).trim() !== '' && Number.isInteger(days) && days >= 1 && days <= 366;
  }

  /** Submit stays disabled until the form is valid (name + a whole number of days). */
  get submitDisabled(): boolean {
    return this.saving || !this.form.name.trim() || !this.daysValid;
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  onFormSubmit(): void {
    if (this.submitDisabled) return;
    this.fieldErrors = {};
    this.formError = '';
    const payload: LeaveTypePayload = {
      adminId: this.adminId,
      name: this.form.name.trim(),
      whoCanTake: this.form.whoCanTake,
      defaultDays: Number(this.form.defaultDays),
      isPaid: this.form.isPaid,
      status: this.form.status
    };
    this.saving = true;
    const request = this.form.id ? this.api.updateType(this.form.id, payload) : this.api.createType(payload);
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

  inUseText(row: LeaveType): string {
    const parts: string[] = [];
    if (row.assignments) parts.push(plural(row.assignments, 'assignment', 'assignments'));
    if (row.requests) parts.push(plural(row.requests, 'request', 'requests'));
    return parts.join(' and ');
  }

  onDelete(row: LeaveType): void {
    if (this.confirmOpen) return;
    this.deleteTarget = row;
    const used = this.inUseText(row);
    this.confirmConfig = used
      ? {
        title: 'Delete Leave Type',
        message: 'This leave type is used by ' + used + ' and cannot be deleted. Mark it Inactive to hide it from new requests instead.',
        confirmLabel: 'Delete',
        variant: 'warning',
        blocked: true
      }
      : {
        title: 'Delete Leave Type',
        message: 'Deleting this leave type affects every existing request and balance tied to it. This can\'t be undone.',
        confirmLabel: 'Delete',
        variant: 'warning',
        typeToConfirm: 'DELETE'
      };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const row = this.deleteTarget;
    this.deleteTarget = null;
    if (!row || this.deleting || this.inUseText(row)) return;
    this.deleting = true;
    this.api.deleteType(this.adminId, row._id)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.deleting = false;
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.fetch();
      }, () => {
        // ErrorInterceptor has already shown LEAVE_TYPE_IN_USE (with its counts) or the failure.
        this.deleting = false;
        this.fetch();
      });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteTarget = null;
  }
}
