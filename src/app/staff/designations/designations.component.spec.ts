import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { DesignationsComponent, NO_DEPARTMENT } from './designations.component';

describe('DesignationsComponent', () => {
  let fixture: ComponentFixture<DesignationsComponent>;
  let component: DesignationsComponent;
  let api: jasmine.SpyObj<DesignationsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<DesignationsService>('DesignationsService', ['getDesignations', 'createDesignation', 'deleteDesignation']);
    api.getDesignations.and.returnValue(of({
      rows: [{ _id: 'g3', title: 'Peon', departmentId: null, department: null, status: 'active', staffCount: 2 }],
      total: 1, page: 1, limit: 10, summary: { total: 1, active: 1 }
    }));
    api.createDesignation.and.returnValue(of({ message: 'ok' }));
    api.deleteDesignation.and.returnValue(of({ message: 'ok' }));

    await TestBed.configureTestingModule({
      declarations: [DesignationsComponent],
      providers: [
        { provide: DesignationsService, useValue: api },
        { provide: DepartmentsService, useValue: { getOptions: () => of({ rows: [{ _id: 'd1', name: 'Teaching', status: 'active' }] }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(DesignationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lets a designation stand alone: "-- None --" submits departmentId null', () => {
    component.onCreate();
    expect(component.formDepartmentOptions[0]).toEqual({ value: '', label: '-- None --' });
    component.onTitleChange('Peon');
    component.onFormSubmit();
    expect(api.createDesignation).toHaveBeenCalledWith({ adminId: 'a1', title: 'Peon', departmentId: null, status: 'active' });
  });

  it('filters by "Not set" for standalone designations', () => {
    expect(component.filterOptions.map((o) => o.value)).toContain(NO_DEPARTMENT);
    component.onDepartmentFilter(NO_DEPARTMENT);
    expect(api.getDesignations).toHaveBeenCalledWith('a1', jasmine.objectContaining({ departmentId: 'none' }));
  });

  it('requires typing DELETE when the designation is held by staff', () => {
    component.onDelete(component.rows[0]);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
  });
});
