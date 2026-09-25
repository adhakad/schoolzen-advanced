/**
 * app-form-modal — the 460px form shell every Add/Edit dialog in the app lives inside.
 * The head and foot are sticky and only the middle scrolls, so the title and the Submit
 * button stay reachable however tall the form grows.
 *
 * Distinct from app-confirm-modal on purpose: that one is 420px and owns its own message
 * and type-to-confirm field; this one is 460px and owns nothing but the shell — the form
 * is projected, so no shared component ever has to know a module's fields.
 *
 * Inputs:  open, title, submitLabel, cancelLabel, submitDisabled, width, showSubmit
 * Outputs: submitted, cancelled
 *
 * Nothing is rendered until `open` is true: a page with a table full of Edit buttons must
 * not carry a hidden copy of the form in the DOM, and a lazily created body also means the
 * form's controls start from the parent's freshly seeded draft every time.
 *
 * <app-form-modal [open]="showForm" [title]="formTitle" submitLabel="Submit"
 *                 [submitDisabled]="saving" (submitted)="save()" (cancelled)="close()">
 *   <div class="m-field">...</div>
 * </app-form-modal>
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-form-modal',
  templateUrl: './form-modal.component.html',
  styleUrls: ['./form-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() submitLabel = 'Submit';
  @Input() cancelLabel = 'Cancel';
  @Input() submitDisabled = false;
  /** 460px is the reference's form width; the read-only details modal is 420px. */
  @Input() width = 460;
  /** Off for a read-only modal (the Details breakdown), which has only a Close button. */
  @Input() showSubmit = true;

  @Output() submitted = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  onSubmit(): void {
    if (this.submitDisabled) return;
    this.submitted.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
