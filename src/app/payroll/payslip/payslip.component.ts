/**
 * app-payslip — the printable salary slip (salary-payouts.md, "Salary Slip"): a single-page,
 * MNC-style payslip with dark navy header/footer bands. Renders the structured `SalarySlip`
 * the backend returns (school header from the shared letterhead service); the page only
 * triggers the browser's print.
 *
 * Hidden on screen and shown only in print: the frame carries `.print-target`, so the global
 * `@media print` rule sends just this document to paper.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { PAYMENT_MODE_LABELS, SalarySlip } from 'src/app/shared/models/payroll/salary-payout.model';
import { MODE_LABELS } from 'src/app/shared/models/payroll/salary-group.model';
import { MONTH_NAMES } from 'src/app/shared/utils/attendance-time.util';
import { rupees, shortDate } from '../payroll-format';

@Component({
  selector: 'app-payslip',
  templateUrl: './payslip.component.html',
  styleUrls: ['./payslip.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayslipComponent {
  @Input() slip: SalarySlip | null = null;

  get period(): string {
    return this.slip ? `${MONTH_NAMES[this.slip.period.month - 1]} ${this.slip.period.year}` : '';
  }

  get rows(): { earning: { name: string; amount: number } | null; deduction: { name: string; amount: number } | null }[] {
    if (!this.slip) return [];
    const count = Math.max(this.slip.earnings.length, this.slip.deductions.length);
    return Array.from({ length: count }, (_v, i) => ({
      earning: this.slip!.earnings[i] || null,
      deduction: this.slip!.deductions[i] || null
    }));
  }

  money(value: number): string {
    return rupees(value);
  }

  date(value: string | null | undefined): string {
    return shortDate(value);
  }

  modeLabel(): string {
    return this.slip ? MODE_LABELS[this.slip.employee.mode] : '';
  }

  paymentMode(): string {
    return this.slip && this.slip.payment ? PAYMENT_MODE_LABELS[this.slip.payment.mode] : '—';
  }

  generated(): string {
    return this.slip ? new Date(this.slip.generatedAt).toLocaleString('en-IN') : '';
  }
}
