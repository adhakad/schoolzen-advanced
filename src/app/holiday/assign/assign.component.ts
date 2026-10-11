/**
 * Holiday Assign — which Holiday Template each staff member / student follows.
 *
 * Reference: docs/schoolzen-planning/v1/holiday/assign.html
 *
 * Row 1: search + Assign to Selected + Edit Selected; then the shared Person Type filter.
 * Assign is for people with no template yet, Edit for people who already have one. A
 * selection that mixes both shows a warning and disables BOTH buttons — the API rejects
 * such a batch too (HOLIDAY_ASSIGN_MIXED_SELECTION). Anyone left "Not set" follows the
 * school's Default template.
 *
 * Everything here needs the 'holiday-assign' permission (enforced by the API); without the
 * edit grant (`canAssign`) the assign controls are hidden.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { HolidayAssignService } from 'src/app/shared/services/holiday/holiday-assign.service';
import { HolidayTemplatesService } from 'src/app/shared/services/holiday/holiday-templates.service';
import { LeaveFilterOptionsService } from 'src/app/shared/services/leave/leave-filter-options.service';
import {
  classifySelection, HolidayAssignMode, HolidayAssignRow, SelectionKind
} from 'src/app/shared/models/holiday/holiday-assign.model';
import {
  EMPTY_FILTER_OPTIONS, EMPTY_PERSON_FILTER, PersonFilterOptions, PersonFilterValue
} from 'src/app/shared/models/leave/person-filter.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';

@Component({
  selector: 'app-holiday-assign',
  templateUrl: './assign.component.html',
  styleUrls: ['./assign.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HolidayAssignComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';

  filter: PersonFilterValue = { ...EMPTY_PERSON_FILTER };
  filterOptions: PersonFilterOptions = EMPTY_FILTER_OPTIONS;
  lookupError = '';
  search = '';

  loading = true;
  loadError = '';
  canAssign = false;
  rows: HolidayAssignRow[] = [];
  total = 0;
  page = 1;
  limit = 25;
  defaultTemplateName = 'Default';

  /** Selected person → their current templateId (kept across pages for the mixed check). */
  selected = new Map<string, string | null>();

  templateOptions: DdOption[] = [];

  modalOpen = false;
  mode: HolidayAssignMode = 'assign';
  modalTemplateId = '';
  modalError = '';
  /** Double-submit guard. */
  saving = false;
  private modalIds: string[] = [];

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: HolidayAssignService,
    private templatesApi: HolidayTemplatesService,
    private filterOptionsApi: LeaveFilterOptionsService,
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
    this.loadLookups();
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.page = 1;
      this.fetch();
    });
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      this.selected.clear();
      this.fetch();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadLookups(): void {
    this.lookupError = '';
    this.filterOptionsApi.load(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.filterOptions = res.options;
      if (!res.complete) this.lookupError = "Couldn't load every filter.";
      this.cdr.markForCheck();
    });
  }

  get isStaff(): boolean {
    return this.filter.personType === 'staff';
  }

  onFilterChange(value: PersonFilterValue): void {
    if (value.personType !== this.filter.personType) this.selected.clear();
    this.filter = value;
    this.page = 1;
    this.fetch();
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
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

  // --- grid ----------------------------------------------------------------------------

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.getGrid(this.adminId, this.session, this.filter, { search: this.search, page: this.page, limit: this.limit })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.canAssign = Boolean(res.canAssign);
        this.defaultTemplateName = res.defaultTemplate?.name || 'Default';
        // Keep the remembered template of visible selected rows current.
        this.rows.forEach((row) => { if (this.selected.has(row._id)) this.selected.set(row._id, row.templateId); });
        this.loading = false;
        this.cdr.markForCheck();
      }, (error: unknown) => {
        this.rows = [];
        this.loadError = errorMessageOf(error, "Couldn't load people.");
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  trackByRow = (_index: number, row: HolidayAssignRow): string => row._id;

  // --- selection ----------------------------------------------------------------------

  get selectedCount(): number {
    return this.selected.size;
  }

  get selection(): SelectionKind {
    return classifySelection(Array.from(this.selected.values()).map((templateId) => ({ templateId })));
  }

  get mixed(): boolean {
    return this.selection === 'mixed';
  }

  get assignDisabled(): boolean {
    return this.selection !== 'assign' || this.modalOpen;
  }

  get editDisabled(): boolean {
    return this.selection !== 'edit' || this.modalOpen;
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selected.has(row._id));
  }

  toggleAll(): void {
    if (this.allSelected) this.rows.forEach((row) => this.selected.delete(row._id));
    else this.rows.forEach((row) => this.selected.set(row._id, row.templateId));
  }

  toggleRow(row: HolidayAssignRow): void {
    if (this.selected.has(row._id)) this.selected.delete(row._id);
    else this.selected.set(row._id, row.templateId);
  }

  // --- assign / edit modal -----------------------------------------------------------------

  onAssignSelected(): void {
    if (this.assignDisabled) return;
    this.openModal('assign', Array.from(this.selected.keys()), '');
  }

  onEditSelected(): void {
    if (this.editDisabled) return;
    const current = new Set(Array.from(this.selected.values()));
    this.openModal('edit', Array.from(this.selected.keys()), current.size === 1 ? (Array.from(current)[0] || '') : '');
  }

  onRowAction(row: HolidayAssignRow): void {
    if (this.modalOpen) return;
    this.openModal(row.templateId ? 'edit' : 'assign', [row._id], row.templateId || '');
  }

  private openModal(mode: HolidayAssignMode, ids: string[], templateId: string): void {
    if (!this.canAssign || !ids.length) return;
    this.mode = mode;
    this.modalIds = ids;
    this.modalTemplateId = templateId;
    this.modalError = '';
    this.saving = false;
    this.modalOpen = true;
    this.templatesApi.getOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.templateOptions = (res.rows || []).map((row) => ({ value: row._id, label: row.isDefault ? `${row.name} (Default)` : row.name }));
      this.cdr.markForCheck();
    }, () => {
      this.modalError = "Couldn't load templates.";
      this.cdr.markForCheck();
    });
  }

  get modalTitle(): string {
    const who = this.modalIds.length === 1 ? '1 person' : `${this.modalIds.length} people`;
    return (this.mode === 'assign' ? 'Assign Template' : 'Edit Template') + ' — ' + who;
  }

  get modalSubmitDisabled(): boolean {
    return this.saving || !this.modalTemplateId;
  }

  onModalTemplateChange(value: string): void {
    this.modalTemplateId = value;
    this.modalError = '';
  }

  onModalCancel(): void {
    this.modalOpen = false;
    this.saving = false;
  }

  onModalSubmit(): void {
    if (this.modalSubmitDisabled) return;
    this.saving = true;
    this.modalError = '';
    this.api.assign({
      adminId: this.adminId,
      session: this.session,
      personType: this.filter.personType,
      personIds: this.modalIds,
      templateId: this.modalTemplateId,
      mode: this.mode
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => this.done(res.message), (error: unknown) => this.failed(error));
  }

  /** Edit mode only: back to "Not set" — the Default template applies again. */
  onRemoveTemplate(): void {
    if (this.saving || this.mode !== 'edit') return;
    this.saving = true;
    this.modalError = '';
    this.api.unassign(this.adminId, this.session, this.filter.personType, this.modalIds)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => this.done(res.message), (error: unknown) => this.failed(error));
  }

  private done(message: string): void {
    this.saving = false;
    this.modalOpen = false;
    this.modalIds.forEach((id) => this.selected.delete(id));
    this.snackBar.open(message, 'Close', { duration: 3000 });
    this.fetch();
  }

  private failed(error: unknown): void {
    this.saving = false;
    const inline = validationErrorsOf(error);
    this.modalError = inline ? inline.message : errorMessageOf(error, "Couldn't save.");
    // A mixed/stale selection on the server — refresh so the grid shows the real state.
    this.fetch();
    this.cdr.markForCheck();
  }
}
