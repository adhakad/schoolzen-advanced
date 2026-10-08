/**
 * Leave Assign — each person's yearly leave allowance, per leave type.
 *
 * Reference: docs/schoolzen-planning/v1/leave/leave-assign.html
 *
 * Same toolbar shape as Leave Requests (shared Person Type filter) plus Set Leave Limit.
 * The table has ONE COLUMN PER ACTIVE LEAVE TYPE, built from the API's `leaveTypes` —
 * never a fixed column set.
 *   Staff:    one row per person; bulk assign only fills what isn't set yet.
 *   Students: one row per class/stream/section ("assigned by class"); saving fans out to
 *             every enrolled student. A class row expands to its students, where one
 *             student's limit can be overridden. Re-assigning a class never overwrites an
 *             override unless the admin confirms it.
 *
 * Everything here needs the 'leave-limit' permission (enforced by the API); without the
 * edit grant (`canAssign`) the assign controls are hidden.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ConfirmConfig } from 'src/app/shared/models/shared-components.model';
import { LeaveAssignService } from 'src/app/shared/services/leave/leave-assign.service';
import { LeaveFilterOptionsService } from 'src/app/shared/services/leave/leave-filter-options.service';
import { LeaveType } from 'src/app/shared/models/leave/leave-type.model';
import {
  AssignItem, ClassGridRow, ClassStudentRow, ClassTargetRef, StaffGridRow
} from 'src/app/shared/models/leave/leave-limit.model';
import {
  EMPTY_FILTER_OPTIONS, EMPTY_PERSON_FILTER, PersonFilterOptions, PersonFilterValue
} from 'src/app/shared/models/leave/person-filter.model';
import { toApiError, validationErrorsOf } from 'src/app/shared/utils/api-error.util';

interface AssignChoice {
  type: LeaveType;
  checked: boolean;
  days: string;
}

interface SingleEdit {
  title: string;
  personType: 'staff' | 'student';
  personId: string;
  leaveTypeId: string;
  days: string;
  used: number;
}

const validDays = (value: string): boolean => {
  const days = Number(value);
  return String(value).trim() !== '' && Number.isInteger(days) && days >= 0 && days <= 366;
};

@Component({
  selector: 'app-leave-assign',
  templateUrl: './leave-assign.component.html',
  styleUrls: ['./leave-assign.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaveAssignComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';

  filter: PersonFilterValue = { ...EMPTY_PERSON_FILTER };
  filterOptions: PersonFilterOptions = EMPTY_FILTER_OPTIONS;
  lookupError = '';
  search = '';

  loading = true;
  loadError = '';
  canAssign = false;
  /** The dynamic columns — whatever active types the API returned. */
  leaveTypes: LeaveType[] = [];

  // staff mode
  staffRows: StaffGridRow[] = [];
  total = 0;
  page = 1;
  limit = 25;
  staffSummary = { people: 0, fullySet: 0, types: 0 };

  // student mode
  classRows: ClassGridRow[] = [];
  classSummary = { classes: 0, fullySet: 0, types: 0 };
  expandedKey = '';
  expandedStudents: ClassStudentRow[] = [];
  expandedLoading = false;

  /** Staff ids, or class row keys in student mode. */
  selected = new Set<string>();

  // bulk modal
  assignOpen = false;
  saving = false;
  assignError = '';
  choices: AssignChoice[] = [];
  private assignTargets: ClassTargetRef[] = [];
  private assignPersonIds: string[] = [];

  // overwrite-overrides confirm
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: '' };

  // single cell edit
  editOpen = false;
  edit: SingleEdit | null = null;
  editError = '';

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: LeaveAssignService,
    private filterOptionsApi: LeaveFilterOptionsService,
    private shellContext: ShellContextService,
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
    this.loadLookups();
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.page = 1;
      this.fetch();
    });
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      this.fetch();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadLookups(): void {
    this.lookupError = '';
    this.filterOptionsApi.load(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.filterOptions = res.options;
      if (!res.complete) this.lookupError = "Couldn't load every filter.";
      this.cdr.markForCheck();
    });
  }

  get isStaff(): boolean {
    return this.filter.personType === 'staff';
  }

  onFilterChange(value: PersonFilterValue): void {
    const modeChanged = value.personType !== this.filter.personType;
    this.filter = value;
    this.page = 1;
    this.selected.clear();
    if (modeChanged) {
      this.leaveTypes = [];
      this.expandedKey = '';
    }
    this.fetch();
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

  // --- grid ----------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    const fail = (error: unknown) => {
      this.loading = false;
      this.staffRows = [];
      this.classRows = [];
      this.loadError = toApiError(error)?.category === 'PermissionError'
        ? "You don't have permission to view leave limits."
        : "Couldn't load leave limits.";
      this.cdr.markForCheck();
    };
    if (this.isStaff) {
      this.api.getStaffGrid(this.adminId, {
        session: this.session,
        departmentId: this.filter.departmentId,
        designationId: this.filter.designationId,
        search: this.search,
        page: this.page,
        limit: this.limit
      }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.leaveTypes = res.leaveTypes || [];
        this.staffRows = res.rows || [];
        this.total = res.total || 0;
        this.staffSummary = res.summary;
        this.canAssign = res.canAssign;
        this.loading = false;
        this.cdr.markForCheck();
      }, fail);
      return;
    }
    this.api.getClassGrid(this.adminId, {
      session: this.session,
      classId: this.filter.classId,
      streamId: this.filter.streamId,
      sectionId: this.filter.sectionId
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.leaveTypes = res.leaveTypes || [];
      this.classRows = res.rows || [];
      this.classSummary = res.summary;
      this.canAssign = res.canAssign;
      this.loading = false;
      if (this.expandedKey) this.loadStudents(this.expandedKey);
      this.cdr.markForCheck();
    }, fail);
  }

  trackByType = (_index: number, type: LeaveType): string => type._id;
  trackByStaff = (_index: number, row: StaffGridRow): string => row._id;
  trackByClass = (_index: number, row: ClassGridRow): string => row.key;
  trackByStudent = (_index: number, row: ClassStudentRow): string => row._id;

  // --- selection -----------------------------------------------------------------------

  private get selectableKeys(): string[] {
    return this.isStaff ? this.staffRows.map((row) => row._id) : this.classRows.filter((row) => row.selectable).map((row) => row.key);
  }

  get allSelected(): boolean {
    const keys = this.selectableKeys;
    return keys.length > 0 && keys.every((key) => this.selected.has(key));
  }

  toggleAll(): void {
    const keys = this.selectableKeys;
    if (this.allSelected) keys.forEach((key) => this.selected.delete(key));
    else keys.forEach((key) => this.selected.add(key));
  }

  toggleRow(key: string): void {
    if (this.selected.has(key)) this.selected.delete(key);
    else this.selected.add(key);
  }

  // --- student rows: expand ------------------------------------------------------------

  toggleExpand(row: ClassGridRow): void {
    if (!row.selectable) return;
    if (this.expandedKey === row.key) {
      this.expandedKey = '';
      this.expandedStudents = [];
      return;
    }
    this.expandedKey = row.key;
    this.loadStudents(row.key);
  }

  private loadStudents(key: string): void {
    const row = this.classRows.find((item) => item.key === key);
    if (!row) return;
    this.expandedLoading = true;
    this.api.getClassStudents(this.adminId, this.session, { classId: row.classId, streamId: row.streamId, sectionId: row.sectionId }, this.filter.groupId)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        if (this.expandedKey !== key) return;
        this.expandedStudents = res.rows || [];
        this.expandedLoading = false;
        this.cdr.markForCheck();
      }, () => {
        this.expandedStudents = [];
        this.expandedLoading = false;
        this.cdr.markForCheck();
      });
  }

  // --- bulk assign ---------------------------------------------------------------------

  get selectedCount(): number {
    return this.selected.size;
  }

  onAssignOpen(preset?: { target?: ClassTargetRef; personId?: string; leaveTypeId?: string }): void {
    if (!this.canAssign || this.assignOpen) return;
    if (preset?.target) this.assignTargets = [preset.target];
    else this.assignTargets = this.classRows.filter((row) => row.selectable && this.selected.has(row.key))
      .map((row) => ({ classId: row.classId, streamId: row.streamId, sectionId: row.sectionId }));
    this.assignPersonIds = preset?.personId ? [preset.personId] : [...this.selected];
    if (this.isStaff ? !this.assignPersonIds.length : !this.assignTargets.length) return;
    this.choices = this.leaveTypes.map((type) => ({
      type,
      checked: preset?.leaveTypeId ? type._id === preset.leaveTypeId : false,
      days: String(type.defaultDays)
    }));
    this.assignError = '';
    this.saving = false;
    this.assignOpen = true;
  }

  get assignSummary(): string {
    if (this.isStaff) return this.assignPersonIds.length + (this.assignPersonIds.length === 1 ? ' person' : ' people') + ' selected. Tick each leave they should be allowed to take.';
    return this.assignTargets.length + (this.assignTargets.length === 1 ? ' class' : ' classes') + ' selected. Every student in them gets these limits.';
  }

  onChoiceToggle(choice: AssignChoice): void {
    choice.checked = !choice.checked;
  }

  onChoiceDays(choice: AssignChoice, value: string): void {
    choice.days = value;
  }

  get assignDisabled(): boolean {
    const ticked = this.choices.filter((choice) => choice.checked);
    return this.saving || !ticked.length || ticked.some((choice) => !validDays(choice.days));
  }

  onAssignCancel(): void {
    this.assignOpen = false;
    this.saving = false;
  }

  private get assignItems(): AssignItem[] {
    return this.choices.filter((choice) => choice.checked).map((choice) => ({ leaveTypeId: choice.type._id, days: Number(choice.days) }));
  }

  onAssignSubmit(overwriteOverrides = false): void {
    if (this.assignDisabled && !overwriteOverrides) return;
    this.saving = true;
    this.assignError = '';
    const request = this.isStaff
      ? this.api.bulkAssignStaff({ adminId: this.adminId, session: this.session, personIds: this.assignPersonIds, items: this.assignItems })
      : this.api.assignClasses({
        adminId: this.adminId, session: this.session, targets: this.assignTargets, items: this.assignItems,
        overwriteOverrides, confirmed: overwriteOverrides
      });
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.assignOpen = false;
      this.selected.clear();
      this.snackBar.open(res.message, 'Close', { duration: 3500 });
      this.fetch();
    }, (error: unknown) => {
      this.saving = false;
      const apiError = toApiError(error);
      if (apiError?.code === 'LEAVE_OVERRIDES_EXIST') {
        this.confirmConfig = {
          title: 'Overwrite individual limits?',
          message: apiError.message,
          confirmLabel: 'Overwrite',
          variant: 'warning',
          scopeNote: 'Students without their own limit get the class value either way.'
        };
        this.confirmOpen = true;
      } else if (apiError?.category === 'ValidationError') {
        this.assignError = apiError.message;
      }
      this.cdr.markForCheck();
    });
  }

  onOverwriteConfirmed(): void {
    this.confirmOpen = false;
    this.onAssignSubmit(true);
  }

  onOverwriteCancelled(): void {
    this.confirmOpen = false;
  }

  // --- single cell ---------------------------------------------------------------------

  onStaffCellSet(row: StaffGridRow, type: LeaveType): void {
    if (!this.canAssign || this.editOpen) return;
    const cell = row.limits[type._id];
    this.openEdit({
      title: type.name + ' — ' + row.name,
      personType: 'staff', personId: row._id, leaveTypeId: type._id,
      days: String(cell ? cell.allocated : type.defaultDays), used: cell ? cell.used : 0
    });
  }

  onStudentCellSet(row: ClassStudentRow, type: LeaveType): void {
    if (!this.canAssign || this.editOpen) return;
    const cell = row.limits[type._id];
    this.openEdit({
      title: type.name + ' — ' + row.name,
      personType: 'student', personId: row._id, leaveTypeId: type._id,
      days: String(cell ? cell.allocated : type.defaultDays), used: cell ? cell.used : 0
    });
  }

  onClassCellSet(row: ClassGridRow, type: LeaveType): void {
    this.onAssignOpen({ target: { classId: row.classId, streamId: row.streamId, sectionId: row.sectionId }, leaveTypeId: type._id });
  }

  private openEdit(edit: SingleEdit): void {
    this.edit = edit;
    this.editError = '';
    this.saving = false;
    this.editOpen = true;
  }

  onEditDays(value: string): void {
    if (this.edit) this.edit = { ...this.edit, days: value };
    this.editError = '';
  }

  get editDisabled(): boolean {
    return this.saving || !this.edit || !validDays(this.edit.days) || Number(this.edit.days) < this.edit.used;
  }

  onEditCancel(): void {
    this.editOpen = false;
    this.edit = null;
  }

  onEditSubmit(): void {
    const edit = this.edit;
    if (!edit || this.editDisabled) return;
    this.saving = true;
    this.api.setPersonLimit({
      adminId: this.adminId, session: this.session, personType: edit.personType, personId: edit.personId,
      leaveTypeId: edit.leaveTypeId, days: Number(edit.days)
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.editOpen = false;
      this.edit = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error: unknown) => {
      this.saving = false;
      const inline = validationErrorsOf(error);
      if (inline) this.editError = inline.fields['days'] || inline.message;
      this.cdr.markForCheck();
    });
  }
}
