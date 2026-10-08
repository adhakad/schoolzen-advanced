/**
 * Manage Staff — everyone on payroll, teaching and non-teaching alike (one Staff collection).
 *
 * Reference: docs/schoolzen-planning/v1/staff/manage-staff.html
 *
 * Two toolbar rows: search + Delete Selected / Assign Card to Selected / Create, then the
 * Department → Designation → Status filters. The Designation filter and the form's
 * Designation dropdown are both disabled until a Department is picked, and both filter the
 * ONE already-fetched designation list client-side (staff/optimization.md).
 *
 * Offset pagination on purpose: a school's staff stays in the hundreds (manage-staff.md).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { forkJoin, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { ManageStaffService } from 'src/app/shared/services/staff/manage-staff.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { Department, StaffRecordStatus } from 'src/app/shared/models/staff/department.model';
import { Designation } from 'src/app/shared/models/staff/designation.model';
import {
  STAFF_VERIFY_MODES, StaffDeviceSyncResult, StaffPayload, StaffRow, StaffRowOutcome
} from 'src/app/shared/models/staff/staff.model';
import { errorMessageOf, rowErrorsOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';

interface StaffForm {
  id: string | null;
  name: string;
  empCode: string;
  departmentId: string;
  designationId: string;
  /** 'YYYY-MM-DD' or ''. */
  joiningDate: string;
  status: StaffRecordStatus;
  isOwner: boolean;
}

interface OutcomeLine {
  id: string;
  label: string;
  message: string;
}

const EMPTY_FORM: StaffForm = {
  id: null, name: '', empCode: '', departmentId: '', designationId: '', joiningDate: '', status: 'active', isOwner: false
};
const KNOWN_FIELDS = ['name', 'empCode', 'departmentId', 'designationId', 'joiningDate', 'status'];

/** Staff has THREE verify modes — one more than Student. */
export const VERIFY_MODE_OPTIONS: readonly DdOption[] = [
  { value: String(STAFF_VERIFY_MODES.CARD_ONLY), label: 'Card only' },
  { value: String(STAFF_VERIFY_MODES.CARD_AND_PIN), label: 'Card + PIN' },
  { value: String(STAFF_VERIFY_MODES.CARD_AND_FINGERPRINT), label: 'Card + Fingerprint' }
];

const DEVICE_UNREACHABLE = "Card saved, but couldn't reach the device — it will sync automatically when the device is back online.";

