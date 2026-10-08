import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { LeaveTypesService } from 'src/app/shared/services/leave/leave-types.service';
import { LeaveType } from 'src/app/shared/models/leave/leave-type.model';
import { LeaveCreateComponent } from './leave-create.component';

const type = (overrides: Partial<LeaveType>): LeaveType => ({
  _id: 't1', name: 'Casual Leave', whoCanTake: 'everyone', defaultDays: 12, isPaid: true, status: 'active',
  assignments: 0, requests: 0, ...overrides
});

describe('LeaveCreateComponent', () => {
  let fixture: ComponentFixture<LeaveCreateComponent>;
  let component: LeaveCreateComponent;
  let api: jasmine.SpyObj<LeaveTypesService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<LeaveTypesService>('LeaveTypesService', ['getTypes', 'createType', 'deleteType']);
    api.getTypes.and.returnValue(of({
      rows: [type({ _id: 't1', assignments: 200, requests: 2 }), type({ _id: 't2', name: 'Study Leave' })],
      total: 2, page: 1, limit: 10, summary: { total: 2, active: 2 }
    }));
    api.createType.and.returnValue(of({ message: 'ok', leaveType: type({}) }));

    await TestBed.configureTestingModule({
      declarations: [LeaveCreateComponent],
      providers: [
        { provide: LeaveTypesService, useValue: api },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(LeaveCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps Submit disabled until name and a valid day count are set', () => {
    component.onCreate();
    expect(component.submitDisabled).toBeTrue();
    component.onNameChange('Sick Leave');
    component.onDaysChange('-5');
    expect(component.submitDisabled).toBeTrue();
    component.onDaysChange('8');
    expect(component.submitDisabled).toBeFalse();
  });

  it('sends isPaid:false when salary is not paid (read by Payroll)', () => {
    component.onCreate();
    component.onNameChange('Unpaid Leave');
    component.onDaysChange('10');
    component.onPaidChange(false);
    component.onFormSubmit();
    expect(api.createType.calls.mostRecent().args[0].isPaid).toBeFalse();
  });

  it('blocks deleting a type in use, naming assignments and requests', () => {
    component.onDelete(component.rows[0]);
    expect(component.confirmConfig.blocked).toBeTrue();
    expect(component.confirmConfig.message).toContain('200 assignments');
    expect(component.confirmConfig.message).toContain('2 requests');
    component.onConfirmed();
    expect(api.deleteType).not.toHaveBeenCalled();
  });
});
