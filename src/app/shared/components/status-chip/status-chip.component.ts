/**
 * app-status-chip — the fixed-width, centred, soft-tint status pill.
 *
 * Inputs:
 *   label   — the text shown, e.g. 'Locked'
 *   variant — colour key: draft | locked | pending | present | late | absent | halfday |
 *             leave | holiday | approved | rejected | active | inactive | neutral
 *
 * An unknown variant renders neutral and warns in dev rather than rendering unstyled.
 *
 * <app-status-chip label="Locked" variant="locked"></app-status-chip>
 */
import { ChangeDetectionStrategy, Component, Input, OnChanges, isDevMode } from '@angular/core';
import { StatusVariant } from 'src/app/shared/models/shared-components.model';

const KNOWN_VARIANTS: readonly StatusVariant[] = [
  'draft', 'locked', 'pending', 'present', 'late', 'absent', 'halfday',
  'leave', 'holiday', 'approved', 'rejected', 'active', 'inactive', 'neutral'
];

@Component({
  selector: 'app-status-chip',
  templateUrl: './status-chip.component.html',
  styleUrls: ['./status-chip.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusChipComponent implements OnChanges {
  @Input() label = '';
  @Input() variant: StatusVariant = 'neutral';

  /** Precomputed in ngOnChanges — never a function call from the template. */
  chipClass = 'sw-chip neutral';

  ngOnChanges(): void {
    const known = KNOWN_VARIANTS.indexOf(this.variant) !== -1;
    if (!known && isDevMode()) {
      console.warn('[app-status-chip] unknown variant "' + this.variant + '" — falling back to neutral');
    }
    this.chipClass = 'sw-chip ' + (known ? this.variant : 'neutral');
  }
}
