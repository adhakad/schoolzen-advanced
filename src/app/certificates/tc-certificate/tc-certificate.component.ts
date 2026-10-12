/**
 * app-tc-certificate — the printable Transfer Certificate (generate-tc.html "Transfer
 * Certificate" modal, `.cert-frame`). Renders the stored snapshot the backend returns with
 * the school header from the shared letterhead service; the frame carries `.print-target`,
 * so the global print rule sends only this to paper. Reprints render the same snapshot —
 * the serial number never changes.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TcCertificate } from 'src/app/shared/models/certificates/certificates.model';

@Component({
  selector: 'app-tc-certificate',
  templateUrl: './tc-certificate.component.html',
  styleUrls: ['./tc-certificate.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TcCertificateComponent {
  @Input() certificate: TcCertificate | null = null;

  trackByNo = (_index: number, field: { no: number }): number => field.no;
}
