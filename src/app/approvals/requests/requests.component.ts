/**
 * Approvals → Requests — one inbox for every request that needs sign-off, across modules
 * (only Leave feeds it today).
 *
 * Reference: docs/schoolzen-planning/v1/approvals/approvals.html (+ .md, errors.md,
 * optimization.md)
 *
 * Toolbar: row 1 search; row 2 the 6-column Applicant → Department → Designation | Class →
 * Stream → Section cascade; row 3 Type + Status. Every filter change goes back to page 1.
 *
 * Pages are keyset cursors from the server (never an offset), so rows other admins clear
 * from the queue never shift what this admin has already paged past.
 *
 * Approve / Reject confirm first, then run the SAME action the row's own module page runs.
 * Each row has its own in-flight flag. A row someone else already decided (or that's gone)
 * is dropped from the list with a toast instead of inviting a second failed click.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ApprovalRequestsService } from 'src/app/shared/services/approvals/requests.service';
import { LeaveFilterOptionsService } from 'src/app/shared/services/leave/leave-filter-options.service';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { V2Permissions } from 'src/app/shared/models/shell-context.model';
import { EMPTY_FILTER_OPTIONS, PersonFilterOptions } from 'src/app/shared/models/leave/person-filter.model';
import { FilterClass } from 'src/app/shared/models/student/student.model';
import {
  ApprovalDecision, ApprovalPersonType, ApprovalRow, ApprovalStatus, ApprovalSummary
} from 'src/app/shared/models/approvals/approval-request.model';
import { toApiError } from 'src/app/shared/utils/api-error.util';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';

/** Each request type's own module grant — acting on it needs this edit as well. */
const SOURCE_PERMISSION: Readonly<Record<string, string>> = { leave: 'leave' };
const STALE_CODES = ['REQUEST_NOT_PENDING', 'REQUEST_NOT_FOUND'];
const STATUS_LABEL: Readonly<Record<ApprovalStatus, string>> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

const titleCase = (text: string): string => (text || '').replace(/\b\w/g, (c) => c.toUpperCase());

interface Decision { row: ApprovalRow; decision: ApprovalDecision; key: string }

