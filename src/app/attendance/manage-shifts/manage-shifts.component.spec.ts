import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShiftsService } from 'src/app/shared/services/attendance/shifts.service';
import { Shift } from 'src/app/shared/models/attendance/shift.model';
import { ManageShiftsComponent } from './manage-shifts.component';

const shift = (overrides: Partial<Shift>): Shift => ({
  _id: 's1', name: 'Morning Shift', code: 'M', startTime: '08:00', endTime: '14:00',
  earlyInMinutes: 15, graceMinutes: 10, halfDayAfterMinutes: 120, earlyOutMinutes: 30, lateOutMinutes: 60,
  status: 'active', people: 0, classes: 0, ...overrides
});

describe('ManageShiftsComponent', () => {
  let fixture: ComponentFixture<ManageShiftsComponent>;
  let component: ManageShiftsComponent;
  let api: jasmine.SpyObj<ShiftsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ShiftsService>('ShiftsService', ['getShifts', 'deleteShift', 'createShift']);
    api.getShifts.and.returnValue(of({
      rows: [shift({ _id: 's1', people: 12, classes: 3 }), shift({ _id: 's2', name: 'Old Summer Shift' })],
      total: 2, page: 1, limit: 10, summary: { total: 2, active: 2, inactive: 0 }
    }));
    api.deleteShift.and.returnValue(of({ message: 'ok' }));

    await TestBed.configureTestingModule({
      declarations: [ManageShiftsComponent],
      providers: [
        { provide: ShiftsService, useValue: api },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageShiftsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('blocks deleting an in-use shift and names the assigned count', () => {
    component.onDelete(component.rows[0]);
    expect(component.confirmConfig.blocked).toBeTrue();
    expect(component.confirmConfig.message).toContain('12 people');
    expect(component.confirmConfig.message).toContain('3 classes');
    component.onConfirmed();
    expect(api.deleteShift).not.toHaveBeenCalled();
  });

  it('deletes an unused shift only behind typed DELETE', () => {
    component.onDelete(component.rows[1]);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    component.onConfirmed();
    expect(api.deleteShift).toHaveBeenCalledWith('a1', 's2');
  });

  it('refuses an end time before the start time without calling the API', () => {
    component.onCreate();
    component.onFieldChange('name', 'Night');
    component.onFieldChange('earlyInMinutes', '10');
    component.onFieldChange('graceMinutes', '5');
    component.onTimeChange('startTime', '14:00');
    component.onTimeChange('endTime', '08:00');
    expect(component.fieldErrors['endTime']).toContain('after');
    component.onFormSubmit();
    expect(api.createShift).not.toHaveBeenCalled();
  });

  it('Start / End offer every 15 minutes, 12:00 AM … 11:45 PM, choose-only', () => {
    expect(component.timeOptions.length).toBe(96);
    expect(component.timeOptions[0]).toEqual({ value: '00:00', label: '12:00 AM' });
    expect(component.timeOptions[33]).toEqual({ value: '08:15', label: '8:15 AM' });
    expect(component.timeOptions[95]).toEqual({ value: '23:45', label: '11:45 PM' });
  });

  it('Submit stays disabled until Early Punch and Grace are valid numbers', () => {
    component.onCreate();
    component.onFieldChange('name', 'Morning');
    component.onTimeChange('startTime', '08:00');
    component.onTimeChange('endTime', '14:00');
    expect(component.submitDisabled).toBeTrue();
    component.onFieldChange('earlyInMinutes', '15');
    expect(component.submitDisabled).toBeTrue();
    component.onFieldChange('graceMinutes', 'abc');
    expect(component.submitDisabled).toBeTrue();
    component.onFieldChange('graceMinutes', '0');
    expect(component.submitDisabled).toBeFalse();
  });

  it('edit prefills the time dropdowns from the stored HH:mm', () => {
    component.onEdit(component.rows[0]);
    expect(component.form.startTime).toBe('08:00');
    expect(component.form.endTime).toBe('14:00');
  });
});
