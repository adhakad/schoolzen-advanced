/**
 * Fee Statement — one student's full fee picture, opened from the Fees table's Statement icon.
 *
 * Reference: docs/schoolzen-planning/v1/fees/fee-statement.html
 *
 * A read-composed single-student view, not a list page: profile header → summary strip →
 * Previous Year Dues (every past session they were ever enrolled in, a fully-paid one
 * included) → this year's Particulars → this year's Payment History. One server read; no
 * collection here. The printer icon rebuilds the original receipt (same serial number).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, Subject } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { FeeStatementService } from 'src/app/shared/services/fees/fee-statement.service';
import { FeesService } from 'src/app/shared/services/fees/fees.service';
import {
  FeeReceipt, FeeStatement, FeeStatus, StatementPayment, StatementSession
} from 'src/app/shared/models/fees/fees.model';
import { errorMessageOf } from 'src/app/shared/utils/api-error.util';
import { arrearNote, compactRupees, rupees, shortDate, shortSession, statusTagClass } from '../fees-format';

@Component({
  selector: 'app-fee-statement',
  templateUrl: './fee-statement.component.html',
  styleUrls: ['./fee-statement.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeeStatementComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  studentId = '';
  statement: FeeStatement | null = null;
  loading = false;
  loadError = '';

  yearPayments: StatementSession | null = null;

  receipt: FeeReceipt | null = null;
  receiptLoadingId = '';
  receiptError = '';

  private destroyed$ = new Subject<void>();

  constructor(
    private api: FeeStatementService,
    private feesApi: FeesService,
    private shellContext: ShellContextService,
    private adminAuthService: AdminAuthService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) return;
    combineLatest([
      this.route.paramMap.pipe(map((params) => params.get('studentId') || '')),
      this.shellContext.context.pipe(map((context) => context.activeSession), distinctUntilChanged())
    ]).pipe(takeUntil(this.destroyed$)).subscribe(([studentId, session]) => {
      this.studentId = studentId;
      this.session = session;
      this.fetch();
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  fetch(): void {
    if (!this.studentId || !this.session) {
      this.statement = null;
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.get(this.adminId, this.session, this.studentId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.statement = res;
      this.loading = false;
      this.cdr.markForCheck();
    }, (error) => {
      // A failed read stops the loader and says so — never an endless spinner.
      this.statement = null;
      this.loading = false;
      this.loadError = errorMessageOf(error, "Couldn't load this student's fee statement.");
      this.cdr.markForCheck();
    });
  }

  // --- display --------------------------------------------------------------------------

  money(value: number | null | undefined): string {
    return rupees(value ?? 0);
  }

  compact(value: number): string {
    return compactRupees(value);
  }

  date(value: string): string {
    return shortDate(value);
  }

  tagClass(status: FeeStatus | null): string {
    return statusTagClass(status);
  }

  get initials(): string {
    const name = this.statement?.student.name || '';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  }

  get headerMeta(): string {
    const s = this.statement?.student;
    if (!s) return '';
    return [
      `Admission No. ${s.admissionNo ?? '—'}`,
      `Class ${s.className || '—'}${s.streamName ? ' · ' + s.streamName : ''}`,
      `Roll No. ${s.rollNumber ?? '—'}`,
      `Father: ${s.fatherName || '—'}`
    ].join(' · ');
  }

  get arrearText(): string {
    const arrears = this.statement?.summary?.arrears || [];
    return arrearNote(arrears.map((item) => ({ sessionLabel: '', sessionShort: item.sessionShort, className: item.className, due: item.due })));
  }

  get sessionShort(): string {
    return shortSession(this.session);
  }

  yearHint(item: StatementSession): string {
    const count = item.payments.length;
    const base = `${count} installment${count === 1 ? '' : 's'} totaling ${rupees(item.paid)} of ${rupees(item.total)}`;
    return item.due > 0 ? `${base} — ${rupees(item.due)} remains due for this session.` : `${base} — fully cleared.`;
  }

  // --- receipts ---------------------------------------------------------------------------

  openYearPayments(item: StatementSession): void {
    this.yearPayments = item;
  }

  closeYearPayments(): void {
    this.yearPayments = null;
  }

  reprint(payment: StatementPayment): void {
    if (!payment.printable || this.receiptLoadingId) return;
    this.receiptLoadingId = payment._id;
    this.receiptError = '';
    this.feesApi.receipt(this.adminId, payment._id).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.receiptLoadingId = '';
      this.receipt = res.receipt;
      this.cdr.markForCheck();
    }, (error) => {
      this.receiptLoadingId = '';
      this.receiptError = errorMessageOf(error, "Couldn't generate the document — please try again.");
      this.cdr.markForCheck();
    });
  }

  closeReceipt(): void {
    this.receipt = null;
  }

  print(): void {
    if (this.receipt) window.print();
  }

  trackById = (_index: number, row: { _id: string }): string => row._id;
  trackBySession = (_index: number, row: StatementSession): string => row.sessionLabel;
}
