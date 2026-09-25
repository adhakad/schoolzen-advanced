/**
 * app-icon-action — the 30x30 rounded icon-button used in every row's action column.
 * Row actions are always this same shape; only the glyph and colour vary by state.
 *
 * Inputs:
 *   icon      — Bootstrap Icon name without the `bi-` prefix, e.g. 'lock-open'
 *   variant   — 'neutral' (View/Lock/Regenerate) | 'primary' (the row's primary action)
 *               | 'warning' (a reversing action such as Unlock)
 *   ariaLabel — required for screen readers; there is no visible text
 *   confirm   — when set, the click opens the shared confirm modal and `action` only
 *               fires once confirmed
 *   disabled
 *
 * Output: action
 *
 * <app-icon-action icon="lock-open" variant="warning" ariaLabel="Unlock payroll"
 *                  [confirm]="unlockConfirm" (action)="unlock(row)"></app-icon-action>
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { ConfirmConfig, IconActionVariant } from 'src/app/shared/models/shared-components.model';

@Component({
  selector: 'app-icon-action',
  templateUrl: './icon-action.component.html',
  styleUrls: ['./icon-action.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IconActionComponent {
  @Input() icon = 'dots';
  @Input() variant: IconActionVariant = 'neutral';
  @Input() ariaLabel = '';
  @Input() confirm: ConfirmConfig | null = null;
  @Input() disabled = false;

  @Output() action = new EventEmitter<void>();

  confirmOpen = false;

  constructor(private cdr: ChangeDetectorRef) {}

  get buttonClass(): string {
    if (this.variant === 'warning') return 'icon-btn danger';
    if (this.variant === 'primary') return 'icon-btn primary';
    return 'icon-btn';
  }

  onClick(): void {
    if (this.disabled) return;
    if (this.confirm) {
      this.confirmOpen = true;
      this.cdr.markForCheck();
      return;
    }
    this.action.emit();
  }

  onConfirmed(): void {
    this.confirmOpen = false;
    this.action.emit();
  }

  onCancelled(): void {
    this.confirmOpen = false;
  }
}
