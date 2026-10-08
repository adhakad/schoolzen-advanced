import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ManageStaffService } from 'src/app/shared/services/staff/manage-staff.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { StaffRow } from 'src/app/shared/models/staff/staff.model';
import { ManageStaffComponent, VERIFY_MODE_OPTIONS } from './manage-staff.component';

const ROW: StaffRow = {
  _id: 'st1', name: 'Priya Sharma', empCode: 'STF-1', departmentId: null, designationId: null,
  department: null, designation: null, joiningDate: null, status: 'active', card: null, verifyMode: 4, isOwner: false
};

describe('ManageStaffComponent', () => {
  let fixture: ComponentFixture<ManageStaffComponent>;
  let component: ManageStaffComponent;
  let api: jasmine.SpyObj<ManageStaffService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ManageStaffService>('ManageStaffService', ['getStaff', 'createStaff', 'bulkDelete']);
    api.getStaff.and.returnValue(of({ rows: [ROW], total: 1, page: 1, limit: 10, summary: { total: 1, cardsAssigned: 0 } }));
    api.createStaff.and.returnValue(of({ message: 'ok', staff: ROW }));
    api.bulkDelete.and.returnValue(of({
      message: '1 of 1 staff removed.', deletedCount: 1, blockedCount: 0, notFoundCount: 0,
      results: [{ id: 'st1', status: 'deleted' as const }]
    }));

    await TestBed.configureTestingModule({
      declarations: [ManageStaffComponent],
      providers: [
        { provide: ManageStaffService, useValue: api },
        {
          provide: DepartmentsService,
          useValue: { getOptions: () => of({ rows: [{ _id: 'd1', name: 'Teaching', status: 'active' }, { _id: 'd2', name: 'Admin', status: 'active' }] }) }
        },
        {
          provide: DesignationsService,
          useValue: {
            getOptions: () => of({
              rows: [
                { _id: 'g1', title: 'Primary Teacher', departmentId: 'd1', department: 'Teaching', status: 'active' },
                { _id: 'g2', title: 'Accountant', departmentId: 'd2', department: 'Admin', status: 'active' },
                { _id: 'g3', title: 'Peon', departmentId: null, department: null, status: 'active' }
              ]
            })
          }
        },
        { provide: JobStatusService, useValue: { watch: () => of() } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageStaffComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps the form Designation disabled until a Department is picked, then lists only that department`s', () => {
    component.onCreate();
    expect(component.formDesignationDisabled).toBe(true);

    component.onFormDepartmentChange('d1');
    expect(component.formDesignationDisabled).toBe(false);
    expect(component.formDesignationOptions.map((o) => o.value)).toEqual(['', 'g1']);
  });

  it('clears the designation when the department changes', () => {
    component.onCreate();
    component.onFormDepartmentChange('d1');
    component.onFormDesignationChange('g1');
    component.onFormDepartmentChange('d2');
    expect(component.form.designationId).toBe('');
  });

  it('keeps the Designation filter disabled until a Department filter is chosen', () => {
    expect(component.designationFilterDisabled).toBe(true);
    component.onDepartmentFilter('d2');
    expect(component.designationFilterDisabled).toBe(false);
    expect(component.designationFilterOptions.map((o) => o.value)).toEqual(['', 'g2']);
  });

  it('offers three verify modes: Card only, Card + PIN, Card + Fingerprint', () => {
    expect(VERIFY_MODE_OPTIONS.map((o) => o.label)).toEqual(['Card only', 'Card + PIN', 'Card + Fingerprint']);
  });

  it('requires typing DELETE and names the access revocation before deleting', () => {
    component.onDelete(ROW);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.scopeNote).toContain('access will be revoked');

    component.onConfirmed();
    expect(api.bulkDelete).toHaveBeenCalledWith('a1', ['st1']);
  });
});
