import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { LeaveAssignService } from 'src/app/shared/services/leave/leave-assign.service';
import { LeaveFilterOptionsService } from 'src/app/shared/services/leave/leave-filter-options.service';
import { LeaveType } from 'src/app/shared/models/leave/leave-type.model';
import { StaffGridResponse } from 'src/app/shared/models/leave/leave-limit.model';
import { EMPTY_FILTER_OPTIONS } from 'src/app/shared/models/leave/person-filter.model';
import { LeaveAssignComponent } from './leave-assign.component';

const type = (id: string, name: string): LeaveType => ({ _id: id, name, whoCanTake: 'everyone', defaultDays: 12, isPaid: true, status: 'active' });

const grid = (types: LeaveType[], canAssign: boolean): StaffGridResponse => ({
  leaveTypes: types,
  rows: [{ _id: 'p1', name: 'Priya Sharma', code: 'STF-0142', department: 'Teaching', sub: 'Teacher', limits: { [types[0]._id]: { allocated: 12, used: 3 } } }],
  total: 1, page: 1, limit: 25, truncated: false,
  summary: { people: 1, fullySet: 0, types: types.length },
  canAssign
});

describe('LeaveAssignComponent', () => {
  let fixture: ComponentFixture<LeaveAssignComponent>;
  let component: LeaveAssignComponent;
  let api: jasmine.SpyObj<LeaveAssignService>;

  const setup = async (response: StaffGridResponse) => {
    api = jasmine.createSpyObj<LeaveAssignService>('LeaveAssignService', ['getStaffGrid', 'getClassGrid', 'bulkAssignStaff', 'assignClasses']);
    api.getStaffGrid.and.returnValue(of(response));
    await TestBed.configureTestingModule({
      declarations: [LeaveAssignComponent],
      providers: [
        { provide: LeaveAssignService, useValue: api },
        { provide: LeaveFilterOptionsService, useValue: { load: () => of({ options: EMPTY_FILTER_OPTIONS, complete: true }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(LeaveAssignComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const headers = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('thead th')).map((th) => (th as HTMLElement).textContent?.trim() || '');

  it('builds one column per leave type from the API — not a fixed set', async () => {
    await setup(grid([type('t1', 'Casual Leave'), type('t2', 'Sick Leave'), type('t3', 'Study Leave')], true));
    expect(headers()).toEqual(['', 'Name', 'Department', 'Casual Leave', 'Sick Leave', 'Study Leave']);
  });

  it('hides every assign control without the leave-limit edit permission', async () => {
    await setup(grid([type('t1', 'Casual Leave')], false));
    expect(fixture.nativeElement.querySelector('.btn-assign')).toBeNull();
    expect(headers()).toEqual(['Name', 'Department', 'Casual Leave']);
    component.selected.add('p1');
    component.onAssignOpen();
    expect(component.assignOpen).toBeFalse();
  });

  it('asks before overwriting students\' own limits on a class re-assign', async () => {
    await setup(grid([type('t1', 'Casual Leave')], true));
    component.filter = { ...component.filter, personType: 'student' };
    api.assignClasses.and.returnValue(throwError(() => ({ category: 'ConflictError', code: 'LEAVE_OVERRIDES_EXIST', message: '2 students have their own limit', requestId: 'x' })));
    (component as unknown as { assignTargets: unknown[] }).assignTargets = [{ classId: 'c1', streamId: null, sectionId: null }];
    component.choices = [{ type: type('t1', 'Casual Leave'), checked: true, days: '10' }];
    component.onAssignSubmit();
    expect(component.confirmOpen).toBeTrue();
    expect(api.assignClasses.calls.mostRecent().args[0].overwriteOverrides).toBeFalse();
    component.onOverwriteConfirmed();
    const body = api.assignClasses.calls.mostRecent().args[0];
    expect(body.overwriteOverrides).toBeTrue();
    expect(body.confirmed).toBeTrue();
  });
});
