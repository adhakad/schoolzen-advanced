/**
 * app-good-to-know — the "Good to know" side card every page carries (global-fixes.md
 * rule 6): plain-language steps a non-technical user can follow. The first `visible` tips
 * show; the rest sit behind "Read more".
 *
 *   <app-good-to-know [tips]="tips"></app-good-to-know>
 *
 * Markup is the references' `.status-card` / `.card-title-row` / `.tip-item`, so it renders
 * exactly like the hand-written cards it replaces.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-good-to-know',
  templateUrl: './good-to-know.component.html',
  styleUrls: ['./good-to-know.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GoodToKnowComponent {
  @Input() tips: readonly string[] = [];
  @Input() title = 'Good to know';
  /** How many tips show before "Read more". */
  @Input() visible = 3;

  expanded = false;

  get shown(): readonly string[] {
    return this.expanded ? this.tips : this.tips.slice(0, this.visible);
  }

  get hasMore(): boolean {
    return this.tips.length > this.visible;
  }

  toggle(): void {
    this.expanded = !this.expanded;
  }

  trackByIndex = (index: number): number => index;
}
