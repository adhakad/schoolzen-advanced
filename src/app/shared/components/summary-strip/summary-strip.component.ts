/**
 * app-summary-strip — the single white strip of top-line numbers that sits below the
 * header and above a page's main card. One strip, divided by thin rules; never a row of
 * separate decorative metric cards.
 *
 * Inputs:
 *   badgeLabel — the small pulsing status badge on the left, e.g. 'Session active'
 *   counts     — SummaryCount[] { label, value, hero? }; at most one hero (accent purple)
 *
 * <app-summary-strip badgeLabel="Session active" [counts]="counts"></app-summary-strip>
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { SummaryCount } from 'src/app/shared/models/shared-components.model';

@Component({
  selector: 'app-summary-strip',
  templateUrl: './summary-strip.component.html',
  styleUrls: ['./summary-strip.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryStripComponent {
  @Input() badgeLabel = '';
  @Input() counts: readonly SummaryCount[] = [];

  trackByLabel = (_index: number, count: SummaryCount): string => count.label;
}
