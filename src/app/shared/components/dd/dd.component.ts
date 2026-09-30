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
 *
 * Menu positioning and open/close (design-system.md, "Menu positioning and open/close
 * behavior" — one global rule, fixed here for every .dd):
 *   - The open menu is PORTALED to document.body (class `dd-portal`, position: fixed), so no
 *     modal body or table scroller's overflow can clip it or hide it behind a footer.
 *   - It opens below the trigger, and FLIPS upward when it doesn't fit below but does
 *     above; it is clamped inside the viewport either way — never partly off-screen.
 *   - It stays open until a resolution: an option is picked, a click lands outside the dd
 *     (trigger and portaled menu both count as inside), Escape, or focus moves to another
 *     field. Scrolling or resizing only REPOSITIONS it — a menu never closes on its own.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { DdOption } from 'src/app/shared/models/shared-components.model';

/** Gap between trigger and menu, and the minimum margin kept from the viewport edge. */
const GAP = 8;
const EDGE = 8;

@Component({
  selector: 'app-dd',
  templateUrl: './dd.component.html',
  styleUrls: ['./dd.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DdComponent implements OnChanges, OnDestroy {
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
  /** A form field in error: `aria-invalid` on the trigger (the page styles the red border). */
  @Input() invalid = false;
  /** The id of the field's error message, for `aria-describedby`. */
  @Input() describedBy: string | null = null;

  @Output() valueChange = new EventEmitter<string>();
  /**
   * Every time an OPEN menu closes — a pick, an outside click, Escape, focus leaving, or the
   * trigger again. A `.dd` gets no native blur, so a form binds this to its control's
   * markAsTouched() or a required, never-picked dropdown would never show its error
   * (design-system.md, Form validation state).
   */
  @Output() closed = new EventEmitter<void>();

  @ViewChild('menu', { static: true }) menu!: ElementRef<HTMLElement>;

  @HostBinding('class.dd') readonly ddClass = true;
  @HostBinding('class.sw-select-pill') get pillClass(): boolean { return this.pill; }
  @HostBinding('class.open') get openClass(): boolean { return this.open; }
  @HostBinding('class.disabled') get disabledClass(): boolean { return this.disabled; }

  open = false;
  /** Opened upward (didn't fit below) — styles the chevron/shadow, and asserted in tests. */
  flipped = false;

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    if (this.disabled && this.open) this.close();
  }

  ngOnDestroy(): void {
    this.detach();
    // A menu left in <body> would outlive its component.
    this.menu.nativeElement.remove();
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
    if (this.open) this.close();
    else this.openMenu();
  }

  select(event: Event, option: DdOption): void {
    event.stopPropagation();
    // The value is emitted before `closed`, so a form marking its control touched on close
    // validates the NEW value, not the old one.
    if (option.value !== this.value) this.valueChange.emit(option.value);
    this.close();
  }

  /** One open menu at a time, and a click anywhere else closes it — the reference behaviour. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.contains(event.target)) this.close();
  }

  /** Focus moving to a different field is a resolution too (Tab past the dd). */
  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    if (this.open && !this.contains(event.target)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }

  private contains(target: EventTarget | null): boolean {
    const node = target as Node | null;
    return Boolean(node) && (this.host.nativeElement.contains(node) || this.menu.nativeElement.contains(node));
  }

  private openMenu(): void {
    this.open = true;
    const menu = this.menu.nativeElement;
    menu.classList.add('dd-portal');
    document.body.appendChild(menu);
    // Options only render while open — render them NOW, so the height the flip decision
    // measures is the real menu's, not an empty one's.
    this.cdr.detectChanges();
    this.position();
    // Scroll events don't bubble, so the capture phase is the only way to hear a modal body
    // or table scroller move the trigger. Attached only while open.
    document.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }

  private close(): void {
    this.open = false;
    this.detach();
    const menu = this.menu.nativeElement;
    menu.classList.remove('dd-portal');
    menu.removeAttribute('style');
    // Back into the host: the menu's bindings are the host's, and a closed menu has no reason
    // to sit in <body>.
    this.host.nativeElement.appendChild(menu);
    this.closed.emit();
    this.cdr.markForCheck();
  }

  private detach(): void {
    document.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  }

  private reposition = (): void => {
    if (this.open) this.position();
  };

  /**
   * Below the trigger if the whole menu fits; else above it if it fits there; else whichever
   * side has more room, with the menu's height capped to that room. Horizontally aligned per
   * `fullWidth`/`menuAlign` and clamped inside the viewport.
   */
  private position(): void {
    const menu = this.menu.nativeElement;
    // The HOST is the visible control (the pill's border and padding are on it); the inner
    // trigger sits inside that padding, so measuring it would put the menu on the border.
    const rect = this.host.nativeElement.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    menu.style.position = 'fixed';
    menu.style.maxHeight = '';
    if (this.fullWidth) menu.style.width = `${rect.width}px`;

    const height = menu.offsetHeight;
    const width = menu.offsetWidth;
    const below = viewportH - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;

    this.flipped = height > below && (height <= above || above > below);
    const room = this.flipped ? above : below;
    if (height > room) menu.style.maxHeight = `${Math.max(120, room)}px`;
    const finalHeight = Math.min(height, Math.max(120, room));
    const top = this.flipped ? rect.top - GAP - finalHeight : rect.bottom + GAP;

    let left = this.fullWidth || this.menuAlign === 'left' ? rect.left : rect.right - width;
    left = Math.min(Math.max(EDGE, left), viewportW - width - EDGE);

    menu.style.top = `${Math.max(EDGE, top)}px`;
    menu.style.left = `${left}px`;
    menu.classList.toggle('flipped', this.flipped);
  }

  trackByValue(_index: number, option: DdOption): string {
    return option.value;
  }
}
