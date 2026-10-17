import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { RosterService } from 'src/app/shared/services/attendance/roster.service';
import { ShiftsService } from 'src/app/shared/services/attendance/shifts.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { StaffRosterResponse } from 'src/app/shared/models/attendance/roster.model';
import { RosterComponent } from './roster.component';

describe('RosterComponent', () => {
  let fixture: ComponentFixture<RosterComponent>;
  let component: RosterComponent;
  let api: jasmine.SpyObj<RosterService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<RosterService>('RosterService', ['getStaffRoster', 'getClassShifts', 'clearStaff']);
    api.getStaffRoster.and.returnValue(of<StaffRosterResponse>({
      month: '2026-08', days: [], truncated: false,
      rows: [
        { _id: 'p1', name: 'Priya', empCode: 'STF-1', designation: null, days: { '2099-08-20': 's1' } },
        { _id: 'p2', name: 'Neha', empCode: 'STF-2', designation: null, days: {} },
        // Deleted earlier: only the locked past keeps its shift.
        { _id: 'p3', name: 'Sanjay', empCode: 'STF-3', designation: null, days: { '2020-01-06': 's1' } }
      ],
      legend: { shifts: [], weekOff: false }, stats: { byShift: [], unassigned: 1 }
    }));
    api.getClassShifts.and.returnValue(of({ rows: [], legend: { shifts: [], weekOff: false }, stats: { byShift: [], unassigned: 0 } }));
    api.clearStaff.and.returnValue(of({ message: 'ok', updated: 1, failed: [], warning: null }));

    await TestBed.configureTestingModule({
      declarations: [RosterComponent],
      providers: [
        { provide: RosterService, useValue: api },
        { provide: ShiftsService, useValue: { getOptions: () => of({ rows: [] }) } },
        { provide: DepartmentsService, useValue: { getOptions: () => of({ rows: [{ _id: 'd1', name: 'Teaching', status: 'active' }] }) } },
        { provide: DesignationsService, useValue: { getOptions: () => of({ rows: [{ _id: 'g1', title: 'PRT', departmentId: 'd1' }] }) } },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({
          classes: [
            { _id: 'c1', class: 6, label: '6th', hasStreams: false, sections: [{ _id: 'x', name: 'A' }], streams: [] },
            { _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [], streams: [{ _id: 'sci', name: 'science', sections: [{ _id: 'sA', name: 'A' }] }] }
          ],
          groups: [
            { _id: 'gen', name: 'General', classId: 'c1', streamId: null, isSystemGroup: true },
            { _id: 'pcm', name: 'PCM', classId: 'c11', streamId: 'sci' }
          ]
        }) } },
        { provide: ShellContextService, useValue: { context: new BehaviorSubject({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(RosterComponent);
    component = fixture.componentInstance;
    component.month = '2099-08';
    fixture.detectChanges();
  });

  it('Delete Selected needs typed DELETE before anything is cleared', () => {
    component.toggleRow('p1');
    component.onDeleteSelected();
    expect(component.confirmOpen).toBeTrue();
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(api.clearStaff).not.toHaveBeenCalled();
    component.onConfirmed();
    expect(api.clearStaff).toHaveBeenCalledWith(jasmine.objectContaining({ staffIds: ['p1'], confirmed: true }));
  });

  it('warns on a mixed selection and disables Assign and Edit', () => {
    component.toggleRow('p1');
    component.toggleRow('p2');
    expect(component.mixedSelection).toBeTrue();
    expect(component.assignDisabled).toBeTrue();
    expect(component.editDisabled).toBeTrue();
  });

  it('cascades Department → Designation for staff; Class → Stream → Stream Group → Section for students', () => {
    expect(component.designationDisabled).toBeTrue();
    component.onDepartmentChange('d1');
    expect(component.designationDisabled).toBeFalse();
    expect(component.designationOptions.map((o) => o.label)).toContain('PRT');

    component.onPersonTypeChange('student');
    expect(component.departmentId).toBe('');
    expect(component.classOptions.map((o) => o.label)).toContain('6th');
    // A General-group class: nothing to pick — the disabled pill keeps its "All …" label.
    component.onClassChange('c1');
    expect(component.streamDisabled).toBeTrue();
    expect(component.groupDisabled).toBeTrue();
    expect(component.groupOptions[0].label).toBe('All stream groups');
    expect(component.sectionOptions.map((o) => o.label)).toContain('Section A');

    component.onClassChange('c11');
    expect(component.streamDisabled).toBeFalse();
    expect(component.groupDisabled).toBeTrue();
    component.onStreamChange('sci');
    expect(component.groupOptions.map((o) => o.label)).toEqual(['All stream groups', 'PCM']);
    component.onGroupChange('pcm');
    component.onClassChange('c1');
    expect(component.streamId).toBe('');
    expect(component.groupId).toBe('');
  });

  it('a deleted row (shift only on locked past days) reads unassigned: Assign on, Edit off', () => {
    component.toggleRow('p3');
    expect(component.assignDisabled).toBeFalse();
    expect(component.editDisabled).toBeTrue();
    expect(component.deleteDisabled).toBeTrue();
  });

  it('delete → the cleared row can be assigned again straight away', () => {
    component.toggleRow('p1');
    expect(component.assignDisabled).toBeTrue();
    component.onDeleteSelected();
    // The server's next answer: today onward is gone for p1.
    api.getStaffRoster.and.returnValue(of<StaffRosterResponse>({
      month: '2099-08', days: [], truncated: false,
      rows: [{ _id: 'p1', name: 'Priya', empCode: 'STF-1', designation: null, days: {} }],
      legend: { shifts: [], weekOff: false }, stats: { byShift: [], unassigned: 1 }
    }));
    component.onConfirmed();
    expect(component.selected.size).toBe(0);
    expect(component.confirmOpen).toBeFalse();
    component.toggleRow('p1');
    expect(component.assignDisabled).toBeFalse();
    expect(component.editDisabled).toBeTrue();
  });

  it('shift options show 12-hour AM/PM times', () => {
    component.shifts = [{ _id: 's1', name: 'Morning', code: 'M', startTime: '08:00', endTime: '14:00', earlyInMinutes: 15, graceMinutes: 5,
      halfDayAfterMinutes: null, earlyOutMinutes: null, lateOutMinutes: null, status: 'active' } as any];
    expect(component.shiftOptions[1].label).toBe('Morning · 8:00 AM – 2:00 PM');
  });

  it('weekly off defaults to Sunday, and every day toggles like the others', () => {
    component.toggleRow('p2');
    component.openAssign();
    expect(component.assignWeekdays.has(0)).toBeFalse();
    expect([1, 2, 3, 4, 5, 6].every((day) => component.assignWeekdays.has(day))).toBeTrue();
    component.toggleWeekday(0);
    expect(component.assignWeekdays.has(0)).toBeTrue();
    component.toggleWeekday(3);
    expect(component.assignWeekdays.has(3)).toBeFalse();
  });
});
