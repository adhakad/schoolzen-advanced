/**
 * Templates — bundle holidays (by reference) plus the weekly off-days into a named
 * calendar, then assign it on the Assign page.
 *
 * Reference: docs/schoolzen-planning/v1/holiday/templates.html
 *
 * ONE plain toolbar row (search + Add Template). Editing a template changes everyone already
 * assigned to it straight away — the API stores holiday ids, never copies. The Default
 * template (Sunday off) is what anyone without a template follows; it can be edited but
 * never deleted.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { HolidaysService } from 'src/app/shared/services/holiday/holidays.service';
import { HolidayTemplatesService } from 'src/app/shared/services/holiday/holiday-templates.service';
import { Holiday, HolidaySource } from 'src/app/shared/models/holiday/holiday.model';
import {
  HolidayTemplate, HolidayTemplatePayload, WEEKDAY_SHORT
} from 'src/app/shared/models/holiday/holiday-template.model';
import { validationErrorsOf } from 'src/app/shared/utils/api-error.util';

interface TemplateForm {
  id: string | null;
  name: string;
  holidayIds: Set<string>;
  weeklyOffDays: Set<number>;
  isDefault: boolean;
}

const KNOWN_FIELDS = ['name', 'holidayIds', 'weeklyOffDays'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (key: string): string => `${key.slice(8, 10)} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;

const emptyForm = (): TemplateForm => ({ id: null, name: '', holidayIds: new Set(), weeklyOffDays: new Set([0]), isDefault: false });

@Component({
  selector: 'app-holiday-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HolidayTemplatesComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  search = '';

  rows: HolidayTemplate[] = [];
  page = 1;
  limit = 10;
  total = 0;

  /** The checklist source — every holiday in the master list. */
  holidays: Holiday[] = [];
  holidaysError = '';
  sourceFilter: '' | HolidaySource = '';
  readonly sourceOptions: readonly DdOption[] = [
    { value: '', label: 'All types' },
    { value: 'manual', label: 'Manual' },
    { value: 'auto', label: 'Auto-generated' }
  ];
  readonly weekdays = WEEKDAY_SHORT.map((label, value) => ({ value, label }));

  formOpen = false;
  /** Double-submit guard. */
  saving = false;
  formTitle = 'Add Template';
  form: TemplateForm = emptyForm();
  fieldErrors: Record<string, string> = {};
  formError = '';

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteTarget: HolidayTemplate | null = null;
  deleting = false;

  private searchInput$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: HolidayTemplatesService,
    private holidaysApi: HolidaysService,
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
    this.api.getTemplates(this.adminId, { search: this.search, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        this.rows = [];
        this.loadError = "Couldn't load templates.";
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  get peopleAssigned(): number {
    return this.rows.reduce((sum, row) => sum + (row.assignedCount || 0), 0);
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

  formatDate(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  offDaysText(row: HolidayTemplate): string {
    return row.weeklyOffDays.length ? row.weeklyOffDays.map((day) => WEEKDAY_SHORT[day]).join(', ') + ' off' : 'No weekly off';
  }

  trackByRow = (_index: number, row: HolidayTemplate): string => row._id;
  trackByHoliday = (_index: number, row: Holiday): string => row._id;

  // --- add / edit ---------------------------------------------------------------------

  onAdd(): void {
    this.openForm('Add Template', emptyForm());
  }

  onEdit(row: HolidayTemplate): void {
    this.openForm('Edit Template', {
      id: row._id,
      name: row.name,
      holidayIds: new Set(row.holidayIds),
      weeklyOffDays: new Set(row.weeklyOffDays),
      isDefault: row.isDefault
    });
  }

  private openForm(title: string, form: TemplateForm): void {
    this.formTitle = title;
    this.form = form;
    this.fieldErrors = {};
    this.formError = '';
    this.saving = false;
    this.sourceFilter = '';
    this.formOpen = true;
    this.loadHolidays();
  }

  private loadHolidays(): void {
    this.holidaysError = '';
    this.holidaysApi.getOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.holidays = res.rows || [];
      this.cdr.markForCheck();
    }, () => {
      this.holidaysError = "Couldn't load the holiday list.";
      this.cdr.markForCheck();
    });
  }

  get visibleHolidays(): Holiday[] {
    return this.sourceFilter ? this.holidays.filter((row) => row.source === this.sourceFilter) : this.holidays;
  }

  get allVisibleChecked(): boolean {
    const visible = this.visibleHolidays;
    return visible.length > 0 && visible.every((row) => this.form.holidayIds.has(row._id));
  }

  holidayRange(row: Holiday): string {
    const span = row.startDate === row.endDate ? shortDate(row.startDate) : `${shortDate(row.startDate)} – ${shortDate(row.endDate)}`;
    return `${span} · ${row.days} day${row.days === 1 ? '' : 's'}`;
  }

  onNameChange(value: string): void {
    this.form.name = value;
    delete this.fieldErrors['name'];
  }

  onSourceFilterChange(value: string): void {
    this.sourceFilter = value === 'manual' || value === 'auto' ? value : '';
  }

  toggleHoliday(id: string): void {
    if (this.form.holidayIds.has(id)) this.form.holidayIds.delete(id);
    else this.form.holidayIds.add(id);
  }

  toggleAllHolidays(): void {
    const check = !this.allVisibleChecked;
    this.visibleHolidays.forEach((row) => (check ? this.form.holidayIds.add(row._id) : this.form.holidayIds.delete(row._id)));
  }

  toggleWeekday(day: number): void {
    if (this.form.weeklyOffDays.has(day)) this.form.weeklyOffDays.delete(day);
    else if (this.form.weeklyOffDays.size < 6) this.form.weeklyOffDays.add(day);
    delete this.fieldErrors['weeklyOffDays'];
  }

  get submitDisabled(): boolean {
    return this.saving || !this.form.name.trim();
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  /** Payload for the form — exposed for the spec. */
  buildPayload(): HolidayTemplatePayload {
    // Only ids still in the master list — a holiday deleted meanwhile is dropped, not sent.
    const known = new Set(this.holidays.map((row) => row._id));
    return {
      adminId: this.adminId,
      name: this.form.name.trim(),
      holidayIds: Array.from(this.form.holidayIds).filter((id) => !this.holidays.length || known.has(id)),
      weeklyOffDays: Array.from(this.form.weeklyOffDays).sort()
    };
  }

  onFormSubmit(): void {
    if (this.submitDisabled) return;
    this.fieldErrors = {};
    this.formError = '';
    const payload = this.buildPayload();
    this.saving = true;
    const request = this.form.id ? this.api.updateTemplate(this.form.id, payload) : this.api.createTemplate(payload);
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
          const key = field.split('.')[0];
          if (KNOWN_FIELDS.indexOf(key) === -1) this.formError = this.formError || inline.fields[field];
          else this.fieldErrors[key] = inline.fields[field];
        });
        if (!Object.keys(inline.fields).length) this.formError = inline.message;
      }
      this.cdr.markForCheck();
    });
  }

  // --- delete -------------------------------------------------------------------------

  onDelete(row: HolidayTemplate): void {
    if (this.confirmOpen) return;
    this.deleteTarget = row;
    const assigned = row.assignedCount || 0;
    if (row.isDefault) {
      this.confirmConfig = {
        title: 'Delete Template',
        message: 'The Default template applies to everyone without a template, so it can\'t be deleted. You can still edit it.',
        confirmLabel: 'Delete', variant: 'warning', blocked: true
      };
    } else if (assigned) {
      this.confirmConfig = {
        title: 'Delete Template',
        message: `${assigned} ${assigned === 1 ? 'person is' : 'people are'} still using this template. Change their template on the Assign page first.`,
        confirmLabel: 'Delete', variant: 'warning', blocked: true
      };
    } else {
      this.confirmConfig = {
        title: 'Delete Template',
        message: `Delete "${row.name}"? The holidays themselves stay in your list.`,
        confirmLabel: 'Delete', variant: 'warning'
      };
    }
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const row = this.deleteTarget;
    this.deleteTarget = null;
    if (!row || this.deleting || row.isDefault || row.assignedCount) return;
    this.deleting = true;
    this.api.deleteTemplate(this.adminId, row._id)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.deleting = false;
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.fetch();
      }, () => {
        // ErrorInterceptor has already shown TEMPLATE_IN_USE (with its count) or the failure.
        this.deleting = false;
        this.fetch();
      });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteTarget = null;
  }
}
