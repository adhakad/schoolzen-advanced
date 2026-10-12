/**
 * app-fee-receipt — the printable Fee Receipt (fees.html "Fee Receipt" modal): formal,
 * colon-separated lines, no grid borders. Renders the structured receipt the backend builds
 * (school header from the shared letterhead service); the frame carries `.print-target`, so
 * the global print rule sends only this to paper. Used by Fees (after Collect) and Fee
 * Statement (reprint) — one template, the serial number never changes.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FeeReceipt, PAYMENT_MODE_LABELS } from 'src/app/shared/models/fees/fees.model';
import { rupees } from '../fees-format';

@Component({
  selector: 'app-fee-receipt',
  templateUrl: './fee-receipt.component.html',
  styleUrls: ['./fee-receipt.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeeReceiptComponent {
  @Input() receipt: FeeReceipt | null = null;

  money(value: number): string {
    return rupees(value);
  }

  modeLabel(mode: string): string {
    return PAYMENT_MODE_LABELS[mode] || mode;
  }
}
