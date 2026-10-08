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
        { _id: 'p2', name: 'Neha', empCode: 'STF-2', designation: null, days: {} }
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
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({ classes: [{ _id: 'c1', class: 6, label: '6th', hasStreams: false, sections: [{ _id: 'x', name: 'A' }], streams: [] }], groups: [] }) } },
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

  it('cascades Department → Designation for staff, Class → Section for students', () => {
    expect(component.thirdDisabled).toBeTrue();
    component.onSecondChange('d1');
    expect(component.thirdDisabled).toBeFalse();
    expect(component.thirdOptions.map((o) => o.label)).toContain('PRT');

    component.onPersonTypeChange('student');
    expect(component.departmentId).toBe('');
    expect(component.secondOptions.map((o) => o.label)).toContain('6th');
    expect(component.thirdDisabled).toBeTrue();
    component.onSecondChange('c1');
    expect(component.thirdDisabled).toBeFalse();
    expect(component.thirdOptions.map((o) => o.label)).toContain('Section A');
  });
});
