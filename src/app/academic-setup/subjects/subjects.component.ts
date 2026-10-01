/**
 * Subjects — the school's flat Core/Elective master list, and the pool Subject Groups picks
 * from.
 *
 * Reference: docs/schoolzen-planning/v1/academic-setup/subjects.html
 *
 * Same construction as its Classes & Sections sibling: the template is the reference's own
 * markup with bindings layered on, and every class it uses comes from the global design
 * system. One toolbar row, because this page has no filters — not the two-row shape Subject
 * Groups needs. Forcing one page's row-split onto another is the specific mistake
 * design-system.md calls out.
 *
 * Deleting is what makes this page consequential: a subject removed here is a subject every
 * Subject Group that included it has lost, which is why the confirmation says so and the
 * server refuses without an explicit confirmation flag. Deactivating is the softer option
 * and it already exists as a status — that is why there is no soft-delete here.
 *
 * Unlike Classes & Sections, the list is SERVER-paged and SERVER-searched: a school runs
 * fifteen classes but can run a hundred subjects, and the side card's counts come from the
 * same aggregation as the rows, so the card can never disagree with the table.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject as RxSubject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { SubjectsService } from 'src/app/shared/services/academic-setup/subjects.service';
import {
  Subject, SubjectFormValue, SubjectPayload, SubjectSummary
} from 'src/app/shared/models/academic-setup/subject.model';
import { BulkDeleteResult, BulkOutcomeLine } from 'src/app/shared/models/academic-setup/bulk-delete.model';
import { bulkDeleteOutcome, countOf } from 'src/app/shared/utils/academic-setup-bulk-delete.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { inlineFormErrors } from 'src/app/shared/utils/academic-setup-errors.util';

/**
 * A subject's dependents are the Subject Groups that include it. The typed-DELETE confirm
 * sends `confirmed: true`, so the server deletes it AND removes it from those groups in one
 * transaction — the count is a named consequence shown upfront, not a block.
 */
const usedInMessage = (count: number): string =>
  'Used in ' + countOf(count, 'subject group') + ' — deleting removes it from ' + (count === 1 ? 'that group.' : 'those groups.');

const EMPTY_FORM: SubjectFormValue = {
  id: null,
  name: '',
  type: 'core',
  status: 'active'
};

/** The fields this modal renders a message slot for; anything else lands on formError. */
const KNOWN_FIELDS: readonly string[] = ['name', 'type', 'status'];

