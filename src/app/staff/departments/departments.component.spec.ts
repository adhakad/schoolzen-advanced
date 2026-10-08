import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DepartmentsComponent } from './departments.component';

describe('DepartmentsComponent', () => {
  let fixture: ComponentFixture<DepartmentsComponent>;
  let component: DepartmentsComponent;
  let api: jasmine.SpyObj<DepartmentsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<DepartmentsService>('DepartmentsService', ['getDepartments', 'deleteDepartment']);
    api.getDepartments.and.returnValue(of({
      rows: [
        { _id: 'd1', name: 'Teaching', status: 'active', staffCount: 4, designationCount: 2 },
        { _id: 'd2', name: 'Support', status: 'inactive', staffCount: 0, designationCount: 0 }
      ],
      total: 2, page: 1, limit: 10, summary: { total: 2, active: 1 }
    }));
    api.deleteDepartment.and.returnValue(of({ message: 'ok' }));

    await TestBed.configureTestingModule({
      declarations: [DepartmentsComponent],
      providers: [
        { provide: DepartmentsService, useValue: api },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(DepartmentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('requires typing DELETE and shows both counts for a department in use', () => {
    component.onDelete(component.rows[0]);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.scopeNote).toContain('4 staff');
    expect(component.confirmConfig.scopeNote).toContain('2 designations');
  });

  it('does not ask for typed confirmation when nothing uses the department', () => {
    component.onDelete(component.rows[1]);
    expect(component.confirmConfig.typeToConfirm).toBeUndefined();
    component.onConfirmed();
    expect(api.deleteDepartment).toHaveBeenCalledWith('a1', 'd2', true);
  });
});
