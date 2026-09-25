/**
 * app-count-pill — a cell that says how many of something a row has ("2 streams",
 * "4 streams") and reveals the actual names in a popover when clicked.
 *
 * This exists because inline tags make a column grow unpredictably wide as a school adds
 * more streams or sections: two streams and ten streams must render identically. Never
 * swap this for a list of tags.
 *
 * Inputs:
 *   count   — how many; 0 renders nothing (use the caller's own empty state instead)
 *   noun    — singular noun, pluralised here: 'stream' -> "2 streams", "1 stream"
 *   items   — the names shown in the popover
 *   variant — 'stream' (amber) | 'section' (purple)
 *
 * <app-count-pill [count]="row.streams.length" noun="stream"
 *                 [items]="row.streamNames" variant="stream"></app-count-pill>
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnChanges, isDevMode
} from '@angular/core';
import { CountPillVariant } from 'src/app/shared/models/shared-components.model';

const VARIANTS: readonly CountPillVariant[] = ['stream', 'section'];

@Component({
  selector: 'app-count-pill',
  templateUrl: './count-pill.component.html',
  styleUrls: ['./count-pill.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CountPillComponent implements OnChanges {
  @Input() count = 0;
  @Input() noun = '';
  @Input() items: readonly string[] = [];
  @Input() variant: CountPillVariant = 'stream';

  open = false;

  /** Precomputed so the template never calls a function. */
  label = '';
  popoverText = '';
  variantClass: CountPillVariant = 'stream';

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    this.label = this.count + ' ' + this.noun + (this.count === 1 ? '' : 's');
    this.popoverText = this.items.join(', ');

    if (VARIANTS.indexOf(this.variant) === -1) {
      // Fall back to something visible rather than rendering an unstyled pill.
      if (isDevMode()) console.warn('[app-count-pill] unknown variant "' + this.variant + '", using "stream"');
      this.variantClass = 'stream';
    } else {
      this.variantClass = this.variant;
    }
  }

  toggle(): void {
    this.open = !this.open;
  }

  /** A popover that stays open after you look away is a stuck tooltip, not a control. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.open = false;
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open) return;
    this.open = false;
    this.cdr.markForCheck();
  }
}
