/**
 * Holidays — the school's master list of holiday dates.
 *
 * Reference: docs/schoolzen-planning/v1/holiday/holidays.html
 *
 * Row 1: search + Delete Selected + Generate from Public Holidays + Add Holiday. Row 2: the
 * custom month-calendar filter (its own component, not a `.dd`). A holiday does nothing on
 * its own until a Template includes it; deleting one detaches it from every template, and
 * the API reports how many.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { HolidaysService } from 'src/app/shared/services/holiday/holidays.service';
import { Holiday, HolidayPayload, SystemHolidayEntry, SystemHolidayState } from 'src/app/shared/models/holiday/holiday.model';
import { validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { DateRange, DateRangeMark, longDate } from 'src/app/shared/components/date-range-picker/date-range-picker.component';

interface HolidayForm {
  id: string | null;
  name: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FORM: HolidayForm = { id: null, name: '', startDate: '', endDate: '' };
const KNOWN_FIELDS = ['name', 'startDate', 'endDate'];
const MAX_DAYS = 31;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Inclusive day count of two "YYYY-MM-DD" keys — display only, the API recounts. */
export const daysBetween = (start: string, end: string): number => {
  if (!start || !end || end < start) return 0;
  return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
};

@Component({
  selector: 'app-holidays',
  templateUrl: './holidays.component.html',
  styleUrls: ['./holidays.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HolidaysComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  search = '';
  month = '';
  readonly todayMonth = new Date().toISOString().slice(0, 7);

  rows: Holiday[] = [];
  page = 1;
  limit = 25;
  total = 0;
  /** Every holiday — the calendar filter and the Overview numbers. */
  allHolidays: Holiday[] = [];
  selected = new Set<string>();

  formOpen = false;
  /** Double-submit guard. */
  saving = false;
  formTitle = 'Add Holiday';
  form: HolidayForm = { ...EMPTY_FORM };
  fieldErrors: Record<string, string> = {};
  formError = '';
  /** Edit: the dates stay locked until "I confirm I want to change this holiday's dates". */
  editDatesConfirmed = false;
  /** "Delete existing & use these dates" in flight. */
  overriding = false;

  generateOpen = false;
  generating = false;
  generateError = '';
  states: SystemHolidayState[] = [];
  stateOptions: DdOption[] = [];
  yearOptions: DdOption[] = [];
  generateState = '';
  generateYear = '';
  /** The state's official list for the year, and which rows are ticked ("name|date"). */
  publicEntries: SystemHolidayEntry[] = [];
  publicTicked = new Set<string>();
  publicLoading = false;

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteIds: string[] = [];
  deleting = false;

  private searchInput$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: HolidaysService,
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
    this.refresh();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- list ---------------------------------------------------------------------------

  refresh(): void {
    this.fetch();
    this.loadAll();
  }

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.api.getHolidays(this.adminId, { search: this.search, month: this.month, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.loading = false;
        this.pruneSelection();
        this.cdr.markForCheck();
      }, () => {
        this.rows = [];
        this.loadError = "Couldn't load holidays.";
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  private loadAll(): void {
    this.api.getOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.allHolidays = res.rows || [];
      this.cdr.markForCheck();
    }, () => undefined);
  }

  get totalDaysOff(): number {
    return this.allHolidays.reduce((sum, row) => sum + (row.days || 0), 0);
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value.trim());
  }

  onMonthChange(month: string): void {
    this.month = month;
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

  formatDate(key: string): string {
    if (!key) return '';
    const [year, month, day] = key.split('-');
    return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
  }

  trackByRow = (_index: number, row: Holiday): string => row._id;

  // --- selection ----------------------------------------------------------------------

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

  private pruneSelection(): void {
    const visible = new Set(this.rows.map((row) => row._id));
    Array.from(this.selected).forEach((id) => { if (!visible.has(id)) this.selected.delete(id); });
  }

  // --- add / edit ---------------------------------------------------------------------

  onAdd(): void {
    this.openForm('Add Holiday', { ...EMPTY_FORM });
  }

  onEdit(row: Holiday): void {
    this.openForm('Edit Holiday', { id: row._id, name: row.name, startDate: row.startDate, endDate: row.endDate });
  }

  private openForm(title: string, form: HolidayForm): void {
    this.formTitle = title;
    this.form = form;
    this.fieldErrors = {};
    this.formError = '';
    this.saving = false;
    this.editDatesConfirmed = false;
    this.formOpen = true;
  }

  get isEdit(): boolean {
    return Boolean(this.form.id);
  }

  /** Edit only: the date picker is locked until the confirm box is ticked (holidays.html). */
  get datesLocked(): boolean {
    return this.isEdit && !this.editDatesConfirmed;
  }

  onEditDatesConfirm(checked: boolean): void {
    this.editDatesConfirmed = checked;
  }

  /** Every other holiday, shown lightly on the range calendar. */
  get otherHolidays(): Holiday[] {
    return this.allHolidays.filter((row) => row._id !== this.form.id);
  }

  get existingMarks(): DateRangeMark[] {
    return this.otherHolidays.map((row) => ({ name: row.name, start: row.startDate, end: row.endDate }));
  }

  /** An existing holiday the picked dates run into — the conflict box (holidays.html). */
  get conflict(): Holiday | null {
    const start = this.form.startDate;
    const end = this.form.endDate || start;
    if (!start) return null;
    return this.otherHolidays.find((row) => start <= row.endDate && end >= row.startDate) || null;
  }

  get conflictText(): string {
    const row = this.conflict;
    if (!row) return '';
    const span = longDate(row.startDate) + ' – ' + longDate(row.endDate);
    return this.form.endDate
      ? `${row.name} already covers part of this range (${span}). Delete it to use these dates, or change dates to avoid it.`
      : `${row.name} already covers ${longDate(this.form.startDate)} (${span}). Delete it to use this date, or change dates to pick another.`;
  }

  /** Same name (case-insensitive) as another holiday — shown under the Name field. */
  get duplicateName(): boolean {
    const name = this.form.name.trim().toLowerCase();
    return Boolean(name) && this.otherHolidays.some((row) => row.name.trim().toLowerCase() === name);
  }

  get rangeSummary(): string {
    const days = this.plannedDays;
    if (this.form.startDate === this.form.endDate) return longDate(this.form.startDate) + ' · 1 day off.';
    return longDate(this.form.startDate) + ' – ' + longDate(this.form.endDate) + ' · ' + days + ' days off, first and last day included.';
  }

  onRangeChange(range: DateRange): void {
    this.form = { ...this.form, startDate: range.start, endDate: range.end };
    delete this.fieldErrors['startDate'];
    delete this.fieldErrors['endDate'];
  }

  /** "Delete existing & use these dates": removes the conflicting holiday, keeps the form. */
  onOverrideConflict(): void {
    const row = this.conflict;
    if (!row || this.overriding) return;
    this.overriding = true;
    this.api.deleteHoliday(this.adminId, row._id).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.overriding = false;
      this.allHolidays = this.allHolidays.filter((entry) => entry._id !== row._id);
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
      this.cdr.markForCheck();
    }, () => {
      this.overriding = false;
      this.cdr.markForCheck();
    });
  }

  onNameChange(value: string): void {
    this.form = { ...this.form, name: value };
    delete this.fieldErrors['name'];
  }

  get plannedDays(): number {
    return daysBetween(this.form.startDate, this.form.endDate);
  }

  get rangeError(): string {
    if (!this.form.startDate || !this.form.endDate) return '';
    if (this.form.endDate < this.form.startDate) return 'The last day cannot be before the first day.';
    if (this.plannedDays > MAX_DAYS) return `A holiday can span at most ${MAX_DAYS} days.`;
    return '';
  }

  get submitDisabled(): boolean {
    return this.saving || this.overriding || !this.form.name.trim() || !this.form.startDate || !this.form.endDate
      || Boolean(this.rangeError) || Boolean(this.conflict) || this.duplicateName;
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  onFormSubmit(): void {
    if (this.submitDisabled) return;
    this.fieldErrors = {};
    this.formError = '';
    const payload: HolidayPayload = {
      adminId: this.adminId,
      name: this.form.name.trim(),
      startDate: this.form.startDate,
      endDate: this.form.endDate
    };
    this.saving = true;
    const request = this.form.id ? this.api.updateHoliday(this.form.id, payload) : this.api.createHoliday(payload);
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.formOpen = false;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.refresh();
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

  // --- generate from public holidays ----------------------------------------------------

  onGenerateOpen(): void {
    if (this.generateOpen) return;
    this.generateError = '';
    this.generating = false;
    this.generateOpen = true;
    this.api.getSystemStates(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.states = res.rows || [];
      this.stateOptions = this.states.map((row) => ({ value: row.state, label: row.state }));
      if (!this.states.length) this.generateError = 'No official holiday data is available yet — add holidays manually for now.';
      if (this.generateState && !this.states.some((row) => row.state === this.generateState)) this.generateState = '';
      this.rebuildYears();
      this.cdr.markForCheck();
    }, () => {
      this.generateError = "Couldn't load the list of states.";
      this.cdr.markForCheck();
    });
  }

  onGenerateStateChange(state: string): void {
    this.generateState = state;
    this.rebuildYears();
  }

  onGenerateYearChange(year: string): void {
    this.generateYear = year;
    this.loadPublicEntries();
  }

  private rebuildYears(): void {
    const entry = this.states.find((row) => row.state === this.generateState);
    this.yearOptions = (entry ? entry.years : []).map((year) => ({ value: String(year), label: String(year) }));
    if (!this.yearOptions.some((option) => option.value === this.generateYear)) {
      this.generateYear = this.yearOptions.length ? this.yearOptions[0].value : '';
    }
    this.loadPublicEntries();
  }

  /** The preview list: every official row ticked except the ones that already clash. */
  private loadPublicEntries(): void {
    this.publicEntries = [];
    this.publicTicked = new Set();
    if (!this.generateState || !this.generateYear) return;
    this.publicLoading = true;
    this.api.getSystemHolidays(this.adminId, this.generateState, Number(this.generateYear))
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.publicLoading = false;
        this.publicEntries = res.rows || [];
        this.publicTicked = new Set(this.publicEntries.filter((row) => !this.publicConflict(row)).map((row) => this.publicKey(row)));
        this.cdr.markForCheck();
      }, () => {
        this.publicLoading = false;
        this.cdr.markForCheck();
      });
  }

  publicKey(row: SystemHolidayEntry): string {
    return row.name + '|' + row.date;
  }

  /** Why a public row would clash with what the school already has, or ''. */
  publicConflict(row: SystemHolidayEntry): string {
    const name = row.name.trim().toLowerCase();
    if (this.allHolidays.some((entry) => entry.name.trim().toLowerCase() === name && entry.startDate === row.date)) {
      return `A holiday named "${row.name}" already exists.`;
    }
    const covering = this.allHolidays.find((entry) => entry.startDate <= row.date && entry.endDate >= row.date);
    return covering ? `${covering.name} already covers part of this range.` : '';
  }

  togglePublic(row: SystemHolidayEntry): void {
    const key = this.publicKey(row);
    if (this.publicTicked.has(key)) this.publicTicked.delete(key);
    else this.publicTicked.add(key);
    this.publicTicked = new Set(this.publicTicked);
  }

  /** The ticked rows, for the preview calendar. */
  get publicMarks(): DateRangeMark[] {
    return this.publicEntries.filter((row) => this.publicTicked.has(this.publicKey(row)))
      .map((row) => ({ name: row.name, start: row.date, end: row.date }));
  }

  publicDateLabel(row: SystemHolidayEntry): string {
    return this.formatDate(row.date);
  }

  trackByPublic = (_index: number, row: SystemHolidayEntry): string => this.publicKey(row);

  get generateDisabled(): boolean {
    return this.generating || !this.generateState || !this.generateYear || !this.publicTicked.size;
  }

  onGenerateCancel(): void {
    this.generateOpen = false;
  }

  onGenerateSubmit(): void {
    if (this.generateDisabled) return;
    this.generating = true;
    this.generateError = '';
    this.api.generate(this.adminId, this.generateState, Number(this.generateYear), Array.from(this.publicTicked))
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.generating = false;
        this.generateOpen = false;
        this.snackBar.open(res.message, 'Close', { duration: 4000 });
        this.refresh();
        this.cdr.markForCheck();
      }, (error: unknown) => {
        this.generating = false;
        const inline = validationErrorsOf(error);
        if (inline) this.generateError = inline.message;
        this.cdr.markForCheck();
      });
  }

  // --- delete -------------------------------------------------------------------------

  onDelete(row: Holiday): void {
    this.askDelete([row._id], 'Delete Holiday',
      `This removes "${row.name}" from every Template that includes it. This can't be undone.`);
  }

  onDeleteSelected(): void {
    const ids = Array.from(this.selected);
    if (!ids.length) return;
    this.askDelete(ids, 'Delete Holidays',
      `This removes ${ids.length} selected holiday${ids.length === 1 ? '' : 's'} from every Template that includes ${ids.length === 1 ? 'it' : 'them'}. This can't be undone.`);
  }

  private askDelete(ids: string[], title: string, message: string): void {
    if (this.confirmOpen || this.deleting) return;
    this.deleteIds = ids;
    this.confirmConfig = { title, message, confirmLabel: 'Delete', variant: 'warning', typeToConfirm: 'DELETE' };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const ids = this.deleteIds;
    this.deleteIds = [];
    if (!ids.length || this.deleting) return;
    this.deleting = true;
    forkJoin(ids.map((id) => this.api.deleteHoliday(this.adminId, id).pipe(
      map((res) => ({ ok: true, templates: res.templatesTouched || 0, message: res.message })),
      catchError(() => of({ ok: false, templates: 0, message: '' }))
    ))).pipe(takeUntil(this.destroyed$)).subscribe((results) => {
      this.deleting = false;
      const done = results.filter((row) => row.ok);
      const failed = results.length - done.length;
      ids.forEach((id) => this.selected.delete(id));
      const message = results.length === 1 && done.length === 1
        ? done[0].message
        : `${done.length} deleted` + (failed ? `, ${failed} failed` : '') + '.';
      this.snackBar.open(message, 'Close', { duration: 4000 });
      this.refresh();
      this.cdr.markForCheck();
    });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteIds = [];
  }
}
