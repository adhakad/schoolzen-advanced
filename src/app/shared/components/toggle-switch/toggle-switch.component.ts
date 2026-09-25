/**
 * app-toggle-switch — the 38x22 pill switch used wherever a single boolean restructures a
 * form or flips a record between two states (a class having streams, Active/Inactive).
 *
 * Inputs:  checked, label, disabled
 * Output:  checkedChange — emits the NEW value; the parent owns the state, so this stays a
 *          controlled component and can never drift out of sync with the form it drives.
 *
 * <app-toggle-switch [checked]="hasStreams" label="This class has streams (11th/12th)"
 *                    (checkedChange)="onStreamsToggled($event)"></app-toggle-switch>
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-toggle-switch',
  templateUrl: './toggle-switch.component.html',
  styleUrls: ['./toggle-switch.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToggleSwitchComponent {
  @Input() checked = false;
  @Input() label = '';
  @Input() disabled = false;

  @Output() checkedChange = new EventEmitter<boolean>();

  toggle(): void {
    if (this.disabled) return;
    this.checkedChange.emit(!this.checked);
  }
}
