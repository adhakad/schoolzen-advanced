/**
 * app-row-avatar — the gradient rounded-square initials avatar plus the name/role stack
 * used as the leading "entity" cell of every module's row.
 *
 * Inputs:
 *   name      — full name; initials are derived from it
 *   role      — the small muted second line (optional)
 *   colorSeed — picks one of the established gradients deterministically, so the same
 *               person is always the same colour and adjacent rows visually vary.
 *               Defaults to `name` when not supplied.
 *
 * <app-row-avatar name="Priya Sharma" role="Primary Teacher" colorSeed="staff-14">
 * </app-row-avatar>
 */
import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

const GRADIENTS: readonly string[] = [
  'linear-gradient(135deg,#7b6ef6,#5b4fd6)',
  'linear-gradient(135deg,#ff9a76,#ff7676)',
  'linear-gradient(135deg,#4fd6c4,#2fb6a4)',
  'linear-gradient(135deg,#5aa9f0,#2f79d8)',
  'linear-gradient(135deg,#f6a5d0,#e06ea9)',
  'linear-gradient(135deg,#ffc46b,#f39c12)'
];

@Component({
  selector: 'app-row-avatar',
  templateUrl: './row-avatar.component.html',
  styleUrls: ['./row-avatar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RowAvatarComponent implements OnChanges {
  @Input() name = '';
  @Input() role = '';
  @Input() colorSeed = '';

  initials = '?';
  gradient: string = GRADIENTS[0];

  ngOnChanges(): void {
    this.initials = this.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || '?';

    const seed = this.colorSeed || this.name;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
    }
    this.gradient = GRADIENTS[hash % GRADIENTS.length];
  }
}
