/**
 * Roster — which shift each staff member works on each day, and which shift each class
 * follows. What Overview reads as the expected shift per person per day.
 *
 * Reference: docs/schoolzen-planning/v1/attendance/roster.html
 *
 * THIS page's toolbar: row1 search + Assign/Edit/Delete Selected; row2 a plain FLEX row of
 * three fixed-width `.dd`s (Person Type → Department/Class → Designation/Section); row3 the
 * month navigator. Not Overview's 6-column grid.
 *
 * Past days are locked (attendance may already be recorded); every write is today onward.
 * Delete Selected needs typed DELETE.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { RosterService } from 'src/app/shared/services/attendance/roster.service';
import { ShiftsService } from 'src/app/shared/services/attendance/shifts.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { Shift } from 'src/app/shared/models/attendance/shift.model';
import {
  BulkWriteResponse, ClassShiftRow, MonthColumn, RosterLegend, RosterStats, RowFailure, StaffRosterRow, WEEK_OFF
} from 'src/app/shared/models/attendance/roster.model';
import { FilterClass } from 'src/app/shared/models/student/student.model';
import { rowErrorsOf } from 'src/app/shared/utils/api-error.util';
import {
  currentMonthKey, formatTime, monthCalendar, monthLabel, shiftMonth
} from 'src/app/shared/utils/attendance-time.util';

type PersonType = 'staff' | 'student';

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }
];
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5, 6];

const localDateKey = (date = new Date()): string =>
  date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');

@Component({
  selector: 'app-roster',
  templateUrl: './roster.component.html',
  styleUrls: ['./roster.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RosterComponent implements OnInit, OnDestroy {
  @ViewChild('gridScroll') gridScroll?: ElementRef<HTMLElement>;

  adminId = '';
  session = '';
  today = localDateKey();
  month = currentMonthKey();
  search = '';

  // --- filters (row2) ------------------------------------------------------------------
  personType: PersonType = 'staff';
  departmentId = '';
  designationId = '';
  classId = '';
  sectionKey = '';
  readonly personTypeOptions: readonly DdOption[] = [
    { value: 'staff', label: 'Staff' },
    { value: 'student', label: 'Student' }
  ];
  departmentOptions: DdOption[] = [{ value: '', label: 'All departments' }];
  private designations: { _id: string; title: string; departmentId: string | null }[] = [];
  classes: FilterClass[] = [];
  lookupError = '';

  // --- data ----------------------------------------------------------------------------
  loading = true;
  loadError = '';
  days: MonthColumn[] = [];
  staffRows: StaffRosterRow[] = [];
  classRows: ClassShiftRow[] = [];
  legend: RosterLegend = { shifts: [], weekOff: false };
  stats: RosterStats = { byShift: [], unassigned: 0 };
  truncated = false;
  shifts: Shift[] = [];
  private shiftById = new Map<string, Shift>();
  private legendIndex = new Map<string, number>();

  selected = new Set<string>();

  // --- assign / edit modal -------------------------------------------------------------
  assignOpen = false;
  assignTitle = 'Assign to Selected';
  assignShiftId = '';
  assignMonth = currentMonthKey();
  assignWeekdays = new Set<number>(DEFAULT_WEEKDAYS);
  assignCalendarOpen = false;
  /** The rows this modal writes to — the selection, or the single row a pencil opened. */
  private assignTargets: string[] = [];
  saving = false;
  readonly weekdays = WEEKDAYS;

  // --- delete --------------------------------------------------------------------------
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  deleting = false;

  /** BULK_ROWS_FAILED results, listed per row rather than folded into a toast. */
  failures: { name: string; message: string }[] = [];

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();
  private scrolledToToday = false;

  constructor(
    private api: RosterService,
    private shiftsApi: ShiftsService,
    private departmentsApi: DepartmentsService,
    private designationsApi: DesignationsService,
    private studentOptions: StudentOptionsService,
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
    this.search$.pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      if (this.personType === 'staff') this.fetch();
      else this.cdr.markForCheck();
    });
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      if (this.personType === 'student') this.fetch();
    });
    this.fetch();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- lookups -------------------------------------------------------------------------

  loadLookups(): void {
    this.lookupError = '';
    forkJoin({
      shifts: this.shiftsApi.getOptions(this.adminId),
      departments: this.departmentsApi.getOptions(this.adminId).pipe(catchError(() => of({ rows: [] }))),
      designations: this.designationsApi.getOptions(this.adminId).pipe(catchError(() => of({ rows: [] }))),
      classes: this.studentOptions.getFilterOptions(this.adminId).pipe(catchError(() => of({ classes: [], groups: [] })))
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.shifts = res.shifts.rows || [];
      this.shiftById = new Map(this.shifts.map((shift) => [shift._id, shift]));
      this.departmentOptions = [{ value: '', label: 'All departments' },
        ...(res.departments.rows || []).map((row: { _id: string; name: string }) => ({ value: row._id, label: row.name }))];
      this.designations = (res.designations.rows || []) as { _id: string; title: string; departmentId: string | null }[];
      this.classes = res.classes.classes || [];
      this.cdr.markForCheck();
    }, () => {
      this.lookupError = "Couldn't load shifts and filters.";
      this.cdr.markForCheck();
    });
  }

  get designationOptions(): DdOption[] {
    return [{ value: '', label: 'All designations' },
      ...this.designations.filter((row) => row.departmentId === this.departmentId).map((row) => ({ value: row._id, label: row.title }))];
  }

  get classOptions(): DdOption[] {
    return [{ value: '', label: 'All classes' }, ...this.classes.map((row) => ({ value: row._id, label: row.label }))];
  }

  /** Sections of the chosen class — its own, or every stream's, keyed so the filter can match a row. */
  get sectionOptions(): DdOption[] {
    const cls = this.classes.find((row) => row._id === this.classId);
    const options: DdOption[] = [{ value: '', label: 'All sections' }];
    if (!cls) return options;
    cls.sections.forEach((section) => options.push({ value: '|' + section._id, label: 'Section ' + section.name }));
    cls.streams.forEach((stream) => {
      const streamName = stream.name.charAt(0).toUpperCase() + stream.name.slice(1);
      options.push({ value: stream._id + '|', label: streamName });
      stream.sections.forEach((section) => options.push({ value: stream._id + '|' + section._id, label: streamName + ' · ' + section.name }));
    });
    return options;
  }

  /** Second pill: Department for staff, Class for students. */
  get secondOptions(): DdOption[] { return this.personType === 'staff' ? this.departmentOptions : this.classOptions; }
  get secondValue(): string { return this.personType === 'staff' ? this.departmentId : this.classId; }
  /** Third pill: Designation (needs a department) or Section (needs a class). */
  get thirdOptions(): DdOption[] { return this.personType === 'staff' ? this.designationOptions : this.sectionOptions; }
  get thirdValue(): string { return this.personType === 'staff' ? this.designationId : this.sectionKey; }
  get thirdDisabled(): boolean { return this.personType === 'staff' ? !this.departmentId : !this.classId || this.sectionOptions.length < 2; }
  get thirdHint(): string { return this.personType === 'staff' ? 'Select a department first' : 'Select a class first'; }

  onPersonTypeChange(value: string): void {
    const next: PersonType = value === 'student' ? 'student' : 'staff';
    if (next === this.personType) return;
    this.personType = next;
    this.departmentId = '';
    this.designationId = '';
    this.classId = '';
    this.sectionKey = '';
    this.selected.clear();
    this.failures = [];
    this.fetch();
  }

  onSecondChange(value: string): void {
    if (this.personType === 'staff') {
      this.departmentId = value;
      this.designationId = '';
      this.selected.clear();
      this.fetch();
    } else {
      this.classId = value;
      this.sectionKey = '';
      this.selected.clear();
    }
    this.cdr.markForCheck();
  }

  onThirdChange(value: string): void {
    if (this.personType === 'staff') {
      this.designationId = value;
      this.selected.clear();
      this.fetch();
    } else {
      this.sectionKey = value;
      this.selected.clear();
    }
    this.cdr.markForCheck();
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onMonthChange(month: string): void {
    this.month = month;
    this.selected.clear();
    this.scrolledToToday = false;
    if (this.personType === 'staff') this.fetch();
    this.cdr.markForCheck();
  }

  // --- data ----------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    if (this.personType === 'staff') {
      this.api.getStaffRoster(this.adminId, {
        month: this.month, departmentId: this.departmentId, designationId: this.designationId, search: this.search
      }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.days = res.days || [];
        this.staffRows = res.rows || [];
        this.truncated = res.truncated;
        this.setLegend(res.legend);
        this.stats = res.stats;
        this.pruneSelection(this.staffRows.map((row) => row._id));
        this.loading = false;
        this.cdr.markForCheck();
        this.scrollToToday();
      }, () => this.failLoad());
      return;
    }
    if (!this.session) {
      this.loading = false;
      return;
    }
    this.api.getClassShifts(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.classRows = res.rows || [];
      this.setLegend(res.legend);
      this.stats = res.stats;
      this.pruneSelection(this.classRows.filter((row) => row.selectable).map((row) => row.key));
      this.loading = false;
      this.cdr.markForCheck();
    }, () => this.failLoad());
  }

  private failLoad(): void {
    this.loadError = "Couldn't load the roster.";
    this.loading = false;
    this.cdr.markForCheck();
  }

  private setLegend(legend: RosterLegend): void {
    this.legend = legend || { shifts: [], weekOff: false };
    this.legendIndex = new Map(this.legend.shifts.map((shift, index) => [shift._id, index % 4]));
    this.legend.shifts.forEach((shift) => { if (!this.shiftById.has(shift._id)) this.shiftById.set(shift._id, shift); });
  }

  private pruneSelection(validKeys: string[]): void {
    const valid = new Set(validKeys);
    this.selected.forEach((key) => { if (!valid.has(key)) this.selected.delete(key); });
  }

  private scrollToToday(): void {
    if (this.scrolledToToday) return;
    setTimeout(() => {
      const cell = this.gridScroll?.nativeElement.querySelector('th.today-col') as HTMLElement | null;
      if (cell && this.gridScroll) {
        const host = this.gridScroll.nativeElement;
        host.scrollLeft = Math.max(0, cell.offsetLeft - host.clientWidth / 2);
        this.scrolledToToday = true;
      }
    });
  }

  /** Students: the hierarchy narrowed by the Class/Section pills and the search box. */
  get visibleClassRows(): ClassShiftRow[] {
    const term = this.search.toLowerCase();
    return this.classRows.filter((row) => {
      if (this.classId && row.classId !== this.classId) return false;
      // Headings stay so the narrowed rows keep their Class → Stream context.
      if (this.sectionKey && row.level > 0) {
        const [streamId, sectionId] = this.sectionKey.split('|');
        if (streamId && row.streamId !== streamId) return false;
        if (sectionId && row.sectionId && row.sectionId !== sectionId) return false;
        if (sectionId && !row.sectionId && !streamId) return false;
      }
      if (term) {
        const cls = this.classRows.find((candidate) => candidate.level === 0 && candidate.classId === row.classId);
        return (cls?.label || '').toLowerCase().includes(term) || row.label.toLowerCase().includes(term);
      }
      return true;
    });
  }

  // --- cells ---------------------------------------------------------------------------

  isLocked(col: MonthColumn): boolean {
    return col.dateKey < this.today;
  }

  cellShift(row: StaffRosterRow, col: MonthColumn): Shift | null {
    const value = row.days[col.dateKey];
    return value && value !== WEEK_OFF ? this.shiftById.get(value) || null : null;
  }

  isWeekOff(row: StaffRosterRow, col: MonthColumn): boolean {
    return row.days[col.dateKey] === WEEK_OFF;
  }

  chipClass(shiftId: string): string {
    return 'c' + (this.legendIndex.get(shiftId) ?? 0);
  }

  shiftTime(shift: Shift | null | undefined): string {
    return shift ? formatTime(shift.startTime) + '–' + formatTime(shift.endTime) : '';
  }

  shiftOf(id: string | null): Shift | null {
    return id ? this.shiftById.get(id) || null : null;
  }

  // --- selection -----------------------------------------------------------------------

  private hasAssignment(key: string): boolean {
    if (this.personType === 'staff') {
      const row = this.staffRows.find((candidate) => candidate._id === key);
      return !!row && Object.values(row.days).some((value) => value && value !== WEEK_OFF);
    }
    const row = this.classRows.find((candidate) => candidate.key === key);
    return !!row?.shiftId;
  }

  get selectableKeys(): string[] {
    return this.personType === 'staff'
      ? this.staffRows.map((row) => row._id)
      : this.visibleClassRows.filter((row) => row.selectable).map((row) => row.key);
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

  private get selectionCounts(): { total: number; assigned: number } {
    const keys = [...this.selected];
    return { total: keys.length, assigned: keys.filter((key) => this.hasAssignment(key)).length };
  }

  /** Mixed = some selected rows already have a roster and some don't (reference's sel-warning). */
  get mixedSelection(): boolean {
    const { total, assigned } = this.selectionCounts;
    return total > 0 && assigned > 0 && assigned < total;
  }

  get assignDisabled(): boolean {
    const { total, assigned } = this.selectionCounts;
    return total === 0 || assigned > 0 || this.monthLocked;
  }

  get editDisabled(): boolean {
    const { total, assigned } = this.selectionCounts;
    return total === 0 || assigned < total || this.monthLocked;
  }

  get deleteDisabled(): boolean {
    return this.selectionCounts.assigned === 0 || this.deleting || this.monthLocked;
  }

  /** A past month is read-only (staff view only; class shifts are session-wide). */
  get monthLocked(): boolean {
    return this.personType === 'staff' && this.month < this.today.slice(0, 7);
  }

  // --- assign / edit -------------------------------------------------------------------

  get shiftOptions(): DdOption[] {
    return [{ value: '', label: '— Select —' }, ...this.shifts
      .filter((shift) => shift.status === 'active')
      .map((shift) => ({ value: shift._id, label: shift.name + ' · ' + formatTime(shift.startTime).replace(/ (AM|PM)/, '') + '–' + formatTime(shift.endTime).replace(/ (AM|PM)/, '') }))];
  }

  openAssign(): void {
    this.openAssignFor([...this.selected], 'Assign to Selected', false);
  }

  openEdit(): void {
    this.openAssignFor([...this.selected], 'Edit Assignment', true);
  }

  /** The pencil on an editable cell / the Change column: edit that one row. */
  openRow(key: string): void {
    this.openAssignFor([key], this.hasAssignment(key) ? 'Edit Assignment' : 'Assign Shift', this.hasAssignment(key));
  }

  private openAssignFor(keys: string[], title: string, prefill: boolean): void {
    if (!keys.length) return;
    this.assignTargets = keys;
    this.assignTitle = title;
    this.assignShiftId = '';
    this.assignWeekdays = new Set(DEFAULT_WEEKDAYS);
    this.assignMonth = this.month < this.today.slice(0, 7) ? this.today.slice(0, 7) : this.month;
    this.assignCalendarOpen = false;
    if (prefill) this.prefill(keys);
    this.saving = false;
    this.assignOpen = true;
  }

  /** Editing never starts blank: the first selected row's shift and its working weekdays. */
  private prefill(keys: string[]): void {
    if (this.personType === 'student') {
      const row = this.classRows.find((candidate) => candidate.key === keys[0]);
      this.assignShiftId = row?.shiftId || '';
      return;
    }
    const row = this.staffRows.find((candidate) => keys.includes(candidate._id) && Object.values(candidate.days).some((value) => value !== WEEK_OFF));
    if (!row) return;
    const working = new Set<number>();
    let shiftId = '';
    Object.entries(row.days).forEach(([dateKey, value]) => {
      if (value === WEEK_OFF) return;
      shiftId = shiftId || value;
      working.add(new Date(dateKey + 'T00:00:00').getDay());
    });
    this.assignShiftId = this.shiftById.get(shiftId)?.status === 'active' ? shiftId : '';
    if (working.size) this.assignWeekdays = working;
  }

  onAssignShift(value: string): void {
    this.assignShiftId = value;
  }

  toggleWeekday(day: number): void {
    const next = new Set(this.assignWeekdays);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    this.assignWeekdays = next;
  }

  get assignMonthLabel(): string { return monthLabel(this.assignMonth); }
  get assignIsCurrentMonth(): boolean { return this.assignMonth === this.today.slice(0, 7); }
  get assignMonthHint(): string {
    return this.assignIsCurrentMonth
      ? 'This is the current month — some days already have attendance recorded, so only today and later can be reassigned.'
      : 'Future month — the whole month is open to assign.';
  }

  assignMonthStep(delta: number): void {
    const next = shiftMonth(this.assignMonth, delta);
    if (next < this.today.slice(0, 7)) return;
    this.assignMonth = next;
  }

  get assignCalendar(): { day: number | null; cls: string }[] {
    const cells = monthCalendar(this.assignMonth);
    const last = cells[cells.length - 1];
    return cells.map((day, index) => {
      if (day === null) return { day, cls: 'range-day' };
      const dow = index % 7;
      const classes = ['range-day', 'in-range'];
      if (dow === 0 || day === 1) classes.push('band-l');
      if (dow === 6 || day === last) classes.push('band-r');
      if (day === 1 || day === last) classes.push('chain-endpoint');
      if (this.today === this.assignMonth + '-' + String(day).padStart(2, '0')) classes.push('today');
      return { day, cls: classes.join(' ') };
    });
  }

  get assignSubmitDisabled(): boolean {
    return this.saving || !this.assignShiftId || (this.personType === 'staff' && this.assignWeekdays.size === 0);
  }

  onAssignCancel(): void {
    this.assignOpen = false;
    this.saving = false;
  }

  onAssignSubmit(): void {
    if (this.assignSubmitDisabled) return;
    this.saving = true;
    this.failures = [];
    const request = this.personType === 'staff'
      ? this.api.assignStaff({
        adminId: this.adminId, staffIds: this.assignTargets, shiftId: this.assignShiftId,
        month: this.assignMonth, weekdays: [...this.assignWeekdays]
      })
      : this.api.assignClasses({
        adminId: this.adminId, session: this.session, targets: this.targetsOf(this.assignTargets), shiftId: this.assignShiftId
      });
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.assignOpen = false;
      this.afterBulk(res, this.assignTargets);
    }, (error: unknown) => {
      this.saving = false;
      this.showFailures(rowErrorsOf(error) as RowFailure[], this.assignTargets);
      this.cdr.markForCheck();
    });
  }

  private targetsOf(keys: string[]): { classId: string; streamId: string | null; sectionId: string | null }[] {
    return keys
      .map((key) => this.classRows.find((row) => row.key === key))
      .filter((row): row is ClassShiftRow => !!row)
      .map((row) => ({ classId: row.classId, streamId: row.streamId, sectionId: row.sectionId }));
  }

  // --- delete --------------------------------------------------------------------------

  onDeleteSelected(): void {
    const count = this.selectionCounts.assigned;
    this.confirmConfig = {
      title: 'Delete Roster Entries',
      message: 'This will permanently remove the shift assignment for the selected rows' +
        (this.personType === 'staff' ? ' from today to the end of ' + monthLabel(this.month) : '') +
        '. Attendance already recorded is not affected, but nothing will decide the expected shift going forward until reassigned. This cannot be undone.',
      scopeNote: count + ' selected ' + (this.personType === 'staff' ? (count === 1 ? 'person' : 'people') : (count === 1 ? 'class' : 'classes')) + ' with an assignment.',
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE'
    };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    if (this.deleting) return;
    const keys = [...this.selected].filter((key) => this.hasAssignment(key));
    if (!keys.length) return;
    this.deleting = true;
    this.failures = [];
    const request = this.personType === 'staff'
      ? this.api.clearStaff({ adminId: this.adminId, staffIds: keys, month: this.month, confirmed: true })
      : this.api.clearClasses({ adminId: this.adminId, session: this.session, targets: this.targetsOf(keys), confirmed: true });
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.deleting = false;
      this.afterBulk(res, keys);
    }, (error: unknown) => {
      this.deleting = false;
      this.showFailures(rowErrorsOf(error) as RowFailure[], keys);
      this.cdr.markForCheck();
    });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
  }

  private afterBulk(res: BulkWriteResponse, keys: string[]): void {
    this.selected.clear();
    this.showFailures(res.failed || [], keys);
    this.snackBar.open(res.warning ? res.message + ' ' + res.warning.message : res.message, 'Close', { duration: res.warning ? 6000 : 3000 });
    this.fetch();
  }

  /** Name each failed row (the server reports positions in the list it was sent). */
  private showFailures(rows: RowFailure[], keys: string[]): void {
    this.failures = rows.map((row) => {
      const key = keys[row.row];
      const name = this.personType === 'staff'
        ? this.staffRows.find((candidate) => candidate._id === key)?.name
        : this.classRows.find((candidate) => candidate.key === key)?.label;
      return { name: name || 'Row ' + (row.row + 1), message: row.message };
    });
  }

  dismissFailures(): void {
    this.failures = [];
  }

  trackByKey = (_index: number, row: { key: string }): string => row.key;
  trackById = (_index: number, row: { _id: string }): string => row._id;
  trackByDate = (_index: number, col: MonthColumn): string => col.dateKey;
  trackByIndex = (index: number): number => index;
}
