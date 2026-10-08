/**
 * Manage Shifts — punch windows, grace periods and half-day/late rules that Overview and
 * Roster both read from.
 *
 * Reference: docs/schoolzen-planning/v1/attendance/manage-shifts.html
 *
 * ONE toolbar row (search + Create Shift), no filter row. Deleting a shift that is still
 * assigned is blocked up front with the assigned count — reassign via Roster first.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { ShiftsService } from 'src/app/shared/services/attendance/shifts.service';
import { Shift, ShiftPayload, ShiftStatus, ShiftSummary } from 'src/app/shared/models/attendance/shift.model';
import { validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { formatTime, parseTimeInput } from 'src/app/shared/utils/attendance-time.util';

interface ShiftForm {
  id: string | null;
  name: string;
  startTime: string;
  endTime: string;
  earlyInMinutes: string;
  graceMinutes: string;
  halfDayAfterMinutes: string;
  earlyOutMinutes: string;
  lateOutMinutes: string;
  status: ShiftStatus;
}

const EMPTY_FORM: ShiftForm = {
  id: null, name: '', startTime: '', endTime: '', earlyInMinutes: '', graceMinutes: '',
  halfDayAfterMinutes: '', earlyOutMinutes: '', lateOutMinutes: '', status: 'active'
};
const KNOWN_FIELDS = ['name', 'startTime', 'endTime', 'earlyInMinutes', 'graceMinutes', 'halfDayAfterMinutes', 'earlyOutMinutes', 'lateOutMinutes', 'status'];
const MINUTE_FIELDS: (keyof ShiftForm)[] = ['earlyInMinutes', 'graceMinutes', 'halfDayAfterMinutes', 'earlyOutMinutes', 'lateOutMinutes'];

const plural = (count: number, one: string, many: string): string => count + ' ' + (count === 1 ? one : many);

@Component({
  selector: 'app-manage-shifts',
  templateUrl: './manage-shifts.component.html',
  styleUrls: ['./manage-shifts.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageShiftsComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  search = '';

  rows: Shift[] = [];
  page = 1;
  limit = 10;
  total = 0;
  summary: ShiftSummary = { total: 0, active: 0, inactive: 0 };

  readonly statusOptions: readonly DdOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];

  formOpen = false;
  /** Double-submit guard. */
  saving = false;
  formTitle = 'Create Shift';
  form: ShiftForm = { ...EMPTY_FORM };
  fieldErrors: Record<string, string> = {};
  formError = '';

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteTarget: Shift | null = null;
  deleting = false;

  readonly formatTime = formatTime;

  private searchInput$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: ShiftsService,
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
    this.api.getShifts(this.adminId, { search: this.search, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.summary = res.summary || this.summary;
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        this.rows = [];
        this.loadError = "Couldn't load shifts.";
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

  trackByRow = (_index: number, row: Shift): string => row._id;

  minutes(value: number | null): string {
    return value == null ? '' : value + ' min';
  }

  // --- add / edit ---------------------------------------------------------------------

  onCreate(): void {
    this.openForm('Create Shift', { ...EMPTY_FORM });
  }

  onEdit(row: Shift): void {
    const text = (value: number | null) => (value == null ? '' : String(value));
    this.openForm('Edit Shift', {
      id: row._id,
      name: row.name,
      startTime: formatTime(row.startTime),
      endTime: formatTime(row.endTime),
      earlyInMinutes: text(row.earlyInMinutes),
      graceMinutes: text(row.graceMinutes),
      halfDayAfterMinutes: text(row.halfDayAfterMinutes),
      earlyOutMinutes: text(row.earlyOutMinutes),
      lateOutMinutes: text(row.lateOutMinutes),
      status: row.status
    });
  }

  private openForm(title: string, form: ShiftForm): void {
    this.formTitle = title;
    this.form = form;
    this.fieldErrors = {};
    this.formError = '';
    this.saving = false;
    this.formOpen = true;
  }

  onFieldChange(field: keyof ShiftForm, value: string): void {
    this.form = { ...this.form, [field]: value };
    delete this.fieldErrors[field];
  }

  onStatusChange(value: string): void {
    this.form = { ...this.form, status: value === 'inactive' ? 'inactive' : 'active' };
  }

  get submitDisabled(): boolean {
    return this.saving || !this.form.name.trim() || !this.form.startTime.trim() || !this.form.endTime.trim();
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  /** Client-side mirror of the server rules, so the obvious mistakes never leave the page. */
  private buildPayload(): ShiftPayload | null {
    const errors: Record<string, string> = {};
    const startTime = parseTimeInput(this.form.startTime);
    const endTime = parseTimeInput(this.form.endTime);
    if (!startTime) errors['startTime'] = 'Enter a valid start time, e.g. 08:00 AM.';
    if (!endTime) errors['endTime'] = 'Enter a valid end time, e.g. 02:00 PM.';
    if (startTime && endTime && startTime >= endTime) errors['endTime'] = 'Start time must be before end time.';

    const numbers: Record<string, number | null> = {};
    MINUTE_FIELDS.forEach((field) => {
      const raw = String(this.form[field] ?? '').trim();
      if (!raw) {
        numbers[field] = null;
        return;
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) errors[field] = 'Must be a number of minutes, 0 or more.';
      numbers[field] = value;
    });

    if (Object.keys(errors).length) {
      this.fieldErrors = errors;
      return null;
    }
    return {
      adminId: this.adminId,
      name: this.form.name.trim(),
      startTime: startTime as string,
      endTime: endTime as string,
      earlyInMinutes: numbers['earlyInMinutes'] ?? 0,
      graceMinutes: numbers['graceMinutes'] ?? 0,
      halfDayAfterMinutes: numbers['halfDayAfterMinutes'],
      earlyOutMinutes: numbers['earlyOutMinutes'],
      lateOutMinutes: numbers['lateOutMinutes'],
      status: this.form.status
    };
  }

  onFormSubmit(): void {
    if (this.submitDisabled) return;
    this.fieldErrors = {};
    this.formError = '';
    const payload = this.buildPayload();
    if (!payload) {
      this.cdr.markForCheck();
      return;
    }
    this.saving = true;
    const request = this.form.id ? this.api.updateShift(this.form.id, payload) : this.api.createShift(payload);

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

  inUseText(row: Shift): string {
    const parts: string[] = [];
    if (row.people) parts.push(plural(row.people, 'person', 'people'));
    if (row.classes) parts.push(plural(row.classes, 'class', 'classes'));
    return parts.join(' and ');
  }

  onDelete(row: Shift): void {
    this.deleteTarget = row;
    const used = this.inUseText(row);
    this.confirmConfig = used
      ? {
        title: 'Delete this shift?',
        message: 'This shift is assigned to ' + used + ' — reassign them in Roster first.',
        confirmLabel: 'Delete',
        variant: 'warning',
        blocked: true
      }
      : {
        title: 'Delete this shift?',
        message: 'Staff and students currently assigned to it will need a new shift. This can\'t be undone.',
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
    this.api.deleteShift(this.adminId, row._id)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.deleting = false;
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.fetch();
      }, () => {
        // ErrorInterceptor has already shown SHIFT_IN_USE (with its count) or the failure.
        this.deleting = false;
        this.fetch();
      });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteTarget = null;
  }
}
