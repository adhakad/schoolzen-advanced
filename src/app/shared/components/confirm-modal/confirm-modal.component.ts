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

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  typed = '';

  ngOnChanges(): void {
    // Reset the type-to-confirm field every time the modal is (re)opened.
    if (this.open) this.typed = '';
  }

  get confirmDisabled(): boolean {
    const required = this.config.typeToConfirm;
    return Boolean(required) && this.typed.trim() !== required;
  }

  onConfirm(): void {
    if (this.confirmDisabled) return;
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
