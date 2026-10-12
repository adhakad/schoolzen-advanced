/**
 * One printed marksheet — the reference's `.letter-frame` card, class-for-class
 * (docs/schoolzen-planning/v1/examination/generate-marksheet.html cardHTML()). Renders the
 * saved ExamResult snapshot under the shared letterhead header; never recomputes.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LetterheadHeader, MarksheetDocument } from 'src/app/shared/models/examination/examination.model';

@Component({
  selector: 'app-marksheet-document',
  templateUrl: './marksheet-document.component.html',
  styleUrls: ['./letter-frame.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarksheetDocumentComponent {
  @Input() header: LetterheadHeader | null = null;
  @Input() title = '';
  @Input() sheet: MarksheetDocument | null = null;

  /** Co-scholastic grades after the first, two to a row (the first sits beside Result). */
  get extraCoScholastic(): { area: string; grade: string }[][] {
    const rest = (this.sheet?.coScholastic || []).slice(1);
    const rows: { area: string; grade: string }[][] = [];
    for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));
    return rows;
  }
}