@Component({
  selector: 'app-manage-staff',
  templateUrl: './manage-staff.component.html',
  styleUrls: ['./manage-staff.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageStaffComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  search = '';

  rows: StaffRow[] = [];
  page = 1;
  limit = 10;
  total = 0;
  summary = { total: 0, cardsAssigned: 0 };
  /** Every row seen on any page — a selection survives paging. */
  private known = new Map<string, StaffRow>();
  selected = new Set<string>();

  // Filters
  filterDepartmentId = '';
  filterDesignationId = '';
  filterStatus = '';
  readonly statusFilterOptions: readonly DdOption[] = [
    { value: '', label: 'Any status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];
  readonly statusOptions: readonly DdOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];
  readonly verifyModeOptions = VERIFY_MODE_OPTIONS;

  // Lookups (the same cached lists the Departments/Designations pages read)
  departments: Department[] = [];
  designations: Designation[] = [];
  lookupError = '';
  departmentFilterOptions: DdOption[] = [{ value: '', label: 'All departments' }];
  designationFilterOptions: DdOption[] = [{ value: '', label: 'All designations' }];
  formDepartmentOptions: DdOption[] = [];
  formDesignationOptions: DdOption[] = [];

  // Add / Edit
  formOpen = false;
  saving = false;
  formTitle = 'Create Staff';
  form: StaffForm = { ...EMPTY_FORM };
  fieldErrors: Record<string, string> = {};
  formError = '';

  // Assign Card
  cardOpen = false;
  cardSaving = false;
  cardTargets: StaffRow[] = [];
  cardNumbers: Record<string, string> = {};
  cardVerifyMode = String(STAFF_VERIFY_MODES.CARD_ONLY);
  cardRowErrors: Record<string, string> = {};
  cardError = '';

  // Delete
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteIds: string[] = [];
  deleting = false;
  resultOpen = false;
  resultSummary = '';
  resultLines: OutcomeLine[] = [];

  private searchInput$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: ManageStaffService,
    private departmentsApi: DepartmentsService,
    private designationsApi: DesignationsService,
    private jobs: JobStatusService,
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
    this.loadLookups();
    this.fetch();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- lookups ------------------------------------------------------------------------

  loadLookups(): void {
    this.lookupError = '';
    forkJoin([this.departmentsApi.getOptions(this.adminId), this.designationsApi.getOptions(this.adminId)])
      .pipe(takeUntil(this.destroyed$))
      .subscribe(([departments, designations]) => {
        this.departments = departments.rows || [];
        this.designations = designations.rows || [];
        this.rebuildOptions();
        this.cdr.markForCheck();
      }, () => {
        // Said out loud: otherwise the Designation dropdown just looks empty after a pick.
        this.departments = [];
        this.designations = [];
        this.lookupError = "Couldn't load departments and designations.";
        this.rebuildOptions();
        this.cdr.markForCheck();
      });
  }

  /** Designations of one department — client-side over the one fetched list. */
  private designationsOf(departmentId: string): Designation[] {
    return departmentId ? this.designations.filter((item) => item.departmentId === departmentId) : [];
  }

  private rebuildOptions(): void {
    this.departmentFilterOptions = [
      { value: '', label: 'All departments' },
      ...this.departments.map((dept) => ({ value: dept._id, label: dept.name }))
    ];
    this.designationFilterOptions = [
      { value: '', label: 'All designations' },
      ...this.designationsOf(this.filterDepartmentId).map((item) => ({ value: item._id, label: item.title }))
    ];
    // New picks only from active entries; the record's current one stays selectable.
    this.formDepartmentOptions = [
      { value: '', label: '-- Select --' },
      ...this.departments
        .filter((dept) => dept.status === 'active' || dept._id === this.form.departmentId)
        .map((dept) => ({ value: dept._id, label: dept.name }))
    ];
    this.formDesignationOptions = [
      { value: '', label: '-- Select --' },
      ...this.designationsOf(this.form.departmentId)
        .filter((item) => item.status === 'active' || item._id === this.form.designationId)
        .map((item) => ({ value: item._id, label: item.title }))
    ];
  }

  get designationFilterDisabled(): boolean {
    return !this.filterDepartmentId;
  }

  get formDesignationDisabled(): boolean {
    return !this.form.departmentId;
  }

  // --- list ---------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.api.getStaff(this.adminId, {
      search: this.search,
      departmentId: this.filterDepartmentId,
      designationId: this.filterDesignationId,
      status: this.filterStatus,
      page: this.page,
      limit: this.limit
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.rows.forEach((row) => this.known.set(row._id, row));
      this.total = res.total || 0;
      this.summary = res.summary || this.summary;
      this.loading = false;
      this.cdr.markForCheck();
    }, () => {
      this.rows = [];
      this.loadError = "Couldn't load staff.";
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value);
  }

  onDepartmentFilter(value: string): void {
    this.filterDepartmentId = value;
    // A designation belongs to its department — changing the parent clears the child.
    this.filterDesignationId = '';
    this.rebuildOptions();
    this.page = 1;
    this.fetch();
  }

  onDesignationFilter(value: string): void {
    this.filterDesignationId = value;
    this.page = 1;
    this.fetch();
  }

  onStatusFilter(value: string): void {
    this.filterStatus = value;
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

  trackByRow = (_index: number, row: StaffRow): string => row._id;
  trackByLine = (_index: number, line: OutcomeLine): string => line.id;

  initials(name: string): string {
    return initialsOf(name);
  }

  gradient(seed: string): string {
    return avatarGradient(seed);
  }

  // --- selection ------------------------------------------------------------------------

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  toggleRow(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row._id));
  }

  toggleAll(): void {
    const selectAll = !this.allSelected;
    this.rows.forEach((row) => {
      if (selectAll) this.selected.add(row._id);
      else this.selected.delete(row._id);
    });
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  // --- add / edit ---------------------------------------------------------------------

  onCreate(): void {
    this.openForm('Create Staff', { ...EMPTY_FORM });
  }

  onEdit(row: StaffRow): void {
    this.openForm('Edit Staff', {
      id: row._id,
      name: row.name,
      empCode: row.empCode || '',
      departmentId: row.departmentId || '',
      designationId: row.designationId || '',
      joiningDate: row.joiningDate ? row.joiningDate.slice(0, 10) : '',
      status: row.status,
      isOwner: row.isOwner
    });
  }

  private openForm(title: string, form: StaffForm): void {
    this.formTitle = title;
    this.form = form;
    this.rebuildOptions();
    this.fieldErrors = {};
    this.formError = '';
    this.saving = false;
    this.formOpen = true;
  }

  onFieldChange(field: 'name' | 'empCode' | 'joiningDate', value: string): void {
    this.form = { ...this.form, [field]: value };
    delete this.fieldErrors[field];
  }

  onFormDepartmentChange(value: string): void {
    // Picking a different department clears a designation that belonged to the old one.
    this.form = { ...this.form, departmentId: value, designationId: '' };
    delete this.fieldErrors['departmentId'];
    delete this.fieldErrors['designationId'];
    this.rebuildOptions();
  }

  onFormDesignationChange(value: string): void {
    this.form = { ...this.form, designationId: value };
    delete this.fieldErrors['designationId'];
  }

  onFormStatusChange(value: string): void {
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
    // DESIGNATION_REQUIRES_DEPARTMENT — the backend checks too; this just says it sooner.
    if (this.form.designationId && !this.form.departmentId) {
      this.fieldErrors = { designationId: 'Pick a department before choosing a designation.' };
      return;
    }
    this.saving = true;
    this.fieldErrors = {};
    this.formError = '';

    const payload: StaffPayload = {
      adminId: this.adminId,
      name: this.form.name.trim(),
      empCode: this.form.empCode.trim() || null,
      departmentId: this.form.departmentId || null,
      designationId: this.form.designationId || null,
      joiningDate: this.form.joiningDate || null,
      status: this.form.status
    };
    const request = this.form.id ? this.api.updateStaff(this.form.id, payload) : this.api.createStaff(payload);

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

  // --- assign card ----------------------------------------------------------------------

  onAssignCard(row: StaffRow): void {
    this.openCardModal([row]);
  }

  onAssignCardSelected(): void {
    const targets = Array.from(this.selected).map((id) => this.known.get(id)).filter((row): row is StaffRow => !!row);
    if (targets.length) this.openCardModal(targets);
  }

  private openCardModal(targets: StaffRow[]): void {
    this.cardTargets = targets;
    this.cardNumbers = {};
    this.cardRowErrors = {};
    this.cardError = '';
    this.cardSaving = false;
    const first = targets[0];
    this.cardVerifyMode = String(targets.length === 1 && first.card ? first.verifyMode : STAFF_VERIFY_MODES.CARD_ONLY);
    this.cardOpen = true;
  }

  get cardTitle(): string {
    if (this.cardTargets.length !== 1) return 'Assign Card to ' + this.cardTargets.length + ' Staff';
    return this.cardTargets[0].card ? 'Change Card' : 'Assign Card';
  }

  onCardNumberChange(staffId: string, value: string): void {
    this.cardNumbers = { ...this.cardNumbers, [staffId]: value.trim() };
    delete this.cardRowErrors[staffId];
  }

  onVerifyModeChange(value: string): void {
    this.cardVerifyMode = value;
  }

  /** The same card typed twice in this one list — rejected before submit. */
  private inFormDuplicates(): Record<string, string> {
    const owner = new Map<string, StaffRow>();
    const errors: Record<string, string> = {};
    this.cardTargets.forEach((row) => {
      const card = this.cardNumbers[row._id];
      if (!card) return;
      const first = owner.get(card);
      if (first) errors[row._id] = 'Card ' + card + ' is already entered for ' + first.name + ' above.';
      else owner.set(card, row);
    });
    return errors;
  }

  cardRowError(staffId: string): string {
    return this.cardRowErrors[staffId] || this.inFormDuplicates()[staffId] || '';
  }

  get cardSubmitDisabled(): boolean {
    return this.cardSaving
      || this.cardTargets.some((row) => !/^\d{1,10}$/.test(this.cardNumbers[row._id] || ''))
      || Object.keys(this.inFormDuplicates()).length > 0;
  }

  onCardCancel(): void {
    this.cardOpen = false;
  }

  /** Saves the cards, then waits for the device sync before claiming success. */
  onCardSubmit(): void {
    if (this.cardSubmitDisabled) return;
    this.cardSaving = true;
    this.cardError = '';
    this.cardRowErrors = {};

    this.api.assignCards({
      adminId: this.adminId,
      verifyMode: Number(this.cardVerifyMode),
      items: this.cardTargets.map((row) => ({ staffId: row._id, cardNumber: this.cardNumbers[row._id] }))
    }).pipe(takeUntil(this.destroyed$)).subscribe((queued) => {
      const refused = this.errorsByRow(queued.rows);
      this.cardRowErrors = refused;
      this.fetch();
      this.jobs.watch<StaffDeviceSyncResult>('staff', this.adminId, queued.jobId)
        .pipe(takeUntil(this.destroyed$))
        .subscribe((status) => {
          if (status.state === 'completed') {
            this.cardSaving = false;
            (status.result?.failed || []).forEach((item) => {
              refused[item.personId] = refused[item.personId] || DEVICE_UNREACHABLE;
            });
            this.cardRowErrors = { ...refused };
            if (Object.keys(refused).length) {
              this.cardError = queued.assigned + ' of ' + this.cardTargets.length + ' assigned — see the rows marked below.';
            } else {
              this.cardOpen = false;
              this.snackBar.open(queued.message, 'Close', { duration: 3000 });
            }
          } else if (status.state === 'failed') {
            this.cardSaving = false;
            this.cardError = "Cards were saved, but the device sync didn't finish. It will retry when the device is back online.";
          }
          this.cdr.markForCheck();
        }, () => {
          this.cardSaving = false;
          this.cdr.markForCheck();
        });
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.cardSaving = false;
      this.cardRowErrors = this.errorsByRow(rowErrorsOf(error) as StaffRowOutcome[]);
      this.cardError = Object.keys(this.cardRowErrors).length
        ? 'None of the cards could be assigned — see the rows marked below.'
        : (validationErrorsOf(error)?.message || errorMessageOf(error, ''));
      if (!this.cardError && validationErrorsOf(error)?.fields['cardNumber'] && this.cardTargets.length === 1) {
        this.cardRowErrors = { [this.cardTargets[0]._id]: validationErrorsOf(error)!.fields['cardNumber'] };
      }
      this.cdr.markForCheck();
    });
  }

  private errorsByRow(rows: StaffRowOutcome[] | undefined): Record<string, string> {
    const errors: Record<string, string> = {};
    (rows || []).forEach((row) => {
      if (row.staffId) errors[row.staffId] = row.message || 'Could not be assigned.';
    });
    return errors;
  }

  /** Remove Card — needed before a staff member with a device mapping can be removed. */
  onRemoveCard(): void {
    const target = this.cardTargets[0];
    if (!target || this.cardSaving) return;
    this.cardSaving = true;
    this.api.removeCard(this.adminId, target._id).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.cardSaving = false;
      this.cardOpen = false;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
      this.cdr.markForCheck();
    }, () => {
      this.cardSaving = false;
      this.cdr.markForCheck();
    });
  }

  // --- delete (soft terminate + access revocation) --------------------------------------

  onDelete(row: StaffRow): void {
    this.openDeleteConfirm([row._id]);
  }

  onDeleteSelected(): void {
    if (this.selected.size) this.openDeleteConfirm(Array.from(this.selected));
  }

  private openDeleteConfirm(ids: string[]): void {
    this.deleteIds = ids;
    const name = ids.length === 1 ? (this.known.get(ids[0])?.name || 'this staff member') : '';
    this.confirmConfig = {
      title: ids.length === 1 ? 'Delete Staff' : 'Delete ' + ids.length + ' Staff',
      message: (ids.length === 1 ? 'Delete ' + name + '? ' : '')
        + 'This also removes their attendance history, leave records, and salary assignment from active lists. This can\'t be undone.',
      // Login/role access revocation is its own, separately stated consequence (errors.md).
      scopeNote: 'Login and role access will be revoked for ' + (ids.length === 1 ? 'this person.' : 'all ' + ids.length + ' people.'),
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE'
    };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const ids = this.deleteIds;
    this.deleteIds = [];
    if (!ids.length || this.deleting) return;
    this.deleting = true;

    this.api.bulkDelete(this.adminId, ids).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.deleting = false;
      const lines: OutcomeLine[] = [];
      res.results.forEach((result) => {
        if (result.status === 'deleted') {
          this.selected.delete(result.id);
          this.known.delete(result.id);
        } else {
          lines.push({ id: result.id, label: this.known.get(result.id)?.name || 'Staff member', message: result.message || 'Not removed.' });
        }
      });
      if (lines.length) {
        this.resultSummary = res.message;
        this.resultLines = lines;
        this.resultOpen = true;
      } else {
        this.snackBar.open(res.deletedCount === 1
          ? 'Staff member removed. Their login and role access have been revoked.'
          : res.deletedCount + ' staff removed. Their login and role access have been revoked.', 'Close', { duration: 4000 });
      }
      this.fetch();
      this.cdr.markForCheck();
    }, () => {
      this.deleting = false;
      this.cdr.markForCheck();
    });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteIds = [];
  }

  closeResult(): void {
    this.resultOpen = false;
  }
}
