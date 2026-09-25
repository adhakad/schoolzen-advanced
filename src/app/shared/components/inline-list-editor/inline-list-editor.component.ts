/**
 * app-inline-list-editor — a titled block of repeatable text rows, each with a "x" to
 * remove it and a "+" in the header to add another. The pattern used for a class's
 * sections, a stream's sections, and Salary Groups' allowances.
 *
 * Inputs:
 *   title       — the block heading, e.g. 'Sections'
 *   items       — current values; the parent owns them (controlled component)
 *   placeholder — per-row input placeholder
 *   emptyText   — shown instead of rows when there are none. An empty list is a real,
 *                 valid state here (a stream may have no sections at all), so this reads
 *                 as an invitation, not an error.
 *   maxLength   — per-row character cap
 *   bare        — drop the tinted .sec-block wrapper, for when this is nested inside
 *                 another block that already provides the surface (a stream's sections)
 *
 * Output: itemsChange — the whole new array on every add/edit/remove
 *
 * <app-inline-list-editor title="Sections" [items]="sections" placeholder="A"
 *                         emptyText="None yet — add one."
 *                         (itemsChange)="sections = $event"></app-inline-list-editor>
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-inline-list-editor',
  templateUrl: './inline-list-editor.component.html',
  styleUrls: ['./inline-list-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InlineListEditorComponent {
  @Input() title = '';
  @Input() items: readonly string[] = [];
  @Input() placeholder = '';
  @Input() emptyText = '';
  @Input() maxLength = 50;
  @Input() bare = false;

  @Output() itemsChange = new EventEmitter<string[]>();

  /**
   * `bare` also means "this block belongs to a stream", so its heading takes the amber
   * .stream-block-title the reference uses there rather than the grey .sec-title. Derived
   * rather than a second @Input(), so the two can never be set to contradict each other.
   */
  get titleClass(): string {
    return this.bare ? 'stream-block-title' : 'sec-title';
  }

  add(): void {
    this.itemsChange.emit(this.items.concat(['']));
  }

  remove(index: number): void {
    this.itemsChange.emit(this.items.filter((_item, position) => position !== index));
  }

  update(index: number, value: string): void {
    this.itemsChange.emit(this.items.map((item, position) => (position === index ? value : item)));
  }

  /**
   * Identity is the row's position, not its text: the inputs are edited in place, so
   * tracking by value would destroy and recreate the field on every keystroke and the
   * caret would jump to the end.
   */
  trackByIndex = (index: number): number => index;
}
