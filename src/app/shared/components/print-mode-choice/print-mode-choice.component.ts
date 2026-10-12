/**
 * app-print-mode-choice — THE print-mode choice, built once (examination prompt; README
 * "Reuse, don't duplicate"): two illustrated option cards, "One Student in One Page" /
 * "Two Students in One Page" — never a dropdown. Generate Admit Card and Generate Marksheet
 * use it; Generate TC can adopt it unchanged.
 *
 * Reference: docs/schoolzen-planning/v1/examination/generate-admit-card.html #printModeModal.
 * It only picks a layout; the page renders the documents and calls window.print().
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { PrintMode } from 'src/app/shared/models/examination/examination.model';

@Component({
  selector: 'app-print-mode-choice',
  templateUrl: './print-mode-choice.component.html',
  styleUrls: ['./print-mode-choice.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrintModeChoiceComponent {
  @Input() open = false;
  /** "Print Admit Cards" */
  @Input() title = 'Print';
  @Input() count = 0;
  /** "admit cards" — the hint's plural noun. */
  @Input() noun = 'documents';
  /** "admit card" — the option descriptions' singular noun. */
  @Input() singular = 'document';

  @Output() chosen = new EventEmitter<PrintMode>();
  @Output() cancelled = new EventEmitter<void>();

  choose(mode: PrintMode): void {
    this.chosen.emit(mode);
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancelled.emit();
  }
}
