/**
 * One printed admit card — the reference's `.letter-frame` card, class-for-class
 * (docs/schoolzen-planning/v1/examination/generate-admit-card.html cardHTML()). The school
 * header comes from the shared letterhead service (same band as the Admission Letter and
 * the TC); everything else is the card's generation-time snapshot.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AdmitCardDocument, LetterheadHeader } from 'src/app/shared/models/examination/examination.model';

@Component({
  selector: 'app-admit-card-document',
  templateUrl: './admit-card-document.component.html',
  styleUrls: ['../marksheet-document/letter-frame.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdmitCardDocumentComponent {
  @Input() header: LetterheadHeader | null = null;
  @Input() card: AdmitCardDocument | null = null;
}
