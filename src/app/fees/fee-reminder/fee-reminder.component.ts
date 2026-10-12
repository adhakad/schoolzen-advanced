/**
 * Fee Reminder — saved filters that resolve to a LIVE student list on demand, reviewed before
 * every send.
 *
 * Reference: docs/schoolzen-planning/v1/fees/fee-reminder.html
 *
 * "To Send" (a saved filter) and "Choose Filters" (an unsaved one) both re-run the filter on
 * the server EVERY time — the list is never kept between opens. Review & Send lets specific
 * people be unchecked; Send Now queues a job with exactly the checked list and the page
 * follows it. Writes need the 'fees' edit grant (`canEdit`); delete removes only the saved
 * definition (the lightweight delete — no type-to-confirm).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { FeeReminderService } from 'src/app/shared/services/fees/fee-reminder.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import {
  ReminderFilterFields, ReminderFilterRow, ReminderJobResult, ReminderRecipient
} from 'src/app/shared/models/fees/fees.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { rupees } from '../fees-format';

interface FilterForm {
  classId: string;
  paidBelowPercent: string;
  noPaymentSinceDays: string;
  gapSinceLastReminderDays: string;
}

const emptyForm = (): FilterForm => ({ classId: '', paidBelowPercent: '', noPaymentSinceDays: '', gapSinceLastReminderDays: '' });
const blankOrNumber = (value: string): number | null => (String(value ?? '').trim() === '' ? null : Number(value));

@Component({
  selector: 'app-fee-reminder',
  templateUrl: './fee-reminder.component.html',
  styleUrls: ['./fee-reminder.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeeReminderComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  classOptions: DdOption[] = [];
  optionsError = '';
  search = '';

  rows: ReminderFilterRow[] = [];
  summary = { savedFilters: 0, sentThisMonth: 0 };
  canEdit = false;
  loading = true;
  loadError = '';

  // Create Filter
  createOpen = false;
  form: FilterForm = emptyForm();
  fieldErrors: Record<string, string> = {};
  isFilterClick = false;
  createError = '';

  // Review & Send — always a fresh server run
  reviewOpen = false;
  reviewTitle = '';
  reviewSource: { savedId: string | null; fields: ReminderFilterFields } | null = null;
  recipients: ReminderRecipient[] = [];
  reviewLoading = false;
  reviewError = '';
  checked = new Set<string>();
  saveFilter = false;
  isSendNowClick = false;
  private sendKey = '';
  sending = false;

  // Delete
  deleteTarget: ReminderFilterRow | null = null;
  isDeleteClick = false;
  deleteError = '';

  private destroyed$ = new Subject<void>();

  constructor(
    private api: FeeReminderService,
    private optionsService: StudentOptionsService,
    private jobs: JobStatusService,
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
    this.shellContext.context.pipe(takeUntil(this.destroyed$)).subscribe((context) => { this.session = context.activeSession; });
    this.loadOptions();
    this.fetch();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadOptions(): void {
    this.optionsError = '';
    this.optionsService.getFilterOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((options) => {
      this.classOptions = [{ value: '', label: '— Select —' }].concat(options.classes.map((item) => ({ value: item._id, label: item.label })));
      this.cdr.markForCheck();
    }, (error) => {
      this.optionsError = errorMessageOf(error, "Couldn't load classes.");
      this.cdr.markForCheck();
    });
  }

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.list(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.summary = res.summary || { savedFilters: 0, sentThisMonth: 0 };
      this.canEdit = Boolean(res.canEdit);
      this.loading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.rows = [];
      this.loading = false;
      this.loadError = errorMessageOf(error, "Couldn't load reminder filters.");
      this.cdr.markForCheck();
    });
  }

  get visibleRows(): ReminderFilterRow[] {
    const term = this.search.trim().toLowerCase();
    return term ? this.rows.filter((row) => row.className.toLowerCase().includes(term)) : this.rows;
  }

  // --- display --------------------------------------------------------------------------

  money(value: number): string {
    return rupees(value);
  }

  // --- Create Filter --------------------------------------------------------------------

  openCreate(): void {
    this.form = emptyForm();
    this.fieldErrors = {};
    this.createError = '';
    this.createOpen = true;
  }

  closeCreate(): void {
    if (this.isFilterClick) return;
    this.createOpen = false;
  }

  /** Mirrors the server: class required; numbers whole and non-negative; percent 0–100. */
  private validate(): boolean {
    const errors: Record<string, string> = {};
    if (!this.form.classId) errors['classId'] = 'Choose a class.';
    const whole = (value: string): boolean => String(value ?? '').trim() === '' || /^\d+$/.test(String(value).trim());
    if (!whole(this.form.paidBelowPercent)) errors['paidBelowPercent'] = 'Enter a valid number.';
    else if (blankOrNumber(this.form.paidBelowPercent) !== null && Number(this.form.paidBelowPercent) > 100) {
      errors['paidBelowPercent'] = 'Enter a percentage between 0 and 100.';
    }
    if (!whole(this.form.noPaymentSinceDays)) errors['noPaymentSinceDays'] = 'Enter a valid number.';
    if (!whole(this.form.gapSinceLastReminderDays)) errors['gapSinceLastReminderDays'] = 'Enter a valid number.';
    this.fieldErrors = errors;
    return !Object.keys(errors).length;
  }

  private formFields(): ReminderFilterFields {
    return {
      classId: this.form.classId,
      paidBelowPercent: blankOrNumber(this.form.paidBelowPercent),
      noPaymentSinceDays: blankOrNumber(this.form.noPaymentSinceDays),
      gapSinceLastReminderDays: blankOrNumber(this.form.gapSinceLastReminderDays)
    };
  }

  /** "Choose Filters" — run the unsaved filter live and open Review & Send. */
  chooseFilters(): void {
    if (this.isFilterClick || !this.validate()) return;
    const label = this.classOptions.find((item) => item.value === this.form.classId)?.label || '';
    this.isFilterClick = true;
    this.createError = '';
    this.openReview({ savedId: null, fields: this.formFields() }, label, () => {
      this.isFilterClick = false;
      this.createOpen = false;
    }, (message, fields) => {
      this.isFilterClick = false;
      if (fields) this.fieldErrors = fields;
      else this.createError = message;
    });
  }

  // --- Review & Send ----------------------------------------------------------------------

  /** "To Send" on a saved filter — re-run on the server now, never a remembered list. */
  openSaved(row: ReminderFilterRow): void {
    if (this.reviewLoading) return;
    this.openReview({ savedId: row._id, fields: row }, row.className);
  }

  private openReview(
    source: { savedId: string | null; fields: ReminderFilterFields },
    className: string,
    onOpen?: () => void,
    onFail?: (message: string, fields?: Record<string, string>) => void
  ): void {
    this.reviewLoading = true;
    this.reviewError = '';
    this.cdr.markForCheck();
    const request = source.savedId
      ? this.api.previewSaved(this.adminId, this.session, source.savedId)
      : this.api.preview(this.adminId, this.session, source.fields);
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.reviewLoading = false;
      this.reviewSource = source;
      this.reviewTitle = `Send Fee Reminder — ${className}`;
      this.recipients = res.rows || [];
      // Everyone reachable starts checked; a missing number can't be sent to.
      this.checked = new Set(this.recipients.filter((item) => item.mobile).map((item) => item.studentId));
      this.saveFilter = false;
      this.sendKey = newIdempotencyKey();
      this.reviewOpen = true;
      if (onOpen) onOpen();
      this.cdr.markForCheck();
    }, (error) => {
      this.reviewLoading = false;
      const message = errorMessageOf(error, "Couldn't load the students for this filter.");
      const validation = validationErrorsOf(error);
      if (onFail) onFail(message, validation && Object.keys(validation.fields).length ? validation.fields : undefined);
      else this.snackBar.open(message, 'Close', { duration: 4000 });
      this.cdr.markForCheck();
    });
  }

  closeReview(): void {
    if (this.isSendNowClick) return;
    this.reviewOpen = false;
    this.recipients = [];
    this.checked.clear();
    this.reviewSource = null;
  }

  isChecked(item: ReminderRecipient): boolean {
    return this.checked.has(item.studentId);
  }

  toggleRecipient(item: ReminderRecipient, value: boolean): void {
    if (value && item.mobile) this.checked.add(item.studentId);
    else this.checked.delete(item.studentId);
  }

  get allChecked(): boolean {
    const reachable = this.recipients.filter((item) => item.mobile);
    return reachable.length > 0 && reachable.every((item) => this.checked.has(item.studentId));
  }

  toggleAll(value: boolean): void {
    this.recipients.forEach((item) => this.toggleRecipient(item, value));
  }

  sendNow(): void {
    if (this.isSendNowClick || !this.checked.size || !this.reviewSource) return;
    const source = this.reviewSource;
    const studentIds = [...this.checked];
    this.isSendNowClick = true;
    this.reviewError = '';
    const request = source.savedId
      ? this.api.sendSaved(this.adminId, this.session, source.savedId, studentIds, this.sendKey)
      : this.api.send(this.adminId, this.session, source.fields, studentIds, this.saveFilter, this.sendKey);
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isSendNowClick = false;
      this.closeReview();
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      if (res.filter) this.fetch();
      this.follow(res.jobId);
      this.cdr.markForCheck();
    }, (error) => {
      this.isSendNowClick = false;
      this.reviewError = errorMessageOf(error, "Couldn't send the reminders.");
      this.cdr.markForCheck();
    });
  }

  /** Follow the queued send until it finishes, then report what happened. */
  private follow(jobId: string): void {
    this.sending = true;
    this.jobs.watch<ReminderJobResult>('fees', this.adminId, jobId).pipe(takeUntil(this.destroyed$)).subscribe((status) => {
      if (status.state === 'completed') {
        this.sending = false;
        const result = status.result as ReminderJobResult | null;
        const warnings = (result?.warnings || []).map((item) => item.message).join(' ');
        this.snackBar.open(`Reminders sent to ${result?.sent ?? 0} student${result?.sent === 1 ? '' : 's'}.${warnings ? ' ' + warnings : ''}`, 'Close', { duration: 6000 });
        this.fetch();
      } else if (status.state === 'failed') {
        this.sending = false;
        this.snackBar.open(status.error || "Couldn't send the reminders.", 'Close', { duration: 6000 });
      }
      this.cdr.markForCheck();
    }, () => {
      this.sending = false;
      this.cdr.markForCheck();
    });
  }

  // --- Delete (lightweight) -------------------------------------------------------------

  openDelete(row: ReminderFilterRow): void {
    this.deleteTarget = row;
    this.deleteError = '';
  }

  closeDelete(): void {
    if (this.isDeleteClick) return;
    this.deleteTarget = null;
  }

  confirmDelete(): void {
    if (this.isDeleteClick || !this.deleteTarget) return;
    this.isDeleteClick = true;
    this.api.remove(this.adminId, this.deleteTarget._id).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isDeleteClick = false;
      this.deleteTarget = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error) => {
      this.isDeleteClick = false;
      this.deleteError = errorMessageOf(error, "Couldn't delete the filter.");
      this.cdr.markForCheck();
    });
  }

  trackById = (_index: number, row: { _id: string }): string => row._id;
  trackByStudent = (_index: number, row: ReminderRecipient): string => row.studentId;
}
