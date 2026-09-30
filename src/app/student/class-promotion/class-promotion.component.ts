/**
 * Class Promotion — year-end Promote/Detain for one class, creating NEXT-session
 * placements. The current session's records are never touched (class-promotion.md).
 *
 * Reference: docs/schoolzen-planning/v1/student/class-promotion.html
 *
 * Rules this page exists to honour:
 *   1. Exactly one decision per row (Promote or Detain), or none ("Not decided" rows are
 *      skipped, and the confirm modal says so).
 *   2. Detain disables that row's Promote To dropdown, relabels it "<class> (repeats)" and
 *      tints the row — a detained student repeats their own class next session.
 *   3. The promote strip applies its target only to rows CURRENTLY marked Promote; every
 *      row stays individually overridable.
 *   4. Confirm shows a server-computed preview: the 3 counts, what happens automatically,
 *      and the non-blocking warnings (Stream + Subject Group missing, Fee Structure
 *      missing) — surfaced, never silent, never blocking. The button names the exact count.
 *   5. Confirm enqueues a background job; the page follows it and refreshes when done.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap, takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ClassPromotionService } from 'src/app/shared/services/student/class-promotion.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import {
  CascadeFilterValue, EMPTY_CASCADE, StudentFilterOptions
} from 'src/app/shared/models/student/student.model';
import {
  ExamResult, PromotionDecision, PromotionPreview, PromotionRequest, PromotionResult, PromotionRoster,
  PromotionRosterRow, PromotionTargetOption, PromotionWarning
} from 'src/app/shared/models/student/class-promotion.model';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';

/** Each warning type keeps its own icon, so three different warnings never read as one. */
const WARNING_ICON: Record<PromotionWarning['type'], string> = {
  'stream-missing': 'diagram-3',
  'fee-structure-missing': 'wallet2',
  'already-placed': 'person-check'
};

/** One row's view model — decision state lives here, keyed by enrollmentId. */
interface PromotionRow extends PromotionRosterRow {
  initials: string;
  gradient: string;
  decision: PromotionDecision | null;
  targetKey: string;
  resultLabel: string;
  resultClass: string;
  searchText: string;
}

const RESULT_LABEL: Record<ExamResult, { label: string; css: string }> = {
  pass: { label: 'Pass', css: 'tag-success' },
  fail: { label: 'Fail', css: 'tag-danger' },
  'not-set': { label: 'Not Set', css: 'tag-muted' }
};

