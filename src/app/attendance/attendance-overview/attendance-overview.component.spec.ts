import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, NEVER, of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceSocketService } from 'src/app/services/attendance-socket.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { AttendanceOverviewService } from 'src/app/shared/services/attendance/attendance-overview.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { AttendanceOverviewComponent } from './attendance-overview.component';

describe('AttendanceOverviewComponent', () => {
  let fixture: ComponentFixture<AttendanceOverviewComponent>;
  let component: AttendanceOverviewComponent;
  let api: jasmine.SpyObj<AttendanceOverviewService>;

  const classes = [
    { _id: 'c6', class: 6, label: '6th', hasStreams: false, sections: [{ _id: 's6a', name: 'A' }], streams: [] },
    {
      _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [],
      streams: [{ _id: 'sci', name: 'science', sections: [{ _id: 'sciA', name: 'A' }, { _id: 'sciB', name: 'B' }] }]
    }
  ];

  beforeEach(async () => {
    api = jasmine.createSpyObj<AttendanceOverviewService>('AttendanceOverviewService', ['getGrid', 'getLiveStatus', 'getRecentArrivals', 'syncNow', 'getDayPunches']);
    api.getGrid.and.returnValue(of({ month: '2026-08', personType: 'staff', today: '2026-08-10', days: [], rows: [], truncated: false }));
    api.getLiveStatus.and.returnValue(NEVER);
    api.getRecentArrivals.and.returnValue(NEVER);
    api.syncNow.and.returnValue(of({ message: 'queued', jobId: 'j', dateKey: '2026-08-10' }));

    await TestBed.configureTestingModule({
      declarations: [AttendanceOverviewComponent],
      providers: [
        { provide: AttendanceOverviewService, useValue: api },
        { provide: DepartmentsService, useValue: { getOptions: () => of({ rows: [{ _id: 'd1', name: 'Teaching', status: 'active' }] }) } },
        { provide: DesignationsService, useValue: { getOptions: () => of({ rows: [{ _id: 'g1', title: 'PRT', departmentId: 'd1' }] }) } },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({ classes, groups: [] }) } },
        { provide: AttendanceSocketService, useValue: { onEvent: () => NEVER } },
        { provide: ShellContextService, useValue: { context: new BehaviorSubject({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AttendanceOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('Sync now opens a confirm and never fires on the click itself', () => {
    component.onSyncClick();
    expect(component.syncConfirmOpen).toBeTrue();
    expect(api.syncNow).not.toHaveBeenCalled();
    component.onSyncConfirmed();
    expect(api.syncNow).toHaveBeenCalledWith('a1');
  });

  it('staff cascade: Department enables Designation; student filters stay disabled', () => {
    expect(component.designationDisabled).toBeTrue();
    expect(component.classDisabled).toBeTrue();
    component.onDepartmentChange('d1');
    expect(component.designationDisabled).toBeFalse();
    expect(component.designationOptions.map((o) => o.label)).toContain('PRT');
  });

  it('student cascade: Class → Stream (11th/12th only) → Section, resetting what depends on it', () => {
    component.onDepartmentChange('d1');
    component.onPersonTypeChange('student');
    expect(component.departmentId).toBe('');
    expect(component.departmentDisabled).toBeTrue();
    expect(component.classDisabled).toBeFalse();

    component.onClassChange('c6');
    expect(component.streamDisabled).toBeTrue();
    expect(component.sectionOptions.map((o) => o.label)).toEqual(['All sections', 'Section A']);

    component.onClassChange('c11');
    expect(component.streamDisabled).toBeFalse();
    expect(component.sectionDisabled).toBeTrue();
    component.onStreamChange('sci');
    expect(component.sectionOptions.length).toBe(3);
    component.onSectionChange('sciA');
    component.onClassChange('c6');
    expect(component.streamId).toBe('');
    expect(component.sectionId).toBe('');
  });
});
