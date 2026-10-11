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
import { Holiday, HolidayPayload, SystemHolidayState } from 'src/app/shared/models/holiday/holiday.model';
import { validationErrorsOf } from 'src/app/shared/utils/api-error.util';

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

  generateOpen = false;
  generating = false;
  generateError = '';
  states: SystemHolidayState[] = [];
  stateOptions: DdOption[] = [];
  yearOptions: DdOption[] = [];
  generateState = '';
  generateYear = '';

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
    this.formOpen = true;
  }

  onNameChange(value: string): void {
    this.form = { ...this.form, name: value };
    delete this.fieldErrors['name'];
  }

  onStartChange(value: string): void {
    // A one-day holiday is the common case: the last day follows the first until set.
    const endDate = !this.form.endDate || this.form.endDate < value ? value : this.form.endDate;
    this.form = { ...this.form, startDate: value, endDate };
    delete this.fieldErrors['startDate'];
    delete this.fieldErrors['endDate'];
  }

  onEndChange(value: string): void {
    this.form = { ...this.form, endDate: value };
    delete this.fieldErrors['endDate'];
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
    return this.saving || !this.form.name.trim() || !this.form.startDate || !this.form.endDate || Boolean(this.rangeError);
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
  }

  private rebuildYears(): void {
    const entry = this.states.find((row) => row.state === this.generateState);
    this.yearOptions = (entry ? entry.years : []).map((year) => ({ value: String(year), label: String(year) }));
    if (!this.yearOptions.some((option) => option.value === this.generateYear)) {
      this.generateYear = this.yearOptions.length ? this.yearOptions[0].value : '';
    }
  }

  get generateDisabled(): boolean {
    return this.generating || !this.generateState || !this.generateYear;
  }

  onGenerateCancel(): void {
    this.generateOpen = false;
  }

  onGenerateSubmit(): void {
    if (this.generateDisabled) return;
    this.generating = true;
    this.generateError = '';
    this.api.generate(this.adminId, this.generateState, Number(this.generateYear))
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
      `Delete "${row.name}"? It will also be removed from every template that includes it.`);
  }

  onDeleteSelected(): void {
    const ids = Array.from(this.selected);
    if (!ids.length) return;
    this.askDelete(ids, 'Delete Holidays',
      `Delete ${ids.length} selected holiday${ids.length === 1 ? '' : 's'}? They will also be removed from every template that includes them.`);
  }

  private askDelete(ids: string[], title: string, message: string): void {
    if (this.confirmOpen || this.deleting) return;
    this.deleteIds = ids;
    this.confirmConfig = { title, message, confirmLabel: 'Delete', variant: 'warning' };
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
