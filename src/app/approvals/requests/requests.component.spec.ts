import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ApprovalRequestsService } from 'src/app/shared/services/approvals/requests.service';
import { LeaveFilterOptionsService } from 'src/app/shared/services/leave/leave-filter-options.service';
import { FormModalComponent } from 'src/app/shared/components/form-modal/form-modal.component';
import { EMPTY_FILTER_OPTIONS } from 'src/app/shared/models/leave/person-filter.model';
import { ApprovalListResponse, ApprovalRow } from 'src/app/shared/models/approvals/approval-request.model';
import { RequestsComponent } from './requests.component';

const row = (overrides: Partial<ApprovalRow>): ApprovalRow => ({
  _id: 'r1', type: 'leave', typeLabel: 'Leave', personType: 'staff', personId: 'p1',
  name: 'Priya Sharma', code: 'STF-0142', details: 'Casual Leave · 05–06 Aug (2 days)',
  status: 'pending', createdAt: '2026-08-01T00:00:00.000Z', ...overrides
});

const listOf = (rows: ApprovalRow[], extra: Partial<ApprovalListResponse> = {}): ApprovalListResponse => ({
  rows, nextCursor: null, total: rows.length, truncated: false,
  summary: { pending: 2, approved: 1, rejected: 1 }, ...extra
});

