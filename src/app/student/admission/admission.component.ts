/**
 * Admission — new students entering the school this session (admission.md).
 *
 * Reference: docs/schoolzen-planning/v1/student/admission.html
 *
 * An admission IS a Student at an early lifecycle stage: Pending until an Admission No.
 * is issued (which Manage Students' edit form does), Admitted after. So this page shows
 * ALL of this session's admissions by default — the cascade filters only narrow — and the
 * Admission Letter can print only once a number exists.
 *
 * The letter comes from the SHARED letterhead (backend services/pdf/letterhead.service.js
 * → <app-letterhead-document>), the same template every other printable document uses.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { AdmissionService } from 'src/app/shared/services/student/admission.service';
import { ManageStudentsService } from 'src/app/shared/services/student/manage-students.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import {
  CascadeFilterValue, EMPTY_CASCADE, FieldConfigResponse, StudentDetail, StudentFilterOptions, StudentListRow
} from 'src/app/shared/models/student/student.model';
import { AdmissionOverview } from 'src/app/shared/models/student/admission.model';
import { LetterheadDocument } from 'src/app/shared/models/letterhead.model';
import { StudentFormComponent } from 'src/app/shared/components/student-form/student-form.component';
import { LetterheadDocumentComponent } from 'src/app/shared/components/letterhead-document/letterhead-document.component';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';
import { validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';

interface AdmissionRow extends StudentListRow {
  initials: string;
  gradient: string;
}

@Component({
  selector: 'app-admission',
  templateUrl: './admission.component.html',
  styleUrls: ['./admission.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdmissionComponent implements OnInit, OnDestroy {
  @ViewChild(StudentFormComponent) studentForm?: StudentFormComponent;
  @ViewChild(LetterheadDocumentComponent) letterhead?: LetterheadDocumentComponent;

  adminId = '';
  session = '';
  loading = true;
  /** A failed list fetch — rendered distinctly from a genuinely empty result. */
  loadError = '';

  filterOptions: StudentFilterOptions | null = null;
  fieldConfig: FieldConfigResponse | null = null;
  /** A failed class/field-config fetch — never a silently empty dropdown. */
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';
  private search$ = new Subject<string>();

  rows: AdmissionRow[] = [];
  total = 0;
  page = 1;
  limit = 10;
  private cursors: (string | null)[] = [null];
  private nextCursor: string | null = null;

  overview: AdmissionOverview = { admitted: 0, pending: 0 };

  formOpen = false;
  formErrors: Record<string, string> = {};
  formError = '';
  saving = false;
  /** One Idempotency-Key per form-open. */
  private formKey = '';
  /** The row whose letter is being fetched — a second click on it is ignored meanwhile. */
  letterLoadingId: string | null = null;

  viewOpen = false;
  viewDetail: StudentDetail | null = null;

  letterOpen = false;
  letter: LetterheadDocument | null = null;

  private destroyed$ = new Subject<void>();

  constructor(
    private api: AdmissionService,
    private students: ManageStudentsService,
    private optionsService: StudentOptionsService,
    private adminAuthService: AdminAuthService,
    private shellContext: ShellContextService,
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
      this.resetAndFetch();
    });

    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      if (!session) return;
      this.resetAndFetch();
      this.fetchOverview();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  /** Class options + FieldConfig, each with an error state and a retry. */
  loadOptions(): void {
    this.optionsError = '';
    this.optionsService.getFilterOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((options) => {
      this.filterOptions = options;
      this.cdr.markForCheck();
    }, () => {
      this.optionsError = "Couldn't load classes and sections.";
      this.cdr.markForCheck();
    });
    this.optionsService.getFieldConfig(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((config) => {
      this.fieldConfig = config;
      this.cdr.markForCheck();
    }, () => {
      this.optionsError = "Couldn't load the admission form's settings.";
      this.cdr.markForCheck();
    });
  }

  retryOptions(): void {
    this.optionsService.refresh();
    this.loadOptions();
  }

  retryList(): void {
    this.fetchPage();
  }

  // --- list ---------------------------------------------------------------------------

  private resetAndFetch(): void {
    this.page = 1;
    this.cursors = [null];
    this.fetchPage();
  }

  private fetchPage(): void {
    if (!this.session) return;
    this.loading = true;
    this.loadError = '';
    this.api.getAdmissions(this.adminId, {
      session: this.session,
      ...this.filter,
      search: this.search,
      cursor: this.cursors[this.page - 1],
      limit: this.limit
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows.map((row) => ({ ...row, initials: initialsOf(row.name), gradient: avatarGradient(row.studentId) }));
      this.total = res.total;
      this.nextCursor = res.nextCursor;
      this.cursors[this.page] = res.nextCursor;
      this.loading = false;
      this.cdr.markForCheck();
    }, () => {
      this.loading = false;
      this.rows = [];
      this.loadError = "Couldn't load admissions.";
      this.cdr.markForCheck();
    });
  }

  private fetchOverview(): void {
    this.api.getOverview(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.overview = res;
      this.cdr.markForCheck();
    });
  }

  onSearchInput(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.resetAndFetch();
  }

  onPageChange(page: number): void {
    if (page > this.page && !this.nextCursor) return;
    if (this.cursors[page - 1] === undefined) return;
    this.page = page;
    this.fetchPage();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.resetAndFetch();
  }

  trackByRow = (_index: number, row: AdmissionRow): string => row.enrollmentId;

  // --- new admission --------------------------------------------------------------------

  onCreate(): void {
    this.formErrors = {};
    this.formError = '';
    this.formKey = newIdempotencyKey();
    this.formOpen = true;
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  onFormSubmit(): void {
    if (this.saving || !this.studentForm) return;
    const body = this.studentForm.buildPayload();
    if (!body) return;

    this.saving = true;
    this.formErrors = {};
    this.formError = '';
    this.api.createAdmission(body, this.formKey).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.formOpen = false;
      // Saved, but the photo didn't upload (IMAGE_UPLOAD_FAILED) — say so, don't hide it.
      this.snackBar.open(res.warning ? res.warning.message : res.message, 'Close', { duration: res.warning ? 6000 : 3000 });
      this.fetchPage();
      this.fetchOverview();
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.saving = false;
      const validation = validationErrorsOf(error);
      if (validation) {
        this.formErrors = validation.fields;
        this.formError = validation.message;
      }
      this.cdr.markForCheck();
    });
  }

  // --- view / letter --------------------------------------------------------------------

  onView(row: AdmissionRow): void {
    this.students.getStudent(this.adminId, row.studentId, row.session).pipe(takeUntil(this.destroyed$)).subscribe((detail) => {
      this.viewDetail = detail;
      this.viewOpen = true;
      this.cdr.markForCheck();
    });
  }

  closeView(): void {
    this.viewOpen = false;
    this.viewDetail = null;
  }

  /** Pending admissions have no number yet, so there is no letter to print. */
  canPrint(row: AdmissionRow): boolean {
    return row.status === 'admitted' && row.admissionNo !== null;
  }

  onLetter(row: AdmissionRow): void {
    if (!this.canPrint(row) || this.letterLoadingId) return;
    this.letterLoadingId = row.studentId;
    // The letter only opens with a complete document (school header included) — a failed
    // fetch is surfaced by the interceptor and never reaches print() with undefined parts.
    this.api.getLetter(this.adminId, row.studentId).pipe(takeUntil(this.destroyed$)).subscribe((document) => {
      this.letterLoadingId = null;
      this.letter = document;
      this.letterOpen = true;
      this.cdr.markForCheck();
    }, () => {
      this.letterLoadingId = null;
      this.cdr.markForCheck();
    });
  }

  onPrint(): void {
    this.letterhead?.print();
  }

  closeLetter(): void {
    this.letterOpen = false;
    this.letter = null;
  }
}
