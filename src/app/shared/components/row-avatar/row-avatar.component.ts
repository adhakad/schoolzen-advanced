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
import { AVATAR_GRADIENTS, avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';


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
  gradient: string = AVATAR_GRADIENTS[0];

  ngOnChanges(): void {
    this.initials = initialsOf(this.name);
    this.gradient = avatarGradient(this.colorSeed || this.name);
  }
}
