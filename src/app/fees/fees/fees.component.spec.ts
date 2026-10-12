import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { FeesService } from 'src/app/shared/services/fees/fees.service';
import { FeeStatementService } from 'src/app/shared/services/fees/fee-statement.service';
import { FeeRow, FeesListResponse } from 'src/app/shared/models/fees/fees.model';
import { FeesComponent } from './fees.component';

// 8th this year (₹20,000 due) + 7th last year (₹6,500 arrear) — the reference's Rohan Kapoor.
const row = (overrides: Partial<FeeRow> = {}): FeeRow => ({
  _id: 'e1', studentId: 's1', name: 'Rohan Kapoor', admissionNo: 2024142, fatherName: 'Suresh Kapoor',
  className: '8th', streamName: null, groupName: null, hasRecord: true, recordId: 'r8',
  concession: 0, gross: 42000, paid: 22000, currentDue: 20000, arrearsDue: 6500, due: 26500, total: 42000,
  status: 'has-arrears', statusLabel: 'Has Arrears', collectedBy: 'Abhishek',
  arrears: [{ sessionLabel: '2025-2026', sessionShort: '2025-26', className: '7th', due: 6500 }],
  ...overrides
});

describe('FeesComponent', () => {
  let fixture: ComponentFixture<FeesComponent>;
  let component: FeesComponent;
  let api: jasmine.SpyObj<FeesService>;

  const setup = async (response: Partial<FeesListResponse>) => {
    api = jasmine.createSpyObj<FeesService>('FeesService', ['list', 'collect', 'updateConcession', 'receipt', 'report']);
    api.list.and.returnValue(of({ rows: [], nextCursor: null, summary: null, canCollect: true, canWaive: false, ...response } as FeesListResponse));
    await TestBed.configureTestingModule({
      declarations: [FeesComponent],
      providers: [
        { provide: FeesService, useValue: api },
        { provide: FeeStatementService, useValue: { get: () => of(null) } },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({ classes: [], groups: [] }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: Router, useValue: { navigate: () => undefined } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(FeesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('shows the arrear note and the year-split due in the Collect modal', async () => {
    await setup({ rows: [row()] });
    const tr = fixture.nativeElement.querySelector('tbody tr') as HTMLElement;
    expect(tr.querySelector('.arrear-note')?.textContent?.trim()).toBe('incl. ₹ 6,500 from 7th');
    expect(tr.querySelector('.tag-arrears')?.textContent?.trim()).toBe('Has Arrears');

    component.openCollect(row());
    // OnPush: in the app the click marks the view dirty; here, render explicitly.
    fixture.debugElement.injector.get(ChangeDetectorRef).detectChanges();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('.due-row')) as HTMLElement[];
    expect(rows.map((el) => el.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '8th (current year)₹ 20,000',
      '7th (previous year, unpaid)₹ 6,500'
    ]);
  });

  it('caps the amount at the total due before calling the API', async () => {
    await setup({ rows: [row()] });
    component.openCollect(row());
    component.payAmount = '26501';
    component.collect();
    expect(component.payError).toContain('₹ 26,500');
    expect(api.collect).not.toHaveBeenCalled();
  });

  it('guards Collect against a double submit and sends one idempotency key per modal open', async () => {
    await setup({ rows: [row()] });
    api.collect.and.returnValue(of({ message: 'ok', row: row({ due: 16500 }), receipt: null as never }));
    component.openCollect(row());
    component.payAmount = '10000';
    component.isClick = true;            // a first submit still in flight
    component.collect();
    expect(api.collect).not.toHaveBeenCalled();

    component.isClick = false;
    component.collect();
    expect(api.collect).toHaveBeenCalledTimes(1);
    const key = api.collect.calls.mostRecent().args[5];
    expect(key).toBeTruthy();
    expect(component.rows[0].due).toBe(16500);   // the row updates from the response
  });

  it('a fully-paid student shows a dash, never a Collect button', async () => {
    await setup({ rows: [row({ due: 0, currentDue: 0, arrearsDue: 0, arrears: [], status: 'paid', statusLabel: 'Fully Paid' })] });
    const tr = fixture.nativeElement.querySelector('tbody tr') as HTMLElement;
    expect(tr.querySelector('.collect-btn')).toBeNull();
    expect(tr.querySelector('.tag-paid')?.textContent?.trim()).toBe('Fully Paid');
  });
});