@Component({
  selector: 'app-requests',
  templateUrl: './requests.component.html',
  styleUrls: ['./requests.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RequestsComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';

  // --- toolbar -------------------------------------------------------------------------
  search = '';
  personType: ApprovalPersonType = '';
  departmentId = '';
  designationId = '';
  classId = '';
  streamId = '';
  sectionId = '';
  type = '';
  status: '' | ApprovalStatus = '';
  filterOptions: PersonFilterOptions = EMPTY_FILTER_OPTIONS;
  lookupError = '';

  readonly applicantOptions: readonly DdOption[] = [
    { value: '', label: 'All Applicants' },
    { value: 'staff', label: 'Staff' },
    { value: 'student', label: 'Student' }
  ];
  readonly typeOptions: readonly DdOption[] = [
    { value: '', label: 'All types' },
    { value: 'leave', label: 'Leave' }
  ];
  readonly statusOptions: readonly DdOption[] = [
    { value: '', label: 'Any status' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' }
  ];

  // --- table ---------------------------------------------------------------------------
  loading = true;
  loadError = '';
  rows: ApprovalRow[] = [];
  total = 0;
  page = 1;
  limit = 10;
  truncated = false;
  summary: ApprovalSummary = { pending: 0, approved: 0, rejected: 0 };
  /** cursors[i] fetches page i + 1; cursors[0] is the first page. */
  private cursors: string[] = [''];
  private nextCursor: string | null = null;
  /** Per-row in-flight flags, keyed by row id — one row saving never blocks another. */
  busy: Record<string, boolean> = {};

  // --- modals --------------------------------------------------------------------------
  decision: Decision | null = null;
  viewRow: ApprovalRow | null = null;

  private v2Permissions: V2Permissions | null | undefined = null;
  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: ApprovalRequestsService,
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
      this.refetch();
    });
    this.shellContext.context.pipe(takeUntil(this.destroyed$)).subscribe((context) => {
      this.v2Permissions = context.v2Permissions;
      this.cdr.markForCheck();
    });
    this.shellContext.context.pipe(
      map((context) => context.activeSession),
      distinctUntilChanged(),
      takeUntil(this.destroyed$)
    ).subscribe((session) => {
      this.session = session;
      this.refetch();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- lookups -------------------------------------------------------------------------

  loadLookups(): void {
    this.lookupError = '';
    this.filterOptionsApi.load(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.filterOptions = res.options;
      if (!res.complete) this.lookupError = "Couldn't load every filter.";
      this.cdr.markForCheck();
    });
  }

  get departmentOptions(): DdOption[] {
    return [{ value: '', label: 'All departments' }, ...this.filterOptions.departments.map((row) => ({ value: row._id, label: row.name }))];
  }

  get designationOptions(): DdOption[] {
    return [{ value: '', label: 'All designations' },
      ...this.filterOptions.designations.filter((row) => row.departmentId === this.departmentId).map((row) => ({ value: row._id, label: row.title }))];
  }

  get classOptions(): DdOption[] {
    return [{ value: '', label: 'All classes' }, ...this.filterOptions.classes.map((row) => ({ value: row._id, label: row.label }))];
  }

  private get chosenClass(): FilterClass | undefined {
    return this.filterOptions.classes.find((row) => row._id === this.classId);
  }

  get streamOptions(): DdOption[] {
    return [{ value: '', label: 'All streams' }, ...(this.chosenClass?.streams || []).map((row) => ({ value: row._id, label: titleCase(row.name) }))];
  }

  private get sections(): { _id: string; name: string }[] {
    const chosen = this.chosenClass;
    if (!chosen) return [];
    if (!chosen.hasStreams) return chosen.sections || [];
    return chosen.streams.find((row) => row._id === this.streamId)?.sections || [];
  }

  get sectionOptions(): DdOption[] {
    return [{ value: '', label: 'All sections' }, ...this.sections.map((row) => ({ value: row._id, label: 'Section ' + row.name }))];
  }

  // The reference's cascade: Staff enables Department → Designation; Student enables Class
  // → Stream (streamed classes) → Section; "All Applicants" disables all five.
  get departmentDisabled(): boolean { return this.personType !== 'staff'; }
  get designationDisabled(): boolean { return this.personType !== 'staff' || !this.departmentId; }
  get classDisabled(): boolean { return this.personType !== 'student'; }
  get streamDisabled(): boolean { return this.personType !== 'student' || !this.chosenClass?.hasStreams; }
  get sectionDisabled(): boolean { return this.personType !== 'student' || !this.sections.length; }

  // --- filters -------------------------------------------------------------------------

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onApplicantChange(value: string): void {
    const next = (value === 'staff' || value === 'student' ? value : '') as ApprovalPersonType;
    if (next === this.personType) return;
    this.personType = next;
    this.departmentId = '';
    this.designationId = '';
    this.classId = '';
    this.streamId = '';
    this.sectionId = '';
    this.refetch();
  }

  onDepartmentChange(value: string): void {
    this.departmentId = value;
    this.designationId = '';
    this.refetch();
  }

  onDesignationChange(value: string): void {
    this.designationId = value;
    this.refetch();
  }

  onClassChange(value: string): void {
    this.classId = value;
    this.streamId = '';
    this.sectionId = '';
    this.refetch();
  }

  onStreamChange(value: string): void {
    this.streamId = value;
    this.sectionId = '';
    this.refetch();
  }

  onSectionChange(value: string): void {
    this.sectionId = value;
    this.refetch();
  }

  onTypeChange(value: string): void {
    this.type = value;
    this.refetch();
  }

  onStatusChange(value: string): void {
    this.status = value as '' | ApprovalStatus;
    this.refetch();
  }

  onPageChange(page: number): void {
    if (page === this.page + 1) {
      // Past the last row the server knows of — the queue shrank under us; stay put.
      if (!this.nextCursor) return;
      this.cursors[this.page] = this.nextCursor;
    } else if (page < 1 || page > this.page || this.cursors[page - 1] === undefined) {
      return;
    }
    this.page = page;
    this.fetch();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.refetch();
  }

  // --- table ---------------------------------------------------------------------------

  /** Any filter change: back to the first page, with a fresh cursor chain. */
  private refetch(): void {
    this.page = 1;
    this.cursors = [''];
    this.nextCursor = null;
    this.fetch();
  }

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.getRequests(this.adminId, {
      session: this.session,
      search: this.search,
      personType: this.personType,
      departmentId: this.departmentId,
      designationId: this.designationId,
      classId: this.classId,
      streamId: this.streamId,
      sectionId: this.sectionId,
      type: this.type,
      status: this.status,
      cursor: this.cursors[this.page - 1] || '',
      limit: this.limit
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.total = res.total || 0;
      this.summary = res.summary || this.summary;
      this.nextCursor = res.nextCursor;
      this.truncated = Boolean(res.truncated);
      this.loading = false;
      this.cdr.markForCheck();
    }, () => {
      // Kept apart from "no requests": an empty inbox and a failed load are different news.
      this.rows = [];
      this.loadError = "Couldn't load approval requests.";
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  trackById = (_index: number, row: ApprovalRow): string => row.type + '|' + row._id;

  statusLabel(status: ApprovalStatus): string {
    return STATUS_LABEL[status] || status;
  }

  /** A request type this page doesn't know how to summarize yet still renders something. */
  detailsOf(row: ApprovalRow): string {
    return row.details || 'View details';
  }

  /** Approve/Reject shown only with 'approvals-action' edit AND the row's own module edit. */
  canDecide(row: ApprovalRow): boolean {
    const source = SOURCE_PERMISSION[row.type];
    return row.status === 'pending' && Boolean(source) && this.canEdit('approvals-action') && this.canEdit(source);
  }

  private canEdit(module: string): boolean {
    const permissions = this.v2Permissions;
    if (!permissions) return true; // not loaded: the API still enforces every grant
    if (permissions.isSuperAdmin) return true;
    return Boolean(permissions.modules[module]?.canEdit);
  }

  // --- approve / reject ----------------------------------------------------------------

  onDecide(row: ApprovalRow, decision: ApprovalDecision): void {
    if (this.busy[row._id] || this.decision) return;
    this.decision = { row, decision, key: newIdempotencyKey() };
  }

  get decisionTitle(): string {
    return this.decision?.decision === 'reject' ? 'Reject Request?' : 'Approve Request?';
  }

  get decisionLabel(): string {
    return this.decision?.decision === 'reject' ? 'Reject' : 'Approve';
  }

  onDecisionCancel(): void {
    this.decision = null;
  }

  onDecisionConfirm(): void {
    const pending = this.decision;
    this.decision = null;
    if (!pending || this.busy[pending.row._id]) return;
    const { row, decision, key } = pending;
    this.busy = { ...this.busy, [row._id]: true };
    this.api.decide(this.adminId, row.type, row._id, decision, key).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.release(row._id);
      const next = res.row || { ...row, status: (decision === 'approve' ? 'approved' : 'rejected') as ApprovalStatus };
      this.applyStatusChange(row, next);
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.cdr.markForCheck();
    }, (error: unknown) => {
      this.release(row._id);
      const apiError = toApiError(error);
      if (apiError?.code && STALE_CODES.indexOf(apiError.code) !== -1) {
        this.removeRow(row);
        this.snackBar.open('Already actioned by someone else — refresh to see the latest.', 'Dismiss', { duration: 5000 });
      } else if (apiError?.category === 'ValidationError') {
        // ValidationError isn't toasted by the interceptor — say it here.
        this.snackBar.open(apiError.message, 'Dismiss', { duration: 5000 });
      }
      this.cdr.markForCheck();
    });
  }

  private release(id: string): void {
    const next = { ...this.busy };
    delete next[id];
    this.busy = next;
  }

  /** Decided: the row turns view-only in place (or leaves a Pending-only filter). */
  private applyStatusChange(before: ApprovalRow, after: ApprovalRow): void {
    this.shiftCount(before.status, -1);
    this.shiftCount(after.status, 1);
    if (this.status && this.status !== after.status) {
      this.rows = this.rows.filter((row) => !(row._id === before._id && row.type === before.type));
      this.total = Math.max(0, this.total - 1);
      return;
    }
    this.rows = this.rows.map((row) => (row._id === before._id && row.type === before.type ? after : row));
  }

  private removeRow(target: ApprovalRow): void {
    const had = this.rows.length;
    this.rows = this.rows.filter((row) => !(row._id === target._id && row.type === target.type));
    if (this.rows.length !== had) {
      this.total = Math.max(0, this.total - 1);
      this.shiftCount(target.status, -1);
    }
  }

  private shiftCount(status: ApprovalStatus, delta: number): void {
    if (!(status in this.summary)) return;
    this.summary = { ...this.summary, [status]: Math.max(0, this.summary[status] + delta) };
  }

  // --- details -------------------------------------------------------------------------

  onView(row: ApprovalRow): void {
    this.viewRow = row;
  }

  onViewClose(): void {
    this.viewRow = null;
  }
}
