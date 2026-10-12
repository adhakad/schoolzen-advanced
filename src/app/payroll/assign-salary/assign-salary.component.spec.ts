import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AssignSalaryService } from 'src/app/shared/services/payroll/assign-salary.service';
import { SalaryGroupsService } from 'src/app/shared/services/payroll/salary-groups.service';
import { AssignGridResponse } from 'src/app/shared/models/payroll/assign-salary.model';
import { AssignSalaryComponent } from './assign-salary.component';

const assignment = (hasOverride: boolean, basic: number | null) => ({
  salaryGroupId: 'g1', groupName: 'Primary Teacher Grade A', groupMissing: false, mode: 'monthly' as const,
  effectiveFrom: '2026-04-01', overrides: { basic, hra: null, allowances: [{ name: 'Medical', amount: 500 }], deductions: null }, hasOverride
});

const grid = (canEdit: boolean): AssignGridResponse => ({
  rows: [
    { _id: 'p1', name: 'Priya Sharma', code: 'STF-0142', department: null, designation: 'Primary Teacher', assignment: assignment(false, null) },
    { _id: 'p2', name: 'Kavita Rao', code: 'STF-0163', department: null, designation: 'Primary Teacher', assignment: null },
    { _id: 'p3', name: 'Sanjay Mehta', code: 'STF-0071', department: null, designation: 'Primary Teacher', assignment: assignment(true, 25000) }
  ],
  total: 3, page: 1, limit: 25, truncated: false,
  summary: { staff: 3, assigned: 2, withOverride: 1 },
  canEdit
});

describe('AssignSalaryComponent', () => {
  let fixture: ComponentFixture<AssignSalaryComponent>;
  let component: AssignSalaryComponent;
  let api: jasmine.SpyObj<AssignSalaryService>;

  const setup = async (response: AssignGridResponse) => {
    api = jasmine.createSpyObj<AssignSalaryService>('AssignSalaryService', ['grid', 'assign', 'bulkAssign']);
    api.grid.and.returnValue(of(response));
    await TestBed.configureTestingModule({
      declarations: [AssignSalaryComponent],
      providers: [
        { provide: AssignSalaryService, useValue: api },
        { provide: SalaryGroupsService, useValue: { options: () => of({ rows: [] }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(AssignSalaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const rowText = (index: number): string =>
    (fixture.nativeElement.querySelectorAll('tbody tr')[index] as HTMLElement).textContent || '';

  it('flags only the person whose figures deviate, and labels Assign vs Change', async () => {
    await setup(grid(true));
    expect(rowText(0)).not.toContain('Has a personal override');
    expect(rowText(2)).toContain('Has a personal override');
    expect(rowText(1)).toContain('Not assigned');
    expect(rowText(1)).toContain('Assign');
    expect(rowText(0)).toContain('Change');
  });

  it('changing Basic keeps the person\'s other overrides — a merge, never a wholesale replace', async () => {
    await setup(grid(true));
    api.assign.and.returnValue(of({ message: 'ok', assignment: assignment(true, 26000) }));
    component.openSingle(component.rows[2]);
    component.form = { ...component.form, basic: '26000' };
    component.submit();
    const overrides = api.assign.calls.mostRecent().args[0].overrides;
    expect(overrides.basic).toBe(26000);
    expect(overrides.hra).toBeNull();
    expect(overrides.allowances).toEqual([{ name: 'Medical', amount: 500 }]);
  });

  it('hides every assign control without the payroll-assign edit grant', async () => {
    await setup(grid(false));
    expect(fixture.nativeElement.querySelector('.btn-assign')).toBeNull();
    expect(fixture.nativeElement.querySelector('.row-action-btn')).toBeNull();
  });
});
