import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SalaryPayoutsService } from 'src/app/shared/services/payroll/salary-payouts.service';
import { PayoutListResponse, PayoutRow } from 'src/app/shared/models/payroll/salary-payout.model';
import { SalaryPayoutsComponent } from './salary-payouts.component';

const payout = (id: string, overrides: Partial<PayoutRow>): PayoutRow => ({
  _id: id, staffId: 's-' + id, name: 'Person ' + id, code: 'STF-' + id, designation: null, department: null,
  year: 2026, month: 8, net: 13800, paid: 0, pending: 0, due: 13800, stillDue: 13800, status: 'unpaid',
  latestPayment: null, payments: [], actions: ['record'], ...overrides
});

describe('SalaryPayoutsComponent', () => {
  let fixture: ComponentFixture<SalaryPayoutsComponent>;
  let component: SalaryPayoutsComponent;
  let api: jasmine.SpyObj<SalaryPayoutsService>;

  const setup = async (response: PayoutListResponse) => {
    api = jasmine.createSpyObj<SalaryPayoutsService>('SalaryPayoutsService', ['list', 'recordPayment', 'slip']);
    api.list.and.returnValue(of(response));
    await TestBed.configureTestingModule({
      declarations: [SalaryPayoutsComponent],
      providers: [
        { provide: SalaryPayoutsService, useValue: api },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(SalaryPayoutsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const pendingPayment = {
    _id: 'pay1', amountPaid: 13800, mode: 'upi' as const, reference: 'UPI123', date: '2026-08-03', paidBy: 'Abhishek',
    confirmationStatus: 'pending' as const, confirmationExpiresAt: '2026-08-04T00:00:00Z', confirmedAt: null, disputeReason: null
  };

  it('a recorded-but-unconfirmed payment is Unpaid and "awaiting confirmation", with no action', async () => {
    await setup({
      rows: [payout('1', { pending: 13800, due: 0, latestPayment: pendingPayment, payments: [pendingPayment], actions: [] })],
      nextCursor: null, total: 1, summary: { disbursed: 0, full: 0, partial: 0, unpaid: 1 }, canEdit: true
    });
    const tr = fixture.nativeElement.querySelector('tbody tr') as HTMLElement;
    expect(tr.querySelector('.tag-unpaid')?.textContent?.trim()).toBe('Unpaid');
    expect(tr.querySelector('.confirm-tag.pending')?.textContent?.trim()).toBe('Pending');
    expect(tr.textContent).toContain('awaiting confirmation');
    expect(tr.querySelector('.act .icon-btn')).toBeNull();
  });

  it('only asks the API for payouts — every row it lists is a locked run', async () => {
    await setup({ rows: [], nextCursor: null, total: 0, summary: { disbursed: 0, full: 0, partial: 0, unpaid: 0 }, canEdit: true });
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Lock payslips on Generate Payroll first');
  });

  it('requires a reference for Bank Transfer / UPI but not for Cash', async () => {
    const row = payout('2', {});
    await setup({ rows: [row], nextCursor: null, total: 1, summary: { disbursed: 0, full: 0, partial: 0, unpaid: 1 }, canEdit: true });
    component.openPay(row);
    component.payForm = { amount: '5000', date: '2026-08-05', mode: 'upi', reference: '' };
    component.submitPay();
    expect(component.payErrors['reference']).toBeTruthy();
    expect(api.recordPayment).not.toHaveBeenCalled();

    api.recordPayment.and.returnValue(of({ message: 'ok', row: { ...row, pending: 5000, due: 8800 } }));
    component.payForm = { amount: '5000', date: '2026-08-05', mode: 'cash', reference: '' };
    component.submitPay();
    expect(api.recordPayment).toHaveBeenCalled();
  });

  it('refuses an amount above what is still due before calling the API', async () => {
    const row = payout('3', { due: 9800 });
    await setup({ rows: [row], nextCursor: null, total: 1, summary: { disbursed: 0, full: 0, partial: 0, unpaid: 1 }, canEdit: true });
    component.openPay(row);
    component.payForm = { amount: '10000', date: '2026-08-05', mode: 'cash', reference: '' };
    component.submitPay();
    expect(component.payErrors['amountPaid']).toContain('exceeds');
    expect(api.recordPayment).not.toHaveBeenCalled();
  });
});