@Component({
  selector: 'app-class-promotion',
  templateUrl: './class-promotion.component.html',
  styleUrls: ['./class-promotion.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClassPromotionComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  loading = false;
  /** A failed roster fetch — distinct from a class with no students. */
  loadError = '';
  /** A failed class-list fetch — never a silently empty class dropdown. */
  optionsError = '';

  filterOptions: StudentFilterOptions | null = null;
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';

  roster: PromotionRoster | null = null;
  /** Every row of the class, and the searched subset the table shows. */
  private allRows: PromotionRow[] = [];
  rows: PromotionRow[] = [];

  targetOptions: DdOption[] = [];
  private targetByKey = new Map<string, PromotionTargetOption>();
  bulkTargetKey = '';

  counts = { promoting: 0, detaining: 0, notDecided: 0 };

  confirmOpen = false;
  preview: PromotionPreview | null = null;
  /** Double-submit guards: one preview and one confirm in flight at a time. */
  previewing = false;
  confirming = false;
  jobRunning = false;

  /** Roster requests — switchMapped, so only the latest class's response ever lands. */
  private roster$ = new Subject<{ session: string } & CascadeFilterValue>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: ClassPromotionService,
    private optionsService: StudentOptionsService,
    private jobs: JobStatusService,
    private adminAuthService: AdminAuthService,
    private shellContext: ShellContextService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) return;

    // switchMap: a quick class/section change cancels the stale roster request instead of
    // racing it, so a slow earlier response can never overwrite the class now selected.
    this.roster$.pipe(
      switchMap((query) => this.api.getRoster(this.adminId, query).pipe(
        map((roster): PromotionRoster | null => roster),
        catchError(() => of(null))
      )),
      takeUntil(this.destroyed$)
    ).subscribe((roster) => (roster ? this.applyRoster(roster) : this.rosterFailed()));

    this.loadOptions();

    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      this.fetchRoster();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  get currentClassLabel(): string {
    return this.roster?.currentClass.label || '';
  }

  get repeatsLabel(): string {
    return this.currentClassLabel + ' (repeats)';
  }

  /** "Confirm Promotion for 40" — every decided row, Promote and Detain alike. */
  get decidedCount(): number {
    return this.counts.promoting + this.counts.detaining;
  }

  // --- roster -----------------------------------------------------------------------------

  loadOptions(): void {
    this.optionsError = '';
    this.optionsService.getFilterOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((options) => {
      this.filterOptions = options;
      // The page works on ONE class at a time; start on the first configured one, like the
      // reference's pre-selected class.
      if (!this.filter.classId && options.classes.length) {
        this.filter = { ...EMPTY_CASCADE, classId: options.classes[0]._id };
      }
      this.fetchRoster();
      this.cdr.markForCheck();
    }, () => {
      this.optionsError = "Couldn't load classes.";
      this.cdr.markForCheck();
    });
  }

  retryOptions(): void {
    this.optionsService.refresh();
    this.loadOptions();
  }

  retryRoster(): void {
    this.fetchRoster();
  }

  private fetchRoster(): void {
    if (!this.session || !this.filter.classId) return;
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.roster$.next({ session: this.session, ...this.filter });
  }

  private applyRoster(roster: PromotionRoster): void {
    this.roster = roster;
    this.targetByKey = new Map(roster.targetOptions.map((option) => [option.key, option]));
    this.targetOptions = roster.targetOptions.map((option) => ({ value: option.key, label: option.label }));
    this.bulkTargetKey = roster.defaultTargetKey || '';
    this.allRows = roster.rows.map((row) => ({
      ...row,
      initials: initialsOf(row.name),
      gradient: avatarGradient(row.studentId),
      decision: null,
      targetKey: roster.defaultTargetKey || '',
      resultLabel: RESULT_LABEL[row.examResult].label,
      resultClass: RESULT_LABEL[row.examResult].css,
      searchText: [row.name, row.rollNumber, row.admissionNo].join(' ').toLowerCase()
    }));
    this.applySearch();
    this.recount();
    this.loading = false;
    this.cdr.markForCheck();
  }

  private rosterFailed(): void {
    this.loading = false;
    this.roster = null;
    this.allRows = [];
    this.rows = [];
    this.recount();
    this.loadError = "Couldn't load this class's students.";
    this.cdr.markForCheck();
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.fetchRoster();
  }

  /** The roster is one class (a bounded list), so search filters it in memory. */
  onSearchInput(value: string): void {
    this.search = value.trim().toLowerCase();
    this.applySearch();
  }

  private applySearch(): void {
    this.rows = this.search
      ? this.allRows.filter((row) => row.searchText.includes(this.search))
      : this.allRows;
  }

  private recount(): void {
    let promoting = 0;
    let detaining = 0;
    this.allRows.forEach((row) => {
      if (row.decision === 'promote') promoting += 1;
      else if (row.decision === 'detain') detaining += 1;
    });
    this.counts = { promoting, detaining, notDecided: this.allRows.length - promoting - detaining };
  }

  trackByRow = (_index: number, row: PromotionRow): string => row.enrollmentId;

  // --- decisions -------------------------------------------------------------------------

  /** Exactly one active — clicking the active one again clears the row back to undecided. */
  setDecision(row: PromotionRow, decision: PromotionDecision): void {
    if (row.alreadyPlaced) return;
    row.decision = row.decision === decision ? null : decision;
    this.recount();
  }

  setTarget(row: PromotionRow, key: string): void {
    row.targetKey = key;
  }

  /** The promote strip: only rows currently marked Promote take the bulk target. */
  onBulkTarget(key: string): void {
    this.bulkTargetKey = key;
    this.allRows.forEach((row) => {
      if (row.decision === 'promote') row.targetKey = key;
    });
  }

  // --- confirm ---------------------------------------------------------------------------

  private buildRequest(): PromotionRequest {
    const decisions = this.allRows
      .filter((row) => row.decision)
      .map((row) => {
        if (row.decision === 'detain') return { enrollmentId: row.enrollmentId, decision: 'detain' as const };
        const target = this.targetByKey.get(row.targetKey);
        return {
          enrollmentId: row.enrollmentId,
          decision: 'promote' as const,
          target: {
            classId: target ? target.classId : '',
            streamId: target?.streamId || null,
            groupId: null,
            sectionId: target?.sectionId || null
          }
        };
      });
    return {
      adminId: this.adminId,
      session: this.session,
      classId: this.filter.classId,
      streamId: this.filter.streamId || undefined,
      groupId: this.filter.groupId || undefined,
      sectionId: this.filter.sectionId || undefined,
      decisions
    };
  }

  /** A Promote row with no target can't be sent — every promoted student needs somewhere to go. */
  get missingTargets(): number {
    return this.allRows.filter((row) => row.decision === 'promote' && !this.targetByKey.has(row.targetKey)).length;
  }

  onOpenConfirm(): void {
    if (!this.decidedCount || this.jobRunning) {
      if (!this.decidedCount) this.snackBar.open('Mark at least one student as Promote or Detain first.', 'Close', { duration: 3000 });
      return;
    }
    if (this.missingTargets) {
      this.snackBar.open(`Choose a Promote To class for ${this.missingTargets} student(s) first.`, 'Close', { duration: 3000 });
      return;
    }
    if (this.previewing) return;
    this.previewing = true;
    this.api.preview(this.buildRequest()).pipe(takeUntil(this.destroyed$)).subscribe((preview) => {
      this.previewing = false;
      this.preview = preview;
      this.confirmOpen = true;
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.previewing = false;
      // A rule only the server can apply (PROMOTION_LIMIT, a target that isn't higher) comes
      // back as a ValidationError, which the interceptor leaves to the page.
      if (validationErrorsOf(error)) {
        this.snackBar.open(errorMessageOf(error, 'This promotion plan could not be checked.'), 'Close', { duration: 5000 });
      }
      this.cdr.markForCheck();
    });
  }

  /** Distinct treatment per warning type — never collapsed into one generic banner. */
  warningIcon(type: PromotionWarning['type']): string {
    return WARNING_ICON[type] || 'exclamation-triangle';
  }

  closeConfirm(): void {
    this.confirmOpen = false;
    this.preview = null;
  }

  onConfirm(): void {
    if (this.confirming) return;
    this.confirming = true;
    this.api.confirm(this.buildRequest()).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.confirming = false;
      this.confirmOpen = false;
      this.jobRunning = true;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.cdr.markForCheck();

      this.jobs.watch<PromotionResult>('student', this.adminId, res.jobId).pipe(takeUntil(this.destroyed$)).subscribe((status) => {
        if (status.state === 'completed' && status.result) {
          this.jobRunning = false;
          const result = status.result;
          this.snackBar.open(
            `${result.toSession} placements created: ${result.promoted} promoted, ${result.detained} detained`
              + (result.skipped ? `, ${result.skipped} already placed` : '') + '.',
            'Close',
            { duration: 5000 }
          );
          this.fetchRoster();
        } else if (status.state === 'failed') {
          this.jobRunning = false;
          this.snackBar.open(status.error || 'The promotion could not be completed.', 'Close', { duration: 5000 });
          this.fetchRoster();
        }
        this.cdr.markForCheck();
      }, () => {
        this.jobRunning = false;
        this.cdr.markForCheck();
      });
    }, (error: unknown) => {
      this.confirming = false;
      this.snackBar.open(errorMessageOf(error, 'The promotion could not be started.'), 'Close', { duration: 4000 });
      this.cdr.markForCheck();
    });
  }
}
