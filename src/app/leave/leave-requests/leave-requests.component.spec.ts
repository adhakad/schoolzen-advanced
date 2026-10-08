import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { LeaveRequestsService } from 'src/app/shared/services/leave/leave-requests.service';
import { LeaveTypesService } from 'src/app/shared/services/leave/leave-types.service';
import { LeaveFilterOptionsService } from 'src/app/shared/services/leave/leave-filter-options.service';
import { LeaveRequestRow } from 'src/app/shared/models/leave/leave-request.model';
import { EMPTY_FILTER_OPTIONS } from 'src/app/shared/models/leave/person-filter.model';
import { LeaveRequestsComponent, plannedDaysBetween } from './leave-requests.component';

const row = (overrides: Partial<LeaveRequestRow>): LeaveRequestRow => ({
  _id: 'r1', personType: 'staff', personId: 'p1', name: 'Priya Sharma', code: 'STF-0142', sub: 'Teacher',
  leaveTypeId: 't1', leaveTypeName: 'Casual Leave', leaveTypeMissing: false,
  fromDate: '2026-08-05', toDate: '2026-08-06', days: 2, reason: null, status: 'Pending', cancelReason: null,
  balance: { allocated: 12, used: 3, remaining: 9 }, actions: ['approve', 'reject'], ...overrides
});

describe('LeaveRequestsComponent', () => {
  let fixture: ComponentFixture<LeaveRequestsComponent>;
  let component: LeaveRequestsComponent;
  let api: jasmine.SpyObj<LeaveRequestsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<LeaveRequestsService>('LeaveRequestsService', ['getRequests', 'getPeople', 'approve', 'reject', 'delete', 'cancel']);
    api.getRequests.and.returnValue(of({
      rows: [
        row({ _id: 'pending' }),
        row({ _id: 'approved', status: 'Approved', actions: ['cancel'] }),
        row({ _id: 'rejected', status: 'Rejected', actions: ['delete'] })
      ],
      total: 3, page: 1, limit: 10, truncated: false,
      summary: { Pending: 1, Approved: 1, Rejected: 1, Cancelled: 0 }
    }));
    api.getPeople.and.returnValue(of({ rows: [] }));

    await TestBed.configureTestingModule({
      declarations: [LeaveRequestsComponent],
      providers: [
        { provide: LeaveRequestsService, useValue: api },
        { provide: LeaveTypesService, useValue: { getOptions: () => of({ rows: [] }) } },
        { provide: LeaveFilterOptionsService, useValue: { load: () => of({ options: EMPTY_FILTER_OPTIONS, complete: true }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(LeaveRequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const buttonsIn = (rowIndex: number): string[] => {
    const tr = fixture.nativeElement.querySelectorAll('tbody tr')[rowIndex] as HTMLElement;
    return Array.from(tr.querySelectorAll('.actions button')).map((b) => (b as HTMLElement).getAttribute('title') || '');
  };

  it('shows only the action its status allows, never all at once', () => {
    expect(buttonsIn(0)).toEqual(['Approve', 'Reject']);
    expect(buttonsIn(1)).toEqual(['Take back']);
    expect(buttonsIn(2)).toEqual(['Delete']);
  });

  it('approves only after the confirm, with an Idempotency-Key', () => {
    api.approve.and.returnValue(of({ message: 'ok', request: row({}) }));
    component.onApprove(component.rows[0]);
    expect(api.approve).not.toHaveBeenCalled();
    component.onConfirmed();
    expect(api.approve).toHaveBeenCalledWith('a1', 'pending', false, jasmine.any(String));
  });

  it('locks the row icons while a modal is open (no stacked double-click)', () => {
    component.onReject(component.rows[0]);
    component.onApprove(component.rows[0]);
    expect(component.confirmConfig.title).toBe('Reject Leave');
  });

  it('keeps Apply disabled until person, type and dates are chosen', () => {
    component.onApplyOpen();
    expect(component.applyDisabled).toBeTrue();
    component.applyPersonId = 'p1';
    component.applyLeaveTypeId = 't1';
    component.applyFrom = '2099-08-10';
    component.applyTo = '2099-08-11';
    expect(component.applyDisabled).toBeFalse();
  });

  it('client day preview skips Sundays (it may only overestimate)', () => {
    expect(plannedDaysBetween('2026-08-08', '2026-08-10')).toBe(2);
  });
});
