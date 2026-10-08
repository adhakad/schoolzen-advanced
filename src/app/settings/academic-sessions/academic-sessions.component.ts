/**
 * Settings → Academic Sessions — the school year every new record is saved against.
 *
 * Reference: docs/schoolzen-planning/v1/settings/academic-sessions.html (+ .md, errors.md Page 1)
 *
 * Create makes an UPCOMING session from a date range; the label ("2026-2027") is derived by
 * the server, so the modal shows it as a preview, never as a text input. Set as Active is
 * gated by typing that session's own label, and the server re-checks it.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig } from 'src/app/shared/models/shared-components.model';
import { AcademicSessionsService } from 'src/app/shared/services/settings/academic-sessions.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import {
  AcademicSessionRow, CopyForwardOption, CreateSessionResponse, SessionStatus
} from 'src/app/shared/models/settings/academic-session.model';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { settingsFormErrors, SETTINGS_ERROR_MESSAGES } from 'src/app/shared/utils/settings-errors.util';
import { toApiError } from 'src/app/shared/utils/api-error.util';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CREATE_FIELDS: readonly string[] = ['startDate', 'endDate'];
const ACTIVATE_FIELDS: readonly string[] = ['confirmLabel'];

/** '2026-04-01' (or an ISO timestamp) → '01 Apr 2026', read from the string so no zone shifts it. */
export const formatSessionDate = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) return '';
  return match[3] + ' ' + MONTHS[Number(match[2]) - 1] + ' ' + match[1];
};

/** The label the server will derive — shown read-only as the dates are picked. */
export const previewLabel = (start: string, end: string): string => {
  const s = /^(\d{4})-/.exec(start || '');
  const e = /^(\d{4})-/.exec(end || '');
  return s && e ? s[1] + '-' + e[1] : '';
};