describe('RequestsComponent (Approvals)', () => {
  let fixture: ComponentFixture<RequestsComponent>;
  let component: RequestsComponent;
  let api: jasmine.SpyObj<ApprovalRequestsService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;
  let context$: BehaviorSubject<any>;

  /** The component is OnPush: dirty ITS view (not just the host's) before rendering. */
  const render = () => {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApprovalRequestsService>('ApprovalRequestsService', ['getRequests', 'decide']);
    api.getRequests.and.returnValue(of(listOf([
      row({ _id: 'p1' }),
      row({ _id: 'p2', personType: 'student', name: 'Ananya Singh', code: '6th · B · Student', details: 'Casual Leave · 12 Aug (1 day)' }),
      row({ _id: 'a1', status: 'approved', name: 'Rohan Kapoor' }),
      row({ _id: 'x1', status: 'rejected', name: 'Amit Joshi' })
    ])));
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    context$ = new BehaviorSubject<any>({ activeSession: '2026-2027', v2Permissions: null });

    await TestBed.configureTestingModule({
      declarations: [RequestsComponent, FormModalComponent],
      providers: [
        { provide: ApprovalRequestsService, useValue: api },
        { provide: LeaveFilterOptionsService, useValue: { load: () => of({ options: EMPTY_FILTER_OPTIONS, complete: true }) } },
        { provide: ShellContextService, useValue: { context: context$.asObservable() } },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'adm' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(RequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const buttonsIn = (rowIndex: number): string[] => {
    const tr = fixture.nativeElement.querySelectorAll('tbody tr')[rowIndex] as HTMLElement;
    return Array.from(tr.querySelectorAll('.actions button')).map((b) => (b as HTMLElement).getAttribute('title') || '');
  };

  it('renders the reference columns: type tag, name + code, details, status tag', () => {
    const first = fixture.nativeElement.querySelector('tbody tr') as HTMLElement;
    expect(first.querySelector('.req-type-tag')!.textContent!.trim()).toBe('Leave');
    expect(first.querySelector('.rq-name')!.textContent!.trim()).toBe('Priya Sharma');
    expect(first.querySelector('.rq-code')!.textContent!.trim()).toBe('STF-0142');
    expect(first.querySelector('.rq-detail')!.textContent!.trim()).toBe('Casual Leave · 05–06 Aug (2 days)');
    expect(first.querySelector('.tag')!.className).toContain('tag-pending');
    const stats = Array.from(fixture.nativeElement.querySelectorAll('.stat-value')).map((el) => (el as HTMLElement).textContent!.trim());
    expect(stats).toEqual(['2', '1', '1']);
  });

  it('pending rows act from the row; decided rows are view-only', () => {
    expect(buttonsIn(0)).toEqual(['Approve', 'Reject']);
    expect(buttonsIn(2)).toEqual(['View']);
    expect(buttonsIn(3)).toEqual(['View']);
  });

  it('hides Approve/Reject without approvals-action AND the source grant', () => {
    context$.next({ activeSession: '2026-2027', v2Permissions: { isSuperAdmin: false, modules: { approvals: { canView: true, canEdit: false }, 'approvals-action': { canView: true, canEdit: true } } } });
    render();
    expect(buttonsIn(0)).toEqual(['View']);
    context$.next({ activeSession: '2026-2027', v2Permissions: { isSuperAdmin: false, modules: { 'approvals-action': { canView: true, canEdit: true }, leave: { canView: true, canEdit: true } } } });
    render();
    expect(buttonsIn(0)).toEqual(['Approve', 'Reject']);
  });

  it('confirms first, then approves with an Idempotency-Key and updates the row in place', () => {
    api.decide.and.returnValue(of({ message: 'Leave approved.', row: row({ _id: 'p1', status: 'approved' }) }));
    component.onDecide(component.rows[0], 'approve');
    render();
    expect(api.decide).not.toHaveBeenCalled();
    const modal = fixture.nativeElement.querySelector('.sz-modal-overlay') as HTMLElement;
    expect(modal.querySelector('.modal-title')!.textContent!.trim()).toBe('Approve Request?');
    expect(modal.querySelector('.modal-body')!.textContent).toContain("Priya Sharma's request");

    component.onDecisionConfirm();
    render();
    expect(api.decide).toHaveBeenCalledWith('adm', 'leave', 'p1', 'approve', jasmine.any(String));
    expect(component.rows[0].status).toBe('approved');
    expect(buttonsIn(0)).toEqual(['View']);
    expect(component.summary).toEqual({ pending: 1, approved: 2, rejected: 1 });
  });

  it('reject uses the danger-filled confirm button', () => {
    component.onDecide(component.rows[0], 'reject');
    render();
    const confirm = fixture.nativeElement.querySelector('.sz-modal-overlay .btn-brand') as HTMLElement;
    expect(confirm.textContent!.trim()).toBe('Reject');
    expect(confirm.classList).toContain('danger-fill');
    component.onDecisionCancel();
    render();
  });

  it('a row someone else already actioned is removed with a toast', () => {
    api.decide.and.returnValue(throwError(() => ({ category: 'ConflictError', code: 'REQUEST_NOT_PENDING', message: 'This request has already been actioned.' })));
    component.onDecide(component.rows[1], 'reject');
    component.onDecisionConfirm();
    render();
    expect(component.rows.map((r) => r._id)).toEqual(['p1', 'a1', 'x1']);
    expect(snackBar.open).toHaveBeenCalledWith('Already actioned by someone else — refresh to see the latest.', 'Dismiss', jasmine.any(Object));
    expect(component.busy['p2']).toBeUndefined();
  });

  it('per-row in-flight flag: one row busy never blocks another', () => {
    component.busy = { p1: true };
    component.onDecide(component.rows[0], 'approve');
    expect(component.decision).toBeNull();
    component.onDecide(component.rows[1], 'approve');
    expect(component.decision!.row._id).toBe('p2');
  });

  it('keeps an empty inbox and a failed load visually distinct', () => {
    api.getRequests.and.returnValue(of(listOf([], { summary: { pending: 0, approved: 0, rejected: 0 } })));
    component.fetch();
    render();
    expect(fixture.nativeElement.querySelector('.tbl-empty:not(.load-error)').textContent).toContain('No requests match');
    expect(fixture.nativeElement.querySelector('.load-error')).toBeNull();

    api.getRequests.and.returnValue(throwError(() => new Error('down')));
    component.fetch();
    render();
    expect(fixture.nativeElement.querySelector('.load-error').textContent).toContain("Couldn't load approval requests.");
    expect(fixture.nativeElement.querySelector('.tbl-empty:not(.load-error)')).toBeNull();
  });

  it('a filter change goes back to page 1 with a fresh cursor chain', () => {
    api.getRequests.and.returnValue(of(listOf([row({ _id: 'p1' })], { total: 30, nextCursor: 'CUR2' })));
    component.fetch();
    component.onPageChange(2);
    expect(component.page).toBe(2);
    expect(api.getRequests.calls.mostRecent().args[1].cursor).toBe('CUR2');

    component.onStatusChange('pending');
    expect(component.page).toBe(1);
    const last = api.getRequests.calls.mostRecent().args[1];
    expect(last.cursor).toBe('');
    expect(last.status).toBe('pending');
  });

  it('the applicant cascade enables only its own side', () => {
    expect(component.departmentDisabled).toBeTrue();
    expect(component.classDisabled).toBeTrue();
    component.onApplicantChange('staff');
    expect(component.departmentDisabled).toBeFalse();
    expect(component.designationDisabled).toBeTrue();
    expect(component.classDisabled).toBeTrue();
    component.onApplicantChange('student');
    expect(component.classDisabled).toBeFalse();
    expect(component.departmentDisabled).toBeTrue();
  });

  it('an unknown request type still renders a details fallback', () => {
    expect(component.detailsOf(row({ type: 'future', details: '' }))).toBe('View details');
  });
});
