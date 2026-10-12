/**
 * Examination › Marksheet Structure — EVERY Class(+Stream) is shown, always (an
 * existence-based grid); the ones still empty get set up from here.
 *
 * Reference: docs/schoolzen-planning/v1/examination/marksheet-structure.html (+ .md, errors.md)
 *
 * Toolbar: one row (Class, Stream) that only narrows the grid client-side — the grid is
 * small and bounded (one row per class/stream). The template is Settings' (Marksheet
 * Templates); here the admin picks which subjects are marked and their Theory/Practical max
 * — with no hardcoded 100 ceiling (errors.md shape 1). Set up / remove need the
 * 'marksheet-structure' edit grant (`canEdit` from the API, which enforces it anyway).
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { MarksheetStructureService } from 'src/app/shared/services/examination/marksheet-structure.service';
import {
  MarksheetSetup, MarksheetSetupSubject, MarksheetStructureRow
} from 'src/app/shared/models/examination/examination.model';
import { CascadeFilterValue, EMPTY_CASCADE, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { errorMessageOf, toApiError, validationErrorsOf } from 'src/app/shared/utils/api-error.util';

const MAX_LIMIT = 1000;
const DEFAULT_PRACTICAL_MAX = 20;

interface MaxDraft {
  theory: string;
  practical: string;
}

@Component({
  selector: 'app-marksheet-structure',
  templateUrl: './marksheet-structure.component.html',
  styleUrls: ['./marksheet-structure.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarksheetStructureComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  options: StudentFilterOptions | null = null;
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };

  rows: MarksheetStructureRow[] = [];
  summary = { classesTotal: 0, setUp: 0 };
  canEdit = false;
  loading = true;
  loadError = '';

  // Set Up / Edit modal
  setupRow: MarksheetStructureRow | null = null;
  setup: MarksheetSetup | null = null;
  setupLoading = false;
  setupError = '';
  theoryChecked = new Set<string>();
  practicalChecked = new Set<string>();
  maxes: Record<string, MaxDraft> = {};
  fieldErrors: Record<string, string> = {};
  saveError = '';
  isClick = false;

  // Remove
  removeRow: MarksheetStructureRow | null = null;
  confirmText = '';
  removeError = '';

  private destroyed$ = new Subject<void>();

  constructor(
    private api: MarksheetStructureService,
    private optionsService: StudentOptionsService,
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

  fetch(): void {
    if (!this.session) return;
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.list(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.summary = res.summary;
      this.canEdit = Boolean(res.canEdit);
      this.loading = false;
      this.cdr.markForCheck();
    }, (error) => {
      // A failed fetch is said out loud — never rendered as "no classes".
      this.rows = [];
      this.loading = false;
      this.loadError = errorMessageOf(error, "Couldn't load marksheet structures.");
      this.cdr.markForCheck();
    });
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
  }

  /** Filters only narrow — every class(+stream) is always in `rows`. */
  get visibleRows(): MarksheetStructureRow[] {
    return this.rows.filter((row) => (!this.filter.classId || row.classId === this.filter.classId)
      && (!this.filter.streamId || row.streamId === this.filter.streamId));
  }

  labelOf(row: MarksheetStructureRow): string {
    return [row.className, row.streamName].filter(Boolean).join(' ');
  }

  // ---- Set Up / Edit -------------------------------------------------------------------------

  openSetup(row: MarksheetStructureRow): void {
    this.setupRow = row;
    this.setup = null;
    this.setupError = '';
    this.saveError = '';
    this.fieldErrors = {};
    this.setupLoading = true;
    this.cdr.markForCheck();
    this.api.setup(this.adminId, this.session, row.classId, row.streamId).pipe(takeUntil(this.destroyed$)).subscribe((setup) => {
      this.setup = setup;
      this.seedDraft(setup);
      this.setupLoading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.setupLoading = false;
      this.setupError = errorMessageOf(error, "Couldn't load this class's structure.");
      this.cdr.markForCheck();
    });
  }

  /** Saved choices, or — first time — every subject as theory at the template's max. */
  private seedDraft(setup: MarksheetSetup): void {
    this.theoryChecked = new Set<string>();
    this.practicalChecked = new Set<string>();
    this.maxes = {};
    const theoryDefault = setup.template ? String(setup.template.theoryMax) : '';
    const practicalDefault = String(setup.template?.practicalMax ?? DEFAULT_PRACTICAL_MAX);
    const saved = new Map(setup.subjects.map((s) => [s.subjectId, s]));
    setup.candidates.forEach((c) => {
      const s = saved.get(c.subjectId);
      if (setup.subjects.length) {
        if (s?.theoryMax != null) this.theoryChecked.add(c.subjectId);
        if (s?.practicalMax != null) this.practicalChecked.add(c.subjectId);
      } else {
        this.theoryChecked.add(c.subjectId);
      }
      this.maxes[c.subjectId] = {
        theory: s?.theoryMax != null ? String(s.theoryMax) : theoryDefault,
        practical: s?.practicalMax != null ? String(s.practicalMax) : practicalDefault
      };
    });
  }

  closeSetup(): void {
    if (this.isClick) return;
    this.setupRow = null;
    this.setup = null;
  }

  toggle(kind: 'theory' | 'practical', subjectId: string, checked: boolean): void {
    const set = kind === 'theory' ? this.theoryChecked : this.practicalChecked;
    if (checked) set.add(subjectId);
    else set.delete(subjectId);
    this.fieldErrors = {};
  }

  /** The marks table: every subject ticked under Theory or Practical, in candidate order. */
  get markRows(): { subjectId: string; name: string }[] {
    return (this.setup?.candidates || []).filter((c) => this.theoryChecked.has(c.subjectId) || this.practicalChecked.has(c.subjectId));
  }

  setMax(subjectId: string, part: 'theory' | 'practical', value: string): void {
    this.maxes[subjectId] = { ...this.maxes[subjectId], [part]: value };
    const key = `${subjectId}.${part}`;
    if (this.fieldErrors[key]) this.fieldErrors = { ...this.fieldErrors, [key]: '' };
  }

  get canSubmit(): boolean {
    return Boolean(this.canEdit && this.setup && !this.setup.notConfigured && this.markRows.length && !this.isClick);
  }

  private isValidMax(value: string): boolean {
    const n = Number(value);
    return value.trim() !== '' && Number.isInteger(n) && n > 0 && n <= MAX_LIMIT;
  }

  submit(): void {
    const setup = this.setup;
    const row = this.setupRow;
    if (!setup || !row || !this.canSubmit) return;
    const payload: MarksheetSetupSubject[] = [];
    const errors: Record<string, string> = {};
    this.markRows.forEach((r) => {
      const draft = this.maxes[r.subjectId] || { theory: '', practical: '' };
      const theory = this.theoryChecked.has(r.subjectId);
      const practical = this.practicalChecked.has(r.subjectId);
      if (theory && !this.isValidMax(draft.theory)) errors[`${r.subjectId}.theory`] = 'Enter a valid maximum for this subject.';
      if (practical && !this.isValidMax(draft.practical)) errors[`${r.subjectId}.practical`] = 'Enter a valid maximum for this subject.';
      payload.push({
        subjectId: r.subjectId,
        theoryMax: theory ? Number(draft.theory) : null,
        practicalMax: practical ? Number(draft.practical) : null
      });
    });
    this.fieldErrors = errors;
    if (Object.keys(errors).length) return;

    this.isClick = true;
    this.saveError = '';
    this.cdr.markForCheck();
    this.api.save(this.adminId, this.session, row.classId, row.streamId, setup.version, payload)
      .pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.isClick = false;
        this.setupRow = null;
        this.setup = null;
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.fetch();
      }, (error) => {
        this.isClick = false;
        const apiError = toApiError(error);
        const invalid = validationErrorsOf(error);
        if (invalid && Object.keys(invalid.fields).length) {
          // "subjects.3.theoryMax" → the 4th payload row's subject.
          const mapped: Record<string, string> = {};
          Object.entries(invalid.fields).forEach(([field, message]) => {
            const match = /^subjects\.(\d+)\.(theoryMax|practicalMax)$/.exec(field);
            const subject = match ? payload[Number(match[1])] : null;
            if (subject) mapped[`${subject.subjectId}.${match![2] === 'theoryMax' ? 'theory' : 'practical'}`] = message;
          });
          this.fieldErrors = mapped;
          this.saveError = Object.keys(mapped).length ? '' : invalid.message;
        } else {
          this.saveError = errorMessageOf(error, "Couldn't save this structure.");
        }
        // Changed by someone else (or the template was reassigned): reload what's current.
        if (apiError?.code === 'STRUCTURE_CHANGED') this.reloadSetup(row);
        this.cdr.markForCheck();
      });
  }

  private reloadSetup(row: MarksheetStructureRow): void {
    this.api.setup(this.adminId, this.session, row.classId, row.streamId).pipe(takeUntil(this.destroyed$)).subscribe((setup) => {
      this.setup = setup;
      this.seedDraft(setup);
      this.cdr.markForCheck();
    });
  }

  // ---- Remove -------------------------------------------------------------------------------

  openRemove(row: MarksheetStructureRow): void {
    this.removeRow = row;
    this.confirmText = '';
    this.removeError = '';
  }

  closeRemove(): void {
    if (this.isClick) return;
    this.removeRow = null;
  }

  get removeConfirmed(): boolean {
    return this.confirmText.trim().toUpperCase() === 'DELETE';
  }

  remove(): void {
    const row = this.removeRow;
    if (!row || !this.removeConfirmed || this.isClick) return;
    this.isClick = true;
    this.removeError = '';
    this.cdr.markForCheck();
    this.api.remove(this.adminId, this.session, row.classId, row.streamId, row.version).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isClick = false;
      this.removeRow = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error) => {
      this.isClick = false;
      this.removeError = errorMessageOf(error, "Couldn't remove this setup.");
      this.cdr.markForCheck();
    });
  }

  trackByRow = (_index: number, row: MarksheetStructureRow): string => `${row.classId}|${row.streamId || ''}`;
  trackBySubject = (_index: number, row: { subjectId: string }): string => row.subjectId;
}
