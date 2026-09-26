/**
 * app-letterhead-document — THE printable letterhead, shared by every document in the app.
 *
 * Renders the document model built by backend services/pdf/letterhead.service.js: school
 * header band, title band, a labelled field grid and a closing note. The Admission Letter
 * is its first user; Fee Receipt, Admit Card, Marksheet and Transfer Certificate use this
 * same component rather than a print template of their own (admission.md; README "Reuse,
 * don't duplicate").
 *
 * Printing: the frame carries `.print-target`, and the global `@media print` rule hides
 * everything else, so `print()` sends only this document to paper whatever modal it sits
 * in.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LetterheadDocument } from 'src/app/shared/models/letterhead.model';

@Component({
  selector: 'app-letterhead-document',
  templateUrl: './letterhead-document.component.html',
  styleUrls: ['./letterhead-document.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LetterheadDocumentComponent {
  @Input() document: LetterheadDocument | null = null;

  /** The browser's print dialog — the global print stylesheet isolates this frame. */
  print(): void {
    window.print();
  }

  trackByLabel = (_index: number, field: { label: string }): string => field.label;
}
