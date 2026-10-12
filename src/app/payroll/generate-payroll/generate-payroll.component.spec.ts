import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { GeneratePayrollService } from 'src/app/shared/services/payroll/generate-payroll.service';
import { PayrollRunListResponse, PayrollRunRow, PayrollRunStatus } from 'src/app/shared/models/payroll/payroll-run.model';
import { GeneratePayrollComponent } from './generate-payroll.component';

const ACTIONS: Record<PayrollRunStatus, PayrollRunRow['actions']> = {
  pending: ['generate'], draft: ['regenerate', 'lock'], locked: ['slip', 'unlock']
};

const row = (staffId: string, name: string, status: PayrollRunStatus): PayrollRunRow => ({
  _id: status === 'pending' ? null : 'run-' + staffId, staffId, name, code: null, designation: 'Teacher', department: null,
  status, actions: ACTIONS[status], attendance: null,
  gross: status === 'pending' ? null : 26000, deductions: status === 'pending' ? null : 3000, net: status === 'pending' ? null : 23000,
  mode: 'monthly', salaryGroupName: 'Grade A'
});

const list = (canEdit: boolean): PayrollRunListResponse => ({
  rows: [row('s1', 'Rahul Verma', 'pending'), row('s2', 'Amit Joshi', 'draft'), row('s3', 'Priya Sharma', 'locked')],
  nextCursor: null, total: 3, truncated: false,
  summary: { totalPayroll: 36800, locked: 1, draft: 1, totalStaff: 3 },
  canEdit
});

describe('GeneratePayrollComponent', () => {
  let fixture: ComponentFixture<GeneratePayrollComponent>;
  let api: jasmine.SpyObj<GeneratePayrollService>;

  const setup = async (response: PayrollRunListResponse) => {
    api = jasmine.createSpyObj<GeneratePayrollService>('GeneratePayrollService', ['list', 'generate', 'bulkGenerate', 'lock', 'unlock']);
    api.list.and.returnValue(of(response));
    await TestBed.configureTestingModule({
      declarations: [GeneratePayrollComponent],
      providers: [
        { provide: GeneratePayrollService, useValue: api },
        { provide: JobStatusService, useValue: { watch: () => of() } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(GeneratePayrollComponent);
    fixture.detectChanges();
  };

  /** The `bi-*` icon of every action button in the row with this status. */
  const icons = (status: PayrollRunStatus): string[] => {
    const tr = fixture.nativeElement.querySelector(`tr[data-status="${status}"]`) as HTMLElement;
    return Array.from(tr.querySelectorAll('.actions .icon-btn i')).map((i) =>
      Array.from((i as HTMLElement).classList).find((c) => c.startsWith('bi-')) || '');
  };

  it('shows exactly one action set per status, matching the reference', async () => {
    await setup(list(true));
    expect(icons('pending')).toEqual(['bi-play-fill']);
    expect(icons('draft')).toEqual(['bi-arrow-repeat', 'bi-lock']);
    expect(icons('locked')).toEqual(['bi-box-arrow-up-right', 'bi-unlock']);
    const pendingRow = fixture.nativeElement.querySelector('tr[data-status="pending"]') as HTMLElement;
    expect(pendingRow.textContent).toContain('Not generated');
  });

  it('keeps only View slip without the payroll-generate edit grant', async () => {
    await setup(list(false));
    expect(fixture.nativeElement.querySelector('.btn-gen')).toBeNull();
    expect(icons('pending')).toEqual([]);
    expect(icons('draft')).toEqual([]);
    expect(icons('locked')).toEqual(['bi-box-arrow-up-right']);
  });

  it('unlock confirms first and only then calls the API', async () => {
    await setup(list(true));
    api.unlock.and.returnValue(of({ message: 'Payslip unlocked.', row: row('s3', 'Priya Sharma', 'draft') }));
    const locked = fixture.componentInstance.rows[2];
    fixture.componentInstance.openConfirm('unlock', locked);
    expect(api.unlock).not.toHaveBeenCalled();
    fixture.componentInstance.applyConfirm();
    expect(api.unlock).toHaveBeenCalledWith('a1', 'run-s3', jasmine.any(String));
    expect(fixture.componentInstance.rows[2].status).toBe('draft');
  });
});
