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
 *
 * "Has a roster" (what decides Assign vs Edit vs Delete) is judged on the EDITABLE days only
 * — today onward. Delete clears exactly those days and keeps the locked past, so a row that
 * was just deleted must read as unassigned again, or Assign would stay disabled.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { forkJoin, of, Subject, Subscription } from 'rxjs';
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
import { FilterClass, FilterGroup } from 'src/app/shared/models/student/student.model';
import { rowErrorsOf } from 'src/app/shared/utils/api-error.util';
import { DateRange } from 'src/app/shared/components/date-range-picker/date-range-picker.component';
import {
  currentMonthKey, formatTime, monthLabel
} from 'src/app/shared/utils/attendance-time.util';

type PersonType = 'staff' | 'student';

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }
];
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5, 6];

/** Last 'YYYY-MM-DD' of a 'YYYY-MM' month. */
const monthEnd = (month: string): string =>
  month + '-' + String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0');

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
  streamId = '';
  groupId = '';
  sectionId = '';
  readonly personTypeOptions: readonly DdOption[] = [
    { value: 'staff', label: 'Staff' },
    { value: 'student', label: 'Student' }
  ];
  departmentOptions: DdOption[] = [{ value: '', label: 'All departments' }];
  private designations: { _id: string; title: string; departmentId: string | null }[] = [];
  classes: FilterClass[] = [];
  private groups: FilterGroup[] = [];
  lookupError = '';
  readonly tips: readonly string[] = [
    'Tick the staff (or classes) you want, then press Assign to Selected and choose a shift.',
    'Click "Applies to" to open the calendar: click the first day, then the last day. Only today onward can be changed — past days are locked.',
    'All weekdays except Sunday are ticked. Click any day to switch it between a working day and a weekly off (WO).',
    'To change an existing roster, tick those rows and press Edit Assignment — the form opens with their current shift and days.',
    'Delete Selected removes the shift from today to the end of the month for the ticked rows; type DELETE to confirm. You can assign them again straight after.',
    'Switch Staff/Student above to set the shift for whole classes, streams or sections instead of individual people.',
    'The legend only lists shifts in use this month. A class heading with no checkbox has sections — assign at the section level.'
  ];

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
  /** The days the assignment covers (today onward; may cross months). Unticked weekdays become WO. */
  assignFrom = '';
  assignTo = '';
  assignWeekdays = new Set<number>(DEFAULT_WEEKDAYS);
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
      this.groups = res.classes.groups || [];
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

  private get selectedClass(): FilterClass | undefined {
    return this.classes.find((row) => row._id === this.classId);
  }

  get streamOptions(): DdOption[] {
    return [{ value: '', label: 'All streams' }, ...(this.selectedClass?.streams || [])
      .map((stream) => ({ value: stream._id, label: stream.name.charAt(0).toUpperCase() + stream.name.slice(1) }))];
  }

  /** Stream Groups of the chosen class(+stream) — never the automatic "General" (show-only). */
  get groupOptions(): DdOption[] {
    const cls = this.selectedClass;
    const ready = Boolean(cls) && (!cls?.hasStreams || Boolean(this.streamId));
    const groups = ready
      ? this.groups.filter((group) => !group.isSystemGroup && group.classId === cls?._id && (group.streamId || '') === this.streamId)
      : [];
    return [{ value: '', label: 'All stream groups' }, ...groups.map((group) => ({ value: group._id, label: group.name }))];
  }

  get sectionOptions(): DdOption[] {
    const cls = this.selectedClass;
    let sections = cls && !cls.hasStreams ? cls.sections : [];
    if (cls && cls.hasStreams && this.streamId) sections = cls.streams.find((stream) => stream._id === this.streamId)?.sections || [];
    return [{ value: '', label: 'All sections' }, ...sections.map((section) => ({ value: section._id, label: 'Section ' + section.name }))];
  }

  get streamDisabled(): boolean { return !this.selectedClass?.hasStreams; }
  get groupDisabled(): boolean { return this.groupOptions.length < 2; }
  get sectionDisabled(): boolean { return this.sectionOptions.length < 2; }
  get designationDisabled(): boolean { return !this.departmentId; }

  /** "General" for a class without streams, else that stream's group names — the class rows' Stream Group. */
  groupLabelOf(row: ClassShiftRow): string {
    if (row.level === 0 && row.selectable) {
      const cls = this.classes.find((candidate) => candidate._id === row.classId);
      return cls && !cls.hasStreams ? 'General' : '';
    }
    if (row.streamId && !row.sectionId) {
      return this.groups.filter((group) => !group.isSystemGroup && group.classId === row.classId && group.streamId === row.streamId)
        .map((group) => group.name).join(', ');
    }
    if (row.level === 1 && row.sectionId && !row.streamId) return 'General';
    return '';
  }

  /** The Assign modal's show-only Stream Group: "General" when every target is a General-group class. */
  get assignGroupOptions(): DdOption[] {
    const targets = this.targetsOf(this.assignTargets);
    const streamIds = new Set(targets.map((target) => target.streamId || ''));
    if (targets.length && streamIds.size === 1 && !streamIds.has('')) {
      const [target] = targets;
      const names = this.groups.filter((group) => !group.isSystemGroup && group.classId === target.classId && group.streamId === target.streamId);
      return [{ value: '', label: 'All stream groups' }, ...names.map((group) => ({ value: group._id, label: group.name }))];
    }
    return [{ value: 'general', label: 'General' }];
  }

  get assignGroupValue(): string {
    return this.assignGroupOptions[0].value;
  }

  onPersonTypeChange(value: string): void {
    const next: PersonType = value === 'student' ? 'student' : 'staff';
    if (next === this.personType) return;
    this.personType = next;
    this.departmentId = '';
    this.designationId = '';
    this.classId = '';
    this.streamId = '';
    this.groupId = '';
    this.sectionId = '';
    this.selected.clear();
    this.failures = [];
    this.fetch();
  }

  onDepartmentChange(value: string): void {
    this.departmentId = value;
    this.designationId = '';
    this.selected.clear();
    this.fetch();
  }

  onDesignationChange(value: string): void {
    this.designationId = value;
    this.selected.clear();
    this.fetch();
  }

  /** Students: Class → Stream → Stream Group → Section, each change resetting what depends on it. */
  onClassChange(value: string): void {
    this.classId = value;
    this.streamId = '';
    this.groupId = '';
    this.sectionId = '';
    this.selected.clear();
    this.cdr.markForCheck();
  }

  onStreamChange(value: string): void {
    this.streamId = value;
    this.groupId = '';
    this.sectionId = '';
    this.selected.clear();
    this.cdr.markForCheck();
  }

  onGroupChange(value: string): void {
    this.groupId = value;
    this.selected.clear();
    this.cdr.markForCheck();
  }

  onSectionChange(value: string): void {
    this.sectionId = value;
    this.selected.clear();
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

  private fetchSeq = 0;
  /** The load in flight — cancelled (not just ignored) when a newer one starts. */
  private fetchSub?: Subscription;

  /** `quiet`: a refresh after a write — the current grid stays visible meanwhile. */
  fetch(quiet = false): void {
    if (!quiet) {
      this.loading = true;
      this.loadError = '';
    }
    this.cdr.markForCheck();
    // Only the newest request may land — a fast filter change never shows a stale answer.
    const seq = ++this.fetchSeq;
    this.fetchSub?.unsubscribe();
    if (this.personType === 'staff') {
      this.fetchSub = this.api.getStaffRoster(this.adminId, {
        month: this.month, departmentId: this.departmentId, designationId: this.designationId, search: this.search
      }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        if (seq !== this.fetchSeq) return;
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
    this.fetchSub = this.api.getClassShifts(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      if (seq !== this.fetchSeq) return;
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
      // Headings stay so the narrowed rows keep their Class → Stream context. A Stream Group
      // belongs to one stream, so it narrows to that stream's rows (shifts are set per
      // stream/section, never per group — the group is show-only).
      const streamId = this.streamId || (this.groupId ? this.groups.find((group) => group._id === this.groupId)?.streamId || '' : '');
      if (streamId && row.level > 0 && row.streamId !== streamId) return false;
      if (this.sectionId && row.level > 0 && row.sectionId !== this.sectionId && !(row.streamId && !row.sectionId)) return false;
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
    return shift ? formatTime(shift.startTime) + ' – ' + formatTime(shift.endTime) : '';
  }

  shiftOf(id: string | null): Shift | null {
    return id ? this.shiftById.get(id) || null : null;
  }

  // --- selection -----------------------------------------------------------------------

  /**
   * A row "has a roster" when a shift sits on an EDITABLE day (today onward). Locked past
   * days are kept by Delete on purpose, so counting them made a deleted row still read as
   * assigned — Assign stayed disabled and only Edit was enabled (attendance-fix1.md §1.4).
   */
  private hasAssignment(key: string): boolean {
    if (this.personType === 'staff') {
      const row = this.staffRows.find((candidate) => candidate._id === key);
      return !!row && Object.entries(row.days).some(([dateKey, value]) => dateKey >= this.today && value && value !== WEEK_OFF);
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
      .map((shift) => ({ value: shift._id, label: shift.name + ' · ' + this.shiftTime(shift) }))];
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
    // Defaults to the rest of the month on screen — today onward, never a locked day.
    const first = this.month + '-01';
    this.assignFrom = first < this.today ? this.today : first;
    this.assignTo = this.month < this.today.slice(0, 7) ? this.assignFrom : monthEnd(this.month);
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
    const editable = (dateKey: string): boolean => dateKey >= this.today;
    const row = this.staffRows.find((candidate) => keys.includes(candidate._id)
      && Object.entries(candidate.days).some(([dateKey, value]) => editable(dateKey) && value !== WEEK_OFF));
    if (!row) return;
    const working = new Set<number>();
    let shiftId = '';
    Object.entries(row.days).forEach(([dateKey, value]) => {
      if (value === WEEK_OFF || !editable(dateKey)) return;
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

  onAssignRange(range: DateRange): void {
    this.assignFrom = range.start;
    this.assignTo = range.end;
  }

  get assignSubmitDisabled(): boolean {
    return this.saving || !this.assignShiftId
      || (this.personType === 'staff' && (this.assignWeekdays.size === 0 || !this.assignFrom || !this.assignTo));
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
        fromDate: this.assignFrom, toDate: this.assignTo, weekdays: [...this.assignWeekdays]
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
    if (this.deleting) return;
    const keys = [...this.selected].filter((key) => this.hasAssignment(key));
    if (!keys.length) {
      this.confirmOpen = false;
      return;
    }
    // One bulk write; the confirm stays open with its spinner until it answers (rule 11).
    this.deleting = true;
    this.failures = [];
    const request = this.personType === 'staff'
      ? this.api.clearStaff({ adminId: this.adminId, staffIds: keys, month: this.month, confirmed: true })
      : this.api.clearClasses({ adminId: this.adminId, session: this.session, targets: this.targetsOf(keys), confirmed: true });
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.deleting = false;
      this.confirmOpen = false;
      const failed = new Set((res.failed || []).map((row) => keys[row.row]));
      this.clearLocally(keys.filter((key) => !failed.has(key)));
      this.afterBulk(res, keys);
    }, (error: unknown) => {
      this.deleting = false;
      this.confirmOpen = false;
      this.showFailures(rowErrorsOf(error) as RowFailure[], keys);
      this.cdr.markForCheck();
    });
  }

  /** Mirror a successful delete at once — the cells empty and Assign re-enables without waiting. */
  private clearLocally(keys: string[]): void {
    const cleared = new Set(keys);
    if (this.personType === 'staff') {
      this.staffRows = this.staffRows.map((row) => {
        if (!cleared.has(row._id)) return row;
        const days: Record<string, string> = {};
        Object.entries(row.days).forEach(([dateKey, value]) => { if (dateKey < this.today) days[dateKey] = value; });
        return { ...row, days };
      });
    } else {
      this.classRows = this.classRows.map((row) => (cleared.has(row.key) ? { ...row, shiftId: null } : row));
    }
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
  }

  private afterBulk(res: BulkWriteResponse, keys: string[]): void {
    this.selected.clear();
    this.showFailures(res.failed || [], keys);
    this.snackBar.open(res.warning ? res.message + ' ' + res.warning.message : res.message, 'Close', { duration: res.warning ? 6000 : 3000 });
    // A quiet refresh: the grid on screen stays until the server's answer lands.
    this.fetch(true);
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
