/**
 * app-confirm-modal — the one confirmation dialog every destructive or reversing action
 * in the app goes through. Nothing is rendered until `open` is true (no hidden modal DOM
 * sitting under a page full of action buttons).
 *
 * Inputs:
 *   open   — controls visibility
 *   config — ConfirmConfig { title, message, confirmLabel, cancelLabel?, variant?,
 *            typeToConfirm?, scopeNote? }
 *
 * Outputs: confirmed, cancelled
 *
 * `typeToConfirm` implements the heavier pattern required for bulk deletions and for
 * deleting a record other records depend on: the confirm button stays disabled until that
 * exact word is typed. Tone stays calm — one sentence of consequence, no stacked warnings.
 *
 * <app-confirm-modal [open]="showUnlock" [config]="unlockConfig"
 *                    (confirmed)="unlock()" (cancelled)="showUnlock = false">
 * </app-confirm-modal>
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { ConfirmConfig } from 'src/app/shared/models/shared-components.model';

const DEFAULT_CONFIG: ConfirmConfig = {
  title: 'Are you sure?',
  message: '',
  confirmLabel: 'Confirm'
};

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmModalComponent implements OnChanges {
  @Input() open = false;
  @Input() config: ConfirmConfig = DEFAULT_CONFIG;
  /**
   * The confirmed action is in flight: the modal stays open, its button disabled with a
   * spinner, until the parent closes it (global rule 11).
   */
  @Input() busy = false;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  typed = '';

  private wasOpen = false;

  ngOnChanges(): void {
    // Reset the type-to-confirm field every time the modal is (re)opened — not when only
    // `busy` flips while it is already open.
    if (this.open && !this.wasOpen) this.typed = '';
    this.wasOpen = this.open;
  }

  get confirmDisabled(): boolean {
    if (this.config.blocked || this.busy) return true;
    const required = this.config.typeToConfirm;
    return Boolean(required) && this.typed.trim() !== required;
  }

  onConfirm(): void {
    if (this.confirmDisabled) return;
    this.confirmed.emit();
  }

  /** The backdrop itself, not a click that started or bubbled from inside the box. */
  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onCancel();
  }

  onCancel(): void {
    if (this.busy) return;
    this.cancelled.emit();
  }
}