@Component({
  selector: 'app-subjects',
  templateUrl: './subjects.component.html',
  styleUrls: ['./subjects.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubjectsComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  /** A failed list fetch — rendered distinctly from a genuinely empty result, with a retry. */
  loadError = '';
  search = '';

  rows: Subject[] = [];
  /**
   * Every row seen on any page, by id: a selection survives paging, so the delete
   * confirmation needs the name and blockingCount of rows no longer on screen.
   */
  private known = new Map<string, Subject>();
  page = 1;
  limit = 10;
  total = 0;
  summary: SubjectSummary = { total: 0, core: 0, elective: 0, inactive: 0 };

  /**
   * Checked rows, by id. A Set, not an array scan — O(1) per row render.
   *
   * A selection survives paging, because the list is server-paged and someone selecting
   * across two pages means it. Deleted ids are removed when the delete succeeds, so a
   * stale id can never re-arm "Delete Selected".
   */
  selected = new Set<string>();

  readonly typeOptions: readonly DdOption[] = [
    { value: 'core', label: 'Core' },
    { value: 'elective', label: 'Elective' }
  ];
  readonly statusOptions: readonly DdOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];

  formOpen = false;
  saving = false;
  formTitle = 'Add Subject';
  form: SubjectFormValue = { ...EMPTY_FORM };
  fieldErrors: Record<string, string> = {};
  formError = '';
  /** One Idempotency-Key per modal-open, reused by every retry of that same submission. */
  private formKey = '';

  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteIds: string[] = [];
  /** Double-submit guard for the delete itself. */
  deleting = false;

  /** Per-row outcome of a delete that did not remove every requested row. */
  bulkResultOpen = false;
  bulkResultSummary = '';
  bulkResultLines: BulkOutcomeLine[] = [];

  /** Typing must not fire a request per keystroke — the search is debounced through here. */
  private searchInput$ = new RxSubject<string>();
  private destroyed$ = new RxSubject<void>();

  constructor(
    private subjectsService: SubjectsService,
    private adminAuthService: AdminAuthService,
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
        this.fetchSubjects();
      });

    this.fetchSubjects();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- list ---------------------------------------------------------------------------

  private fetchSubjects(): void {
    this.loading = true;
    this.loadError = '';
    this.subjectsService
      .getSubjects(this.adminId, { search: this.search, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.rows.forEach((row) => this.known.set(row._id, row));
        this.total = res.total || 0;
        this.summary = res.summary || this.summary;
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        // Not the empty state: the table says the load FAILED and offers a retry.
        this.rows = [];
        this.loadError = "Couldn't load subjects.";
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  retryList(): void {
    this.fetchSubjects();
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value);
  }

  onPageChange(page: number): void {
    this.page = page;
    this.fetchSubjects();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.page = 1;
    this.fetchSubjects();
  }

  trackByRow = (_index: number, row: Subject): string => row._id;

  // --- selection ------------------------------------------------------------------------

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  toggleRow(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row._id));
  }

  toggleAll(): void {
    const selectAll = !this.allSelected;
    this.rows.forEach((row) => {
      if (selectAll) this.selected.add(row._id);
      else this.selected.delete(row._id);
    });
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  // --- add / edit ---------------------------------------------------------------------

  onAddSubject(): void {
    this.formTitle = 'Add Subject';
    this.form = { ...EMPTY_FORM };
    this.clearErrors();
    this.saving = false;
    this.formKey = newIdempotencyKey();
    this.formOpen = true;
  }

  onEditSubject(row: Subject): void {
    this.formTitle = 'Edit Subject';
    this.form = { id: row._id, name: row.name, type: row.type, status: row.status };
    this.clearErrors();
    this.saving = false;
    this.formKey = newIdempotencyKey();
    this.formOpen = true;
  }

  onNameChange(value: string): void {
    this.form = { ...this.form, name: value };
    delete this.fieldErrors['name'];
  }

  onTypeChange(value: string): void {
    this.form = { ...this.form, type: value === 'elective' ? 'elective' : 'core' };
  }

  onStatusChange(value: string): void {
    this.form = { ...this.form, status: value === 'inactive' ? 'inactive' : 'active' };
  }

  /** Submit stays disabled until the name has content — the reference gates on it. */
  get submitDisabled(): boolean {
    return this.saving || !this.form.name.trim();
  }

  onFormCancel(): void {
    this.formOpen = false;
    this.saving = false;
  }

  onFormSubmit(): void {
    if (this.submitDisabled) return;

    this.saving = true;
    this.clearErrors();

    const payload: SubjectPayload = {
      adminId: this.adminId,
      name: this.form.name.trim(),
      type: this.form.type,
      status: this.form.status
    };

    const request = this.form.id
      ? this.subjectsService.updateSubject(this.form.id, payload, this.formKey)
      : this.subjectsService.createSubject(payload, this.formKey);

    request.pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.saving = false;
      this.formOpen = false;
      this.fetchSubjects();
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.saving = false;
      // Every other category is already shaped and surfaced by ErrorInterceptor; only
      // ValidationError is left to the page, so its fields can land beside the inputs.
      this.bindFieldErrors(error);
      this.cdr.markForCheck();
    });
  }

  private clearErrors(): void {
    this.fieldErrors = {};
    this.formError = '';
  }

  /** ValidationError, and a field-naming ConflictError (SUBJECT_DUPLICATE), land inline. */
  private bindFieldErrors(error: unknown): void {
    const inline = inlineFormErrors(error, KNOWN_FIELDS);
    if (!inline) return;
    this.fieldErrors = inline.fields;
    this.formError = inline.formError;
  }

  // --- delete -------------------------------------------------------------------------

  onDeleteSubject(row: Subject): void {
    this.openDeleteConfirm([row._id]);
  }

  onDeleteSelected(): void {
    if (!this.selected.size) return;
    this.openDeleteConfirm(Array.from(this.selected));
  }

  private labelOf(id: string): string {
    return this.known.get(id)?.name || 'Subject';
  }

  /**
   * The blocking count comes from the list response, so the confirmation says what will be
   * refused BEFORE the attempt, never only after a failed delete.
   */
  private openDeleteConfirm(ids: string[]): void {
    this.deleteIds = ids;
    const inUse = ids.filter((id) => (this.known.get(id)?.blockingCount || 0) > 0);

    let scopeNote: string | undefined;
    if (ids.length === 1 && inUse.length === 1) {
      scopeNote = usedInMessage(this.known.get(ids[0])?.blockingCount || 0);
    } else if (inUse.length) {
      const groups = inUse.reduce((sum, id) => sum + (this.known.get(id)?.blockingCount || 0), 0);
      scopeNote = inUse.length + ' of ' + ids.length + ' selected are used in Subject Groups ('
        + inUse.map((id) => this.labelOf(id)).join(', ') + ') — deleting removes them from '
        + countOf(groups, 'group assignment') + '.';
    }

    this.confirmConfig = {
      title: 'Delete ' + ids.length + (ids.length === 1 ? ' subject?' : ' subjects?'),
      message: "This can't be undone.",
      scopeNote,
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE'
    };
    this.confirmOpen = true;
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    const ids = this.deleteIds;
    this.deleteIds = [];
    if (!ids.length || this.deleting) return;
    this.deleting = true;

    this.subjectsService.bulkDelete(this.adminId, ids, true)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.deleting = false;
        const outcome = bulkDeleteOutcome(ids, res, (id) => this.labelOf(id),
          (result: BulkDeleteResult) => 'Used in ' + countOf(result.blockingCount || 0, 'subject group')
            + ' — not deleted.');
        outcome.deletedIds.forEach((id) => {
          this.selected.delete(id);
          this.known.delete(id);
        });
        if (outcome.hasDetails) this.showBulkResult(outcome.summary, outcome.lines);
        this.fetchSubjects();
      }, () => {
        // ErrorInterceptor has already said what went wrong; the selection is kept.
        this.deleting = false;
        this.cdr.markForCheck();
      });
  }

  private showBulkResult(summary: string, lines: BulkOutcomeLine[]): void {
    this.bulkResultSummary = summary;
    this.bulkResultLines = lines;
    this.bulkResultOpen = true;
    this.cdr.markForCheck();
  }

  closeBulkResult(): void {
    this.bulkResultOpen = false;
  }

  trackByOutcome = (_index: number, line: BulkOutcomeLine): string => line.id;

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.deleteIds = [];
  }
}
