/**
 * app-dd — THE dropdown. Every select-like control in v2 is this component: toolbar filter
 * pills, the rows-per-page picker, the session selector, and every select inside a modal.
 *
 * design-system.md is unambiguous about this ("`.dd` component for every dropdown/select —
 * never a native `<select>`", and native selects are listed under "Never do"). That covers
 * `<mat-select>` too: a re-themed Material control is still not this markup, and the page
 * references show `.dd`/`.dd-trigger`/`.dd-menu`/`.dd-option` class-for-class.
 *
 * The markup and class names below are the reference's, so the global stylesheet styles
 * this component and a page's own hand-written `.dd` identically.
 *
 *   <app-dd [options]="typeOptions" [value]="form.type" (valueChange)="form.type = $event">
 *   </app-dd>
 *
 * Disabled is a real state, not a hidden one: a dependent filter (Stream before a Class is
 * picked) stays in the DOM, greyed, showing `disabledHint` instead of its label — a pill
 * that disappears breaks the toolbar's shape.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  Output
} from '@angular/core';
import { DdOption } from 'src/app/shared/models/shared-components.model';

@Component({
  selector: 'app-dd',
  templateUrl: './dd.component.html',
  styleUrls: ['./dd.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DdComponent implements OnChanges {
  @Input() options: readonly DdOption[] = [];
  /** The selected option's value. '' is a legitimate value — it is how "All classes" is selected. */
  @Input() value: string = '';
  /** Shown when `value` matches no option (nothing chosen yet). */
  @Input() placeholder = '— Select —';
  @Input() disabled = false;
  /** Replaces the label while disabled, e.g. "Select a class first". */
  @Input() disabledHint = '';
  /** Menus hang off the right edge by default, matching the header's session/profile menus. */
  @Input() menuAlign: 'left' | 'right' = 'right';
  /** Menu matches the trigger's width — what every in-form and in-toolbar `.dd` uses. */
  @Input() fullWidth = true;
  /** The bordered 38px control. Off for a trigger that brings its own chrome (the year pill). */
  @Input() pill = true;
  /** Bootstrap Icon name shown before the label, e.g. 'calendar-event' on the session pill. */
  @Input() triggerIcon = '';
  /** The session pill in the reference carries no chevron. Everything else does. */
  @Input() showChevron = true;
  @Input() ariaLabel = '';

  @Output() valueChange = new EventEmitter<string>();

  @HostBinding('class.dd') readonly ddClass = true;
  @HostBinding('class.sw-select-pill') get pillClass(): boolean { return this.pill; }
  @HostBinding('class.open') get openClass(): boolean { return this.open; }
  @HostBinding('class.disabled') get disabledClass(): boolean { return this.disabled; }

  open = false;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    if (this.disabled) this.open = false;
  }

  get label(): string {
    if (this.disabled && this.disabledHint) return this.disabledHint;
    const selected = this.options.find((option) => this.matches(option));
    return selected ? selected.label : this.placeholder;
  }

  isSelected(option: DdOption): boolean {
    return this.matches(option);
  }

  /**
   * An option only counts as selected when it HAS a value. `DdOption.value` is typed as a
   * string, but it arrives from a server payload, and an absent field is undefined at
   * runtime whatever the interface claims.
   *
   * Without this guard, `undefined === undefined` made a valueless option match a valueless
   * selection: picking it showed its label as if it had been chosen while the parent's model
   * held nothing. That is exactly how a dropped `streams._id` in the Subject Groups form
   * options stayed invisible — the pill read "Science" and the save was rejected for having
   * no stream. A valueless option now simply never matches, so the control falls back to its
   * placeholder and the fault is visible where it happens.
   */
  private matches(option: DdOption): boolean {
    if (typeof option.value !== 'string') return false;
    return option.value === this.value;
  }

  toggle(event: Event): void {
    // Without this the document listener below would immediately close what we just opened.
    event.stopPropagation();
    if (this.disabled) return;
    this.open = !this.open;
  }

  select(event: Event, option: DdOption): void {
    event.stopPropagation();
    this.open = false;
    if (option.value === this.value) return;
    this.valueChange.emit(option.value);
  }

  /** One open menu at a time, and a click anywhere else closes it — the reference behaviour. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }

  trackByValue(_index: number, option: DdOption): string {
    return option.value;
  }
}
