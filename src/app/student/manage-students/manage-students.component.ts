/**
 * Manage Students — every enrolled student in the session; the Class → Stream → Group →
 * Section filters only NARROW, they never gate (manage-students.md).
 *
 * Reference: docs/schoolzen-planning/v1/student/manage-students.html
 *
 * Rules this page exists to honour, all easy to undo by accident:
 *   1. No filter = all students. The one exception is Excel Import/Export, whose button stays
 *      disabled until a Class (+Stream for a streamed class) is picked, and whose modal
 *      states that scope.
 *   2. Placement is session-scoped (StudentEnrollment), so the list, the form and the tags
 *      are all read for the session the shell header is showing.
 *   3. Nothing destructive or device-touching fires on a click: Delete types DELETE,
 *      Resync confirms, Assign & Sync waits for the server before closing.
 *   4. The list pages by KEYSET (a cursor stack), never by offset — this is the app's
 *      largest list (performance-principles.md).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ManageStudentsService } from 'src/app/shared/services/student/manage-students.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import {
  CascadeFilterValue, EMPTY_CASCADE, FieldConfigResponse, StudentDetail, StudentFilterOptions, StudentListRow
} from 'src/app/shared/models/student/student.model';
import {
  DeviceSyncResult, ImportResult, ManageStudentsOverview, VERIFY_MODE_OPTIONS
} from 'src/app/shared/models/student/manage-students.model';
import {
  describeClassScope, isClassScopeComplete
} from 'src/app/shared/components/class-cascade-filter/class-cascade-filter.component';
import { StudentFormComponent, StudentFormMode } from 'src/app/shared/components/student-form/student-form.component';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';

/** One table row, precomputed so the template calls no functions per cell. */
interface StudentRow extends StudentListRow {
  initials: string;
  gradient: string;
}

