/**
 * Examination › Admit Card Structure — a searchable list of CREATED exam structures (not an
 * always-shown grid like Marksheet Structure): an exam plus each subject's date & time.
 *
 * Reference: docs/schoolzen-planning/v1/examination/admit-card-structure.html (+ .md, errors.md)
 *
 * Toolbar: row1 search + Create, row2 Class → Stream → Group → Section. NOT passive config:
 * saving queues the job that (re)generates an admit card for every matching student (202 +
 * jobId, followed here until it finishes); deleting removes them. Edits confirm first and
 * say that already-printed copies won't change. Writes need the 'admit-card-structure' edit
 * grant (`canEdit`); the API enforces every rule (schedule clash, session bounds, empty
 * scope, holiday warning, concurrent edits) whatever this form checks.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { AdmitCardStructureService } from 'src/app/shared/services/examination/admit-card-structure.service';
import {
  AdmitStructureDetail, AdmitStructureOptions, AdmitStructurePayload, AdmitStructureRow, ScheduleRow
} from 'src/app/shared/models/examination/examination.model';
import { CascadeFilterValue, EMPTY_CASCADE, FilterClass, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, toApiError, validationErrorsOf } from 'src/app/shared/utils/api-error.util';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const titleCase = (text: string): string => (text || '').replace(/\b\w/g, (c) => c.toUpperCase());

/** "14:30" → "02:30 PM" (the reference's display). */
export const time12 = (time: string): string => {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return '';
  const [h, m] = time.split(':').map(Number);
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** 07:00 → 18:00 in half hours — the schedule popup's Start/End `.dd` options. */
const TIME_OPTIONS: DdOption[] = Array.from({ length: 23 }, (_, i) => {
  const minutes = 7 * 60 + i * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { value, label: time12(value) };
});

interface SubjectSlot {
  subjectId: string;
  name: string;
  examDate: string;
  startTime: string;
  endTime: string;
  stale: boolean;
}

interface CalendarCell {
  day: number;
  key: string;
}

@Component({
  selector: 'app-admit-card-structure',
  templateUrl: './admit-card-structure.component.html',
  styleUrls: ['./admit-card-structure.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdmitCardStructureComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  options: StudentFilterOptions | null = null;
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';

  rows: AdmitStructureRow[] = [];
  total = 0;
  page = 1;
  readonly pageSize = 25;
  summary = { classesTotal: 0, examsConfigured: 0 };
  canEdit = false;
  loading = true;
  loadError = '';

  // Create / Edit modal
  modalOpen = false;
  editing: AdmitStructureDetail | null = null;
  form = { classId: '', streamId: '', groupId: '', sectionId: '', examName: '' };
  formOptions: AdmitStructureOptions | null = null;
  formOptionsLoading = false;
  slots: SubjectSlot[] = [];
  slotErrors: Record<string, string> = {};
  formError = '';
  formFieldErrors: Record<string, string> = {};
  isClick = false;

  // Schedule popup
  schedSlot: SubjectSlot | null = null;
  schedPos = { top: 0, left: 0 };
  calYear = new Date().getFullYear();
  calMonth = new Date().getMonth();
  schedDate = '';
  schedStart = '09:00';
  schedEnd = '11:00';
  readonly timeOptions = TIME_OPTIONS;

  // Confirms
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: '' };
  private confirmAction: (() => void) | null = null;

  // View
  viewDetail: AdmitStructureDetail | null = null;
  viewLoading = false;
  viewError = '';

  // Delete
  deleteRow: AdmitStructureRow | null = null;
  confirmText = '';
  deleteError = '';

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: AdmitCardStructureService,
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
    this.loadOptions();
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.fetch();
    });
    this.shellContext.context.pipe(map((context) => context.activeSession), distinctUntilChanged(), takeUntil(this.destroyed$))
      .subscribe((session) => {
        this.session = session;
        if (session) this.fetch();
      });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadOptions(): void {
    this.optionsError = '';
    this.optionsService.getFilterOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((options) => {
      this.options = options;
      this.cdr.markForCheck();
    }, (error) => {
      this.optionsError = errorMessageOf(error, "Couldn't load classes.");
      this.cdr.markForCheck();
    });
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.fetch();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.load();
  }

  fetch(): void {
    this.page = 1;
    this.load();
  }

  private load(): void {
    if (!this.session) return;
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.list(this.adminId, this.session, { search: this.search, ...this.filter }, this.page)
      .pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total;
        this.summary = res.summary;
        this.canEdit = Boolean(res.canEdit);
        this.loading = false;
        this.cdr.markForCheck();
      }, (error) => {
        this.rows = [];
        this.loading = false;
        this.loadError = errorMessageOf(error, "Couldn't load admit card structures.");
        this.cdr.markForCheck();
      });
  }

  // ---- Create / Edit ------------------------------------------------------------------------

  private get chosenClass(): FilterClass | undefined {
    return this.options?.classes.find((c) => c._id === this.form.classId);
  }

  get classOptions(): DdOption[] {
    return [{ value: '', label: '-- Select --' }, ...(this.options?.classes || []).map((c) => ({ value: c._id, label: c.label }))];
  }

  get streamDisabled(): boolean {
    return !this.chosenClass?.hasStreams;
  }

  get streamOptions(): DdOption[] {
    const cls = this.chosenClass;
    if (!cls?.hasStreams) return [{ value: '', label: 'N/A' }];
    return cls.streams.map((s) => ({ value: s._id, label: titleCase(s.name) }));
  }

  get groupOptions(): DdOption[] {
    return [{ value: '', label: 'All groups' }, ...(this.formOptions?.groups || []).map((g) => ({ value: g._id, label: g.name }))];
  }

  get groupDisabled(): boolean {
    return !this.form.classId || !(this.formOptions?.groups || []).length;
  }

  get sectionOptions(): DdOption[] {
    const cls = this.chosenClass;
    if (!cls) return [{ value: '', label: 'All sections' }];
    const sections = cls.hasStreams ? (cls.streams.find((s) => s._id === this.form.streamId)?.sections || []) : cls.sections;
    return [{ value: '', label: 'All sections' }, ...sections.map((s) => ({ value: s._id, label: 'Section ' + s.name }))];
  }

  get sectionDisabled(): boolean {
    return !this.form.classId || (this.chosenClass?.hasStreams === true && !this.form.streamId);
  }

  get examOptions(): DdOption[] {
    const names = [...(this.formOptions?.examNames || [])];
    if (this.editing && !names.includes(this.editing.examName)) names.unshift(this.editing.examName);
    return [{ value: '', label: '-- Select --' }, ...names.map((n) => ({ value: n, label: n }))];
  }

  get canSubmit(): boolean {
    return Boolean(this.canEdit && this.form.classId && this.form.examName && this.slots.length && !this.isClick);
  }

  openCreate(): void {
    if (!this.canEdit) return;
    this.editing = null;
    this.form = { classId: '', streamId: '', groupId: '', sectionId: '', examName: '' };
    this.formOptions = null;
    this.slots = [];
    this.resetFormErrors();
    this.modalOpen = true;
  }

  openEdit(row: AdmitStructureRow): void {
    if (!this.canEdit) return;
    this.resetFormErrors();
    this.modalOpen = true;
    this.formOptionsLoading = true;
    this.api.get(this.adminId, row._id).pipe(takeUntil(this.destroyed$)).subscribe((detail) => {
      this.editing = detail;
      this.form = {
        classId: detail.classId, streamId: detail.streamId || '', groupId: detail.groupId || '',
        sectionId: detail.sectionId || '', examName: detail.examName
      };
      this.loadFormOptions(detail);
    }, (error) => {
      this.formOptionsLoading = false;
      this.formError = errorMessageOf(error, "Couldn't load this structure.");
      this.cdr.markForCheck();
    });
  }

  closeModal(): void {
    if (this.isClick) return;
    this.modalOpen = false;
    this.editing = null;
    this.closeSched();
  }

  private resetFormErrors(): void {
    this.formError = '';
    this.formFieldErrors = {};
    this.slotErrors = {};
  }

  onFormClass(classId: string): void {
    const cls = this.options?.classes.find((c) => c._id === classId);
    this.form = {
      classId,
      // A streamed class starts on its first stream, as the reference does.
      streamId: cls?.hasStreams && cls.streams.length ? cls.streams[0]._id : '',
      groupId: '',
      sectionId: '',
      examName: this.form.examName
    };
    this.loadFormOptions(null);
  }

  onFormStream(streamId: string): void {
    this.form = { ...this.form, streamId, groupId: '', sectionId: '' };
    this.loadFormOptions(null);
  }

  onFormGroup(groupId: string): void {
    this.form = { ...this.form, groupId };
    this.loadFormOptions(null);
  }

  /** The scope's subjects + exam names; keeps any date/time already picked for a subject. */
  private loadFormOptions(detail: AdmitStructureDetail | null): void {
    this.formFieldErrors = {};
    if (!this.form.classId) {
      this.formOptions = null;
      this.slots = [];
      this.formOptionsLoading = false;
      this.cdr.markForCheck();
      return;
    }
    this.formOptionsLoading = true;
    this.cdr.markForCheck();
    const previous = new Map(this.slots.map((s) => [s.subjectId, s]));
    this.api.options(this.adminId, this.session, this.form.classId, this.form.streamId, this.form.groupId)
      .pipe(takeUntil(this.destroyed$)).subscribe((options) => {
        this.formOptions = options;
        const saved = new Map((detail?.subjects || []).map((s) => [s.subjectId, s]));
        const stale = new Set(detail?.staleSubjects?.subjectIds || []);
        const slots: SubjectSlot[] = options.subjects.map((s) => {
          const from = saved.get(s.subjectId) || previous.get(s.subjectId);
          return { subjectId: s.subjectId, name: s.name, examDate: from?.examDate || '', startTime: from?.startTime || '', endTime: from?.endTime || '', stale: false };
        });
        // Subjects no longer in the group stay visible and flagged — never silently dropped.
        (detail?.subjects || []).filter((s) => stale.has(s.subjectId)).forEach((s) => slots.push({ ...s, stale: true }));
        this.slots = slots;
        this.formOptionsLoading = false;
        this.cdr.markForCheck();
      }, (error) => {
        this.formOptionsLoading = false;
        this.formError = errorMessageOf(error, "Couldn't load this class's subjects.");
        this.cdr.markForCheck();
      });
  }

  removeStale(slot: SubjectSlot): void {
    this.slots = this.slots.filter((s) => s !== slot);
  }

  slotLabel(slot: SubjectSlot): string {
    if (!slot.examDate) return 'Pick date & time';
    const [y, m, d] = slot.examDate.split('-').map(Number);
    return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y} · ${time12(slot.startTime)} – ${time12(slot.endTime)}`;
  }

  // ---- Schedule popup (the reference's .sched-popup) ------------------------------------------

  openSched(event: MouseEvent, slot: SubjectSlot): void {
    event.stopPropagation();
    if (!this.canEdit) return;
    this.schedSlot = slot;
    this.schedDate = slot.examDate;
    this.schedStart = slot.startTime || '09:00';
    this.schedEnd = slot.endTime || '11:00';
    const base = slot.examDate ? slot.examDate.split('-').map(Number) : null;
    const now = new Date();
    this.calYear = base ? base[0] : now.getFullYear();
    this.calMonth = base ? base[1] - 1 : now.getMonth();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const height = 330;
    const below = window.innerHeight - rect.bottom >= height + 10;
    this.schedPos = {
      top: below ? rect.bottom + 6 : Math.max(10, rect.top - height - 6),
      left: Math.min(rect.left, window.innerWidth - 290)
    };
  }

  closeSched(): void {
    this.schedSlot = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.schedSlot) {
      this.closeSched();
      this.cdr.markForCheck();
    }
  }

  get calTitle(): string {
    return `${MONTHS[this.calMonth]} ${this.calYear}`;
  }

  get calCells(): (CalendarCell | null)[] {
    const first = new Date(this.calYear, this.calMonth, 1).getDay();
    const days = new Date(this.calYear, this.calMonth + 1, 0).getDate();
    const cells: (CalendarCell | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) {
      cells.push({ day: d, key: `${this.calYear}-${String(this.calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    return cells;
  }

  shiftMonth(dir: number): void {
    this.calMonth += dir;
    if (this.calMonth > 11) { this.calMonth = 0; this.calYear++; }
    if (this.calMonth < 0) { this.calMonth = 11; this.calYear--; }
  }

  get schedOrderInvalid(): boolean {
    return Boolean(this.schedStart && this.schedEnd && this.schedStart >= this.schedEnd);
  }

  applySched(): void {
    const slot = this.schedSlot;
    if (!slot) return;
    if (!this.schedDate || this.schedOrderInvalid) return;
    slot.examDate = this.schedDate;
    slot.startTime = this.schedStart;
    slot.endTime = this.schedEnd;
    this.slots = [...this.slots];
    if (this.slotErrors[slot.subjectId]) this.slotErrors = { ...this.slotErrors, [slot.subjectId]: '' };
    this.closeSched();
  }

  // ---- Save --------------------------------------------------------------------------------

  /** Client mirror of the server checks, so obvious slips show inline before a round trip. */
  private checkSlots(): boolean {
    const errors: Record<string, string> = {};
    this.slots.forEach((s) => {
      if (!s.examDate || !s.startTime || !s.endTime) errors[s.subjectId] = 'Set a date and time for every subject in this exam.';
      else if (s.startTime >= s.endTime) errors[s.subjectId] = 'Start time must be before end time.';
    });
    for (let i = 0; i < this.slots.length; i++) {
      for (let j = i + 1; j < this.slots.length; j++) {
        const a = this.slots[i];
        const b = this.slots[j];
        if (a.examDate && a.examDate === b.examDate && a.startTime < b.endTime && b.startTime < a.endTime && !errors[b.subjectId]) {
          errors[b.subjectId] = "Two subjects can't be scheduled at the same time within one exam.";
        }
      }
    }
    this.slotErrors = errors;
    return !Object.keys(errors).length;
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.resetFormErrors();
    if (!this.checkSlots()) return;
    if (this.editing) {
      // Confirm-first (errors.md shape 5/6): an edit regenerates live documents.
      this.ask({
        title: 'Save and regenerate?',
        message: "Saving will regenerate admit cards for every matching student — already-downloaded/printed copies won't reflect this change.",
        confirmLabel: 'Save & Regenerate',
        variant: 'warning'
      }, () => this.save(false));
      return;
    }
    this.save(false);
  }

  private payload(acknowledgeWarnings: boolean): AdmitStructurePayload {
    return {
      ...this.form,
      subjects: this.slots.map((s): ScheduleRow => ({ subjectId: s.subjectId, examDate: s.examDate, startTime: s.startTime, endTime: s.endTime })),
      acknowledgeWarnings,
      ...(this.editing ? { version: this.editing.version } : {})
    };
  }

  private save(acknowledgeWarnings: boolean): void {
    if (this.isClick) return;
    this.isClick = true;
    this.cdr.markForCheck();
    const request = this.editing
      ? this.api.update(this.adminId, this.session, this.editing._id, this.payload(acknowledgeWarnings))
      : this.api.create(this.adminId, this.session, this.payload(acknowledgeWarnings));
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isClick = false;
      this.modalOpen = false;
      this.editing = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
      this.follow(res.jobId);
    }, (error) => {
      this.isClick = false;
      const apiError = toApiError(error);
      if (apiError?.code === 'EXAM_ON_HOLIDAY') {
        this.ask({ title: 'Exam on a holiday', message: apiError.message, confirmLabel: 'Schedule anyway', variant: 'warning' }, () => this.save(true));
      } else {
        this.applySaveErrors(error);
      }
      this.cdr.markForCheck();
    });
  }

  private applySaveErrors(error: unknown): void {
    const invalid = validationErrorsOf(error);
    const slotErrors: Record<string, string> = {};
    const fieldErrors: Record<string, string> = {};
    Object.entries(invalid?.fields || {}).forEach(([field, message]) => {
      const indexed = /^subjects\.(\d+)\./.exec(field);
      const byId = /^subjects\.([0-9a-f]{24})$/.exec(field);
      if (indexed && this.slots[Number(indexed[1])]) slotErrors[this.slots[Number(indexed[1])].subjectId] = message;
      else if (byId) slotErrors[byId[1]] = message;
      else if (field === 'examName') fieldErrors['examName'] = message;
    });
    this.slotErrors = slotErrors;
    this.formFieldErrors = fieldErrors;
    const conflict = toApiError(error)?.fields?.find((f) => f.field === 'examName');
    if (conflict) this.formFieldErrors = { examName: conflict.message };
    this.formError = Object.keys(slotErrors).length || Object.keys(this.formFieldErrors).length ? '' : errorMessageOf(error, "Couldn't save this structure.");
  }

  /** Follows the generation job; the row shows "Generating…" until it reports back. */
  private follow(jobId: string): void {
    if (!jobId) return;
    this.jobs.watch<{ total: number; generated: number; failed: number }>('examination', this.adminId, jobId, 2000)
      .pipe(takeUntil(this.destroyed$)).subscribe((status) => {
        if (status.state === 'completed' || status.state === 'failed') {
          const message = status.state === 'failed'
            ? "Couldn't generate admit cards — save the structure again to retry."
            : (status.error || `Admit cards generated for ${status.result?.generated ?? 0} student(s).`);
          this.snackBar.open(message, 'Close', { duration: 4000 });
          this.load();
        }
      }, () => this.load());
  }

  // ---- Confirm (shared) ----------------------------------------------------------------------

  private ask(config: ConfirmConfig, action: () => void): void {
    this.confirmConfig = config;
    this.confirmAction = action;
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const action = this.confirmAction;
    this.confirmAction = null;
    if (action) action();
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.confirmAction = null;
  }

  // ---- View ----------------------------------------------------------------------------------

  openView(row: AdmitStructureRow): void {
    this.viewDetail = null;
    this.viewError = '';
    this.viewLoading = true;
    this.api.get(this.adminId, row._id).pipe(takeUntil(this.destroyed$)).subscribe((detail) => {
      this.viewDetail = detail;
      this.viewLoading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.viewLoading = false;
      this.viewError = errorMessageOf(error, "Couldn't load this structure.");
      this.cdr.markForCheck();
    });
  }

  get viewOpen(): boolean {
    return this.viewLoading || !!this.viewDetail || !!this.viewError;
  }

  closeView(): void {
    this.viewDetail = null;
    this.viewError = '';
    this.viewLoading = false;
  }

  // ---- Delete --------------------------------------------------------------------------------

  openDelete(row: AdmitStructureRow): void {
    this.deleteRow = row;
    this.confirmText = '';
    this.deleteError = '';
  }

  closeDelete(): void {
    if (this.isClick) return;
    this.deleteRow = null;
  }

  get deleteConfirmed(): boolean {
    return this.confirmText.trim().toUpperCase() === 'DELETE';
  }

  remove(): void {
    const row = this.deleteRow;
    if (!row || !this.deleteConfirmed || this.isClick) return;
    this.isClick = true;
    this.deleteError = '';
    this.cdr.markForCheck();
    this.api.remove(this.adminId, row._id).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isClick = false;
      this.deleteRow = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.load();
    }, (error) => {
      this.isClick = false;
      this.deleteError = errorMessageOf(error, "Couldn't delete this structure.");
      this.cdr.markForCheck();
    });
  }

  trackByRow = (_index: number, row: AdmitStructureRow): string => row._id;
  trackBySlot = (_index: number, slot: SubjectSlot): string => slot.subjectId;
  trackByIndex = (index: number): number => index;
}