@Component({
  selector: 'app-academic-sessions',
  templateUrl: './academic-sessions.component.html',
  styleUrls: ['./academic-sessions.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AcademicSessionsComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  rows: AcademicSessionRow[] = [];
  page = 1;
  limit = 10;
  total = 0;
  activeLabel: string | null = null;

  // Create modal
  createOpen = false;
  creating = false;
  startDate = '';
  endDate = '';
  copyOptions: CopyForwardOption[] = [];
  copySource: string | null = null;
  copyLoadError = false;
  copySelected = new Set<string>();
  createErrors: Record<string, string> = {};
  createFormError = '';
  private createKey = '';

  // Copy-forward partial outcome
  partialOpen = false;
  partialMessage = '';
  partialRows: { label: string; message: string }[] = [];

  // Set as Active modal
  activateOpen = false;
  activating = false;
  activateTarget: AcademicSessionRow | null = null;
  confirmText = '';
  activateError = '';

  // Delete
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteTarget: AcademicSessionRow | null = null;
  deletingId = '';

  private destroyed$ = new Subject<void>();

  constructor(
    private sessionsService: AcademicSessionsService,
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
    this.fetchSessions();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- list ---------------------------------------------------------------------------

  fetchSessions(): void {
    this.loading = true;
    this.loadError = '';
    this.sessionsService.getSessions(this.adminId, this.page, this.limit)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = res.rows || [];
        this.total = res.total || 0;
        this.activeLabel = res.summary?.activeLabel || null;
        this.loading = false;
        this.cdr.markForCheck();
      }, () => {
        this.rows = [];
        this.loadError = "Couldn't load academic sessions.";
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  onPageChange(page: number): void {
    this.page = page;
    this.fetchSessions();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.page = 1;
    this.fetchSessions();
  }

  trackByRow = (_index: number, row: AcademicSessionRow): string => row._id;
  trackByKey = (_index: number, option: CopyForwardOption): string => option.key;

  formatDate(value: string): string {
    return formatSessionDate(value);
  }

  statusLabel(status: SessionStatus): string {
    return status === 'active' ? 'Active' : status === 'closed' ? 'Closed' : 'Upcoming';
  }

  /** Closed sessions stay browsable: point the header's session selector at it. */
  onViewSession(row: AcademicSessionRow): void {
    this.shellContext.setActiveSession(row.label);
    this.snackBar.open('Browsing ' + row.label + ' — read-only.', 'Dismiss', { duration: 4000 });
  }

  // --- create -------------------------------------------------------------------------

  onCreateSession(): void {
    this.startDate = '';
    this.endDate = '';
    this.createErrors = {};
    this.createFormError = '';
    this.creating = false;
    this.createKey = newIdempotencyKey();
    this.copyOptions = [];
    this.copySelected = new Set<string>();
    this.copyLoadError = false;
    this.createOpen = true;

    this.sessionsService.getCopyForwardOptions(this.adminId)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.copySource = res.sourceLabel;
        this.copyOptions = res.options || [];
        // Default: every type that can actually be copied, as in the reference.
        this.copySelected = new Set(this.copyOptions.filter((o) => o.available).map((o) => o.key));
        this.cdr.markForCheck();
      }, () => {
        this.copyLoadError = true;
        this.cdr.markForCheck();
      });
  }

  get labelPreview(): string {
    return previewLabel(this.startDate, this.endDate);
  }

  onStartChange(value: string): void {
    this.startDate = value;
    delete this.createErrors['startDate'];
    this.createFormError = '';
  }

  onEndChange(value: string): void {
    this.endDate = value;
    delete this.createErrors['endDate'];
    this.createFormError = '';
  }

  isCopyChecked(key: string): boolean {
    return this.copySelected.has(key);
  }

  toggleCopy(option: CopyForwardOption): void {
    if (!option.available) return;
    if (this.copySelected.has(option.key)) this.copySelected.delete(option.key);
    else this.copySelected.add(option.key);
  }

  get createDisabled(): boolean {
    return this.creating || !this.startDate || !this.endDate;
  }

  onCreateCancel(): void {
    this.createOpen = false;
    this.creating = false;
  }

  onCreateSubmit(): void {
    if (this.createDisabled) return;
    // Same rule the server enforces, caught before the round trip.
    if (this.endDate <= this.startDate) {
      this.createErrors = { endDate: SETTINGS_ERROR_MESSAGES['SESSION_DATE_RANGE_INVALID'] };
      return;
    }
    this.creating = true;
    this.createErrors = {};
    this.createFormError = '';

    this.sessionsService.createSession({
      adminId: this.adminId,
      startDate: this.startDate,
      endDate: this.endDate,
      copyForward: Array.from(this.copySelected)
    }, this.createKey).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.creating = false;
      this.createOpen = false;
      this.afterCreate(res);
      this.fetchSessions();
    }, (error: unknown) => {
      this.creating = false;
      const inline = settingsFormErrors(error, CREATE_FIELDS);
      if (inline) {
        this.createErrors = inline.fields;
        this.createFormError = inline.formError;
      }
      this.cdr.markForCheck();
    });
  }

  private afterCreate(res: CreateSessionResponse): void {
    if (res?.warning) {
      this.partialMessage = res.warning.message;
      this.partialRows = (res.warning.rows || []).map((row) => ({ label: row.label, message: row.message }));
      this.partialOpen = true;
      return;
    }
    this.snackBar.open(res?.message || 'Session created.', 'Dismiss', { duration: 4000 });
  }

  closePartial(): void {
    this.partialOpen = false;
  }

  // --- set as active ------------------------------------------------------------------

  onSetActive(row: AcademicSessionRow): void {
    this.activateTarget = row;
    this.confirmText = '';
    this.activateError = '';
    this.activating = false;
    this.activateOpen = true;
  }

  onConfirmTextChange(value: string): void {
    this.confirmText = value;
    this.activateError = '';
  }

  get confirmMatches(): boolean {
    return !!this.activateTarget && this.confirmText.trim() === this.activateTarget.label;
  }

  get activateDisabled(): boolean {
    return this.activating || !this.confirmMatches;
  }

  onActivateCancel(): void {
    this.activateOpen = false;
    this.activateTarget = null;
  }

  onActivateSubmit(): void {
    const target = this.activateTarget;
    if (!target || this.activateDisabled) return;
    this.activating = true;
    this.activateError = '';

    this.sessionsService.activateSession(this.adminId, target._id, this.confirmText.trim())
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.activating = false;
        this.activateOpen = false;
        this.activateTarget = null;
        this.shellContext.setActiveSession(target.label);
        this.snackBar.open(res?.message || target.label + ' is now the active session.', 'Dismiss', { duration: 5000 });
        this.fetchSessions();
      }, (error: unknown) => {
        this.activating = false;
        const inline = settingsFormErrors(error, ACTIVATE_FIELDS);
        if (inline) {
          this.activateError = inline.fields['confirmLabel'] || inline.formError;
        } else if (toApiError(error)?.code === 'SESSION_ALREADY_ACTIVE') {
          // Someone else switched sessions meanwhile — close and show the real state.
          this.activateOpen = false;
          this.activateTarget = null;
          this.fetchSessions();
        }
        this.cdr.markForCheck();
      });
  }

  // --- delete -------------------------------------------------------------------------

  onDeleteSession(row: AcademicSessionRow): void {
    this.deleteTarget = row;
    const count = row.blockingCount || 0;
    const blocked = count > 0 || row.isLocked;
    this.confirmConfig = {
      title: 'Delete ' + row.label + '?',
      message: blocked
        ? SETTINGS_ERROR_MESSAGES['SESSION_IN_USE']
        : "This upcoming session will be removed. This can't be undone.",
      scopeNote: count > 0 ? count + (count === 1 ? ' record is' : ' records are') + ' saved against it.' : undefined,
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE',
      blocked
    };
    this.confirmOpen = true;
  }

  onDeleteConfirmed(): void {
    this.confirmOpen = false;
    const target = this.deleteTarget;
    this.deleteTarget = null;
    if (!target || this.deletingId) return;
    this.deletingId = target._id;

    this.sessionsService.deleteSession(this.adminId, target._id)
      .pipe(takeUntil(this.destroyed$))
      .subscribe(() => {
        this.deletingId = '';
        this.snackBar.open(target.label + ' deleted.', 'Dismiss', { duration: 4000 });
        if (this.rows.length === 1 && this.page > 1) this.page -= 1;
        this.fetchSessions();
      }, () => {
        // ErrorInterceptor has toasted SESSION_IN_USE / NOT_FOUND; refresh the counts.
        this.deletingId = '';
        this.fetchSessions();
      });
  }

  onDeleteCancelled(): void {
    this.confirmOpen = false;
    this.deleteTarget = null;
  }
}
