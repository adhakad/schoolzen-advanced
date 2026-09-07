/**
 * app-back-link — the "<- Back to [Module]" link every drill-down/sub-page shows as the
 * first element of its content area, above its own summary strip.
 *
 * Inputs: label, route
 *
 * <app-back-link label="Back to Payroll" route="/v2/payroll/generate-payroll">
 * </app-back-link>
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-back-link',
  templateUrl: './back-link.component.html',
  styleUrls: ['./back-link.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BackLinkComponent {
  @Input() label = 'Back';
  @Input() route = '';
}