@Component({
  selector: 'app-manage-students',
  templateUrl: './manage-students.component.html',
  styleUrls: ['./manage-students.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageStudentsComponent implements OnInit, OnDestroy {
  @ViewChild(StudentFormComponent) studentForm?: StudentFormComponent;

  adminId = '';
  session = '';
  loading = true;

  filterOptions: StudentFilterOptions | null = null;
  fieldConfig: FieldConfigResponse | null = null;
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';
  private search$ = new Subject<string>();

  rows: StudentRow[] = [];
  total = 0;
  page = 1;
  limit = 10;
  /** cursors[i] = the cursor that fetches page i+1 (page 1's is null). Keyset, not offset. */
  private cursors: (string | null)[] = [null];
  private nextCursor: string | null = null;

  /** Checked rows by studentId — kept across pages so a bulk card list can span them. */
  selected = new Map<string, StudentListRow>();
  overview: ManageStudentsOverview = { totalStudents: 0, cardsAssigned: 0 };

  // Create / Update
  formOpen = false;
  formMode: StudentFormMode = 'create';
  formTitle = 'Create Student';
  formDetail: StudentDetail | null = null;
  formErrors: Record<string, string> = {};
  formError = '';
  saving = false;
  private editingId: string | null = null;

  // View Profile
  viewOpen = false;
  viewDetail: StudentDetail | null = null;

  // Assign Card
  cardOpen = false;
  cardTitle = 'Assign Card';
  cardTargets: StudentListRow[] = [];
  cardNumbers: Record<string, string> = {};
  cardVerifyMode = '4';
  cardSaving = false;
  cardError = '';
  readonly verifyModeOptions: DdOption[] = VERIFY_MODE_OPTIONS.map((option) => ({ ...option }));

  // Excel
  excelOpen = false;
  excelScopeLabel = '';
  exporting = false;
  importing = false;
  importStatus = '';
  importResult: ImportResult | null = null;
  importError = '';

  // Delete / Resync confirmation
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private pending: { action: 'delete'; ids: string[] } | { action: 'resync'; row: StudentListRow } | null = null;

  private destroyed$ = new Subject<void>();

  constructor(
    private api: ManageStudentsService,
    private optionsService: StudentOptionsService,
    private jobs: JobStatusService,
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

    this.optionsService.getFilterOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((options) => {
      this.filterOptions = options;
      this.cdr.markForCheck();
    });
    this.optionsService.getFieldConfig(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((config) => {
      this.fieldConfig = config;
      this.cdr.markForCheck();
    });

    // Debounced: a keystroke must not refetch a 2M-row list (performance-principles.md).
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.resetAndFetch();
    });

    // The session the header shows drives every read — the first load and every switch.
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      if (!session) return;
      this.selected.clear();
      this.resetAndFetch();
      this.fetchOverview();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
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
    this.api.getStudents(this.adminId, {
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
      this.cdr.markForCheck();
    });
  }

  private fetchOverview(): void {
    this.api.getOverview(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.overview = res;
      this.cdr.markForCheck();
    });
  }

  private refresh(): void {
    this.fetchPage();
    this.fetchOverview();
  }

  onSearchInput(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.resetAndFetch();
  }

  /** Prev/next only — the cursor for the requested page is always already known. */
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

  /** Excel is the one scope-gated action: a class, plus its stream if it has streams. */
  get excelEnabled(): boolean {
    return isClassScopeComplete(this.filterOptions, this.filter);
  }

  trackByRow = (_index: number, row: StudentRow): string => row.enrollmentId;
  trackByTarget = (_index: number, row: StudentListRow): string => row.studentId;

  // --- selection ------------------------------------------------------------------------

  isSelected(row: StudentListRow): boolean {
    return this.selected.has(row.studentId);
  }

  toggleRow(row: StudentListRow): void {
    if (this.selected.has(row.studentId)) this.selected.delete(row.studentId);
    else this.selected.set(row.studentId, row);
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row.studentId));
  }

  toggleAll(): void {
    const selectAll = !this.allSelected;
    this.rows.forEach((row) => {
      if (selectAll) this.selected.set(row.studentId, row);
      else this.selected.delete(row.studentId);
    });
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  // --- view -----------------------------------------------------------------------------

  onView(row: StudentListRow): void {
    this.api.getStudent(this.adminId, row.studentId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((detail) => {
      this.viewDetail = detail;
      this.viewOpen = true;
      this.cdr.markForCheck();
    });
  }

  closeView(): void {
    this.viewOpen = false;
    this.viewDetail = null;
  }

  // --- create / update ------------------------------------------------------------------

  onCreate(): void {
    this.formMode = 'create';
    this.formTitle = 'Create Student';
    this.formDetail = null;
    this.editingId = null;
    this.clearFormErrors();
    this.formOpen = true;
  }

  onEdit(row: StudentListRow): void {
    this.api.getStudent(this.adminId, row.studentId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((detail) => {
      this.formMode = 'edit';
      this.formTitle = 'Update Student';
      this.formDetail = detail;
      this.editingId = row.studentId;
      this.clearFormErrors();
      this.formOpen = true;
      this.cdr.markForCheck();
    });
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
    this.clearFormErrors();
    const request = this.editingId
      ? this.api.updateStudent(this.editingId, body)
      : this.api.createStudent(body);

    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.formOpen = false;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.refresh();
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.saving = false;
      const validation = validationErrorsOf(error);
      if (validation) {
        this.formErrors = validation.fields;
        // The modal always says something was rejected, even for a field it has no slot for.
        this.formError = validation.message;
      }
      this.cdr.markForCheck();
    });
  }

  private clearFormErrors(): void {
    this.formErrors = {};
    this.formError = '';
  }

  // --- assign card ----------------------------------------------------------------------

  onAssignCard(row: StudentListRow): void {
    this.openCardModal([row]);
  }

  onAssignCardSelected(): void {
    if (!this.selected.size) return;
    this.openCardModal(Array.from(this.selected.values()));
  }

  private openCardModal(targets: StudentListRow[]): void {
    this.cardTargets = targets;
    this.cardNumbers = {};
    this.cardVerifyMode = '4';
    this.cardError = '';
    this.cardSaving = false;
    this.cardTitle = targets.length === 1 ? 'Assign Card — ' + targets[0].name : `Assign Card — ${targets.length} selected`;
    this.cardOpen = true;
  }

  onCardInput(studentId: string, value: string): void {
    this.cardNumbers = { ...this.cardNumbers, [studentId]: value.trim() };
  }

  get cardSubmitDisabled(): boolean {
    return this.cardSaving || this.cardTargets.some((row) => !this.cardNumbers[row.studentId]);
  }

  /**
   * Saves the cards, then waits for the device-sync job before closing — a card
   * assignment is consequential, so the modal never claims success the devices haven't
   * confirmed (performance-principles.md, optimistic updates).
   */
  onCardSubmit(): void {
    if (this.cardSubmitDisabled) return;
    this.cardSaving = true;
    this.cardError = '';

    this.api.assignCards({
      adminId: this.adminId,
      verifyMode: Number(this.cardVerifyMode),
      items: this.cardTargets.map((row) => ({ studentId: row.studentId, cardNumber: this.cardNumbers[row.studentId] }))
    }).pipe(takeUntil(this.destroyed$)).subscribe((queued) => {
      this.jobs.watch<DeviceSyncResult>('student', this.adminId, queued.jobId)
        .pipe(takeUntil(this.destroyed$))
        .subscribe((status) => {
          if (status.state === 'completed') {
            const failed = status.result?.failed || [];
            this.cardSaving = false;
            if (failed.length) {
              this.cardError = `Saved, but ${failed.length} could not reach the devices: `
                + failed.map((item) => item.name).join(', ') + '. Use Resync once the device is online.';
            } else {
              this.cardOpen = false;
              this.snackBar.open(queued.message, 'Close', { duration: 3000 });
            }
            this.refresh();
          } else if (status.state === 'failed') {
            this.cardSaving = false;
            this.cardError = 'Cards were saved, but the device sync failed. Use Resync to try again.';
            this.refresh();
          }
          this.cdr.markForCheck();
        }, () => {
          this.cardSaving = false;
          this.cdr.markForCheck();
        });
    }, (error: unknown) => {
      this.cardSaving = false;
      this.cardError = validationErrorsOf(error)?.message || errorMessageOf(error, '');
      this.cdr.markForCheck();
    });
  }

  // --- resync / delete (confirmed first) -------------------------------------------------

  onResync(row: StudentListRow): void {
    if (!row.card) {
      this.snackBar.open('This student has no card yet — use Assign Card first.', 'Close', { duration: 3000 });
      return;
    }
    this.pending = { action: 'resync', row };
    this.confirmConfig = {
      title: 'Resync ' + row.name + '?',
      message: "Pushes this person's card and fingerprint back down to every biometric device.",
      confirmLabel: 'Resync',
      variant: 'neutral'
    };
    this.confirmOpen = true;
  }

  onDelete(row: StudentListRow): void {
    this.openDeleteConfirm([row.studentId], 'Delete Student');
  }

  onDeleteSelected(): void {
    if (!this.selected.size) return;
    this.openDeleteConfirm(Array.from(this.selected.keys()), `Delete ${this.selected.size} Student(s)`);
  }

  private openDeleteConfirm(ids: string[], title: string): void {
    this.pending = { action: 'delete', ids };
    this.confirmConfig = {
      title,
      message: 'This also removes their login access, fee records, admit cards, and results. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE'
    };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    if (pending.action === 'resync') {
      this.api.resyncCard(this.adminId, pending.row.studentId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
      });
      return;
    }

    this.api.bulkDelete(this.adminId, pending.ids).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      pending.ids.forEach((id) => this.selected.delete(id));
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.resetAndFetch();
      this.fetchOverview();
    });
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.pending = null;
  }

  // --- Excel ----------------------------------------------------------------------------

  onOpenExcel(): void {
    if (!this.excelEnabled) return;
    this.excelScopeLabel = describeClassScope(this.filterOptions, this.filter);
    this.importStatus = '';
    this.importResult = null;
    this.importError = '';
    this.excelOpen = true;
  }

  closeExcel(): void {
    this.excelOpen = false;
  }

  onExport(): void {
    if (this.exporting || !this.excelEnabled) return;
    this.exporting = true;
    this.api.exportExcel(this.adminId, { session: this.session, classId: this.filter.classId, streamId: this.filter.streamId })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `students-${this.excelScopeLabel.replace(/[^\w]+/g, '-')}-${this.session}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
        this.exporting = false;
        this.cdr.markForCheck();
      }, () => {
        this.exporting = false;
        this.cdr.markForCheck();
      });
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || this.importing) return;
    if (!/\.xlsx$/i.test(file.name)) {
      this.importError = 'Choose an Excel (.xlsx) file.';
      return;
    }

    const body = new FormData();
    body.append('adminId', this.adminId);
    body.append('session', this.session);
    body.append('classId', this.filter.classId);
    if (this.filter.streamId) body.append('streamId', this.filter.streamId);
    body.append('file', file, file.name);

    this.importing = true;
    this.importError = '';
    this.importResult = null;
    this.importStatus = 'Uploading…';

    this.api.importExcel(body).pipe(takeUntil(this.destroyed$)).subscribe((queued) => {
      this.importStatus = 'Importing — you can keep working while it runs.';
      this.cdr.markForCheck();
      this.jobs.watch<ImportResult>('student', this.adminId, queued.jobId).pipe(takeUntil(this.destroyed$)).subscribe((status) => {
        if (status.state === 'completed') {
          this.importing = false;
          this.importStatus = '';
          this.importResult = status.result;
          this.refresh();
        } else if (status.state === 'failed') {
          this.importing = false;
          this.importStatus = '';
          this.importError = status.error || 'The import could not be completed.';
        }
        this.cdr.markForCheck();
      }, () => {
        this.importing = false;
        this.importStatus = '';
        this.cdr.markForCheck();
      });
    }, (error: unknown) => {
      this.importing = false;
      this.importStatus = '';
      this.importError = validationErrorsOf(error)?.fields['file'] || errorMessageOf(error, 'The file could not be imported.');
      this.cdr.markForCheck();
    });
  }
}
