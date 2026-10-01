/**
 * app-dp — THE date picker. Every date a person enters in v2 goes through this component;
 * never a native `<input type="date">` (design-system.md, "Date picker component — `.dp`"),
 * whose browser calendar chrome differs per browser and breaks the design system's look.
 *
 *   <app-dp [value]="form.dob" [max]="today" (valueChange)="setDob($event)"
 *           (closed)="dobControl.markAsTouched()"></app-dp>
 *
 * Value in, value out: an ISO calendar date 'YYYY-MM-DD' ('' = nothing chosen). Never a Date
 * object — a Date carries a time zone, and a date of birth must not drift a day across one.
 *
 * Positioning and closing behave exactly like `.dd` (design-system.md, "Menu positioning and
 * open/close behavior"):
 *   - The open panel is PORTALED to document.body (class `dp-portal`, position: fixed), so
 *     no modal body's overflow can clip it and no sticky modal head/foot can sit over it.
 *   - It opens below the field and FLIPS upward when it doesn't fit below but does above;
 *     it is clamped inside the viewport either way.
 *   - It stays open until a resolution: a day is picked or cleared, a click lands outside
 *     (trigger and portaled panel both count as inside), Escape, or focus moves to another
 *     field. Scrolling or resizing only REPOSITIONS it.
 * Every close emits `closed`, because a `.dp` gets no native blur either — the bound form
 * control has to be marked touched from here or a required, never-opened date would never
 * show its error.
 *
 * Month/year navigation is by chevrons only (no native select inside). Clicking the month
 * label switches to a 12-year grid, so a date of birth fifteen years back is a few clicks,
 * not 180.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostBinding,
  HostListener, Input, OnChanges, OnDestroy, Output, ViewChild
} from '@angular/core';

/** Gap between trigger and panel, and the minimum margin kept from the viewport edge. */
const GAP = 8;
const EDGE = 8;

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  disabled: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((month) => month.slice(0, 3));
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const YEARS_PER_PAGE = 12;

const pad = (n: number): string => String(n).padStart(2, '0');
const toIso = (year: number, month: number, day: number): string => `${year}-${pad(month + 1)}-${pad(day)}`;

/** 'YYYY-MM-DD' → parts, or null. Calendar arithmetic only — no Date time zone involved. */
const parseIso = (value: string): { year: number; month: number; day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
};

const todayIso = (): string => {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
};

@Component({
  selector: 'app-dp',
  templateUrl: './dp.component.html',
  styleUrls: ['./dp.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DpComponent implements OnChanges, OnDestroy {
  /** 'YYYY-MM-DD', or '' for nothing chosen. */
  @Input() value = '';
  @Input() placeholder = 'Select date';
  @Input() disabled = false;
  /** Inclusive bounds, 'YYYY-MM-DD'. Days outside are shown but can't be picked. */
  @Input() min = '';
  @Input() max = '';
  /** Marks the trigger invalid (design-system.md, Form validation state). */
  @Input() invalid = false;
  @Input() ariaLabel = '';
  @Input() describedBy: string | null = '';

  @Output() valueChange = new EventEmitter<string>();
  /** Every close — select, outside click, Escape. Parent marks its control touched here. */
  @Output() closed = new EventEmitter<void>();

  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLElement>;

  @HostBinding('class.dp') readonly dpClass = true;
  @HostBinding('class.open') get openClass(): boolean { return this.open; }
  @HostBinding('class.disabled') get disabledClass(): boolean { return this.disabled; }

  open = false;
  /** Opened upward (didn't fit below) — styles the shadow, and asserted in tests. */
  flipped = false;
  mode: 'days' | 'years' = 'days';
  viewYear = new Date().getFullYear();
  viewMonth = new Date().getMonth();
  readonly weekdays = WEEKDAYS;
  cells: DayCell[] = [];
  years: number[] = [];

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    if (this.disabled && this.open) this.close();
    if (!this.open) this.syncViewToValue();
  }

  ngOnDestroy(): void {
    this.detach();
    // A panel left in <body> would outlive its component.
    this.panel.nativeElement.remove();
  }

  /** "12 Mar 2013" — the label the trigger shows. */
  get label(): string {
    const parts = parseIso(this.value);
    return parts ? `${pad(parts.day)} ${MONTHS_SHORT[parts.month]} ${parts.year}` : this.placeholder;
  }

  get hasValue(): boolean {
    return parseIso(this.value) !== null;
  }

  get monthLabel(): string {
    return this.mode === 'years'
      ? `${this.years[0]} – ${this.years[this.years.length - 1]}`
      : `${MONTHS[this.viewMonth]} ${this.viewYear}`;
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.disabled) return;
    if (this.open) {
      this.close();
    } else {
      this.syncViewToValue();
      this.mode = 'days';
      this.buildDays();
      this.openPanel();
    }
  }

  prev(event: Event): void {
    event.stopPropagation();
    if (this.mode === 'years') {
      this.buildYears(this.years[0] - YEARS_PER_PAGE);
    } else {
      this.viewMonth -= 1;
      if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear -= 1; }
      this.buildDays();
    }
    this.relayout();
  }

  next(event: Event): void {
    event.stopPropagation();
    if (this.mode === 'years') {
      this.buildYears(this.years[0] + YEARS_PER_PAGE);
    } else {
      this.viewMonth += 1;
      if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear += 1; }
      this.buildDays();
    }
    this.relayout();
  }

  /** Month label → year grid (and back). */
  toggleYears(event: Event): void {
    event.stopPropagation();
    if (this.mode === 'years') {
      this.mode = 'days';
      this.buildDays();
    } else {
      this.mode = 'years';
      this.buildYears(this.viewYear - (this.viewYear % YEARS_PER_PAGE));
    }
    this.relayout();
  }

  pickYear(event: Event, year: number): void {
    event.stopPropagation();
    this.viewYear = year;
    this.mode = 'days';
    this.buildDays();
    this.relayout();
  }

  pick(event: Event, cell: DayCell): void {
    event.stopPropagation();
    if (cell.disabled) return;
    if (cell.iso !== this.value) {
      this.value = cell.iso;
      this.valueChange.emit(cell.iso);
    }
    this.close();
  }

  /** Clears the chosen date (an optional field's way back to "nothing"). */
  clear(event: Event): void {
    event.stopPropagation();
    if (this.value) {
      this.value = '';
      this.valueChange.emit('');
    }
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.contains(event.target)) this.close();
  }

  /** Focus moving to a different field is a resolution too (Tab past the dp). */
  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    if (this.open && !this.contains(event.target)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }

  isYearSelected(year: number): boolean {
    return year === this.viewYear;
  }

  trackByIso = (_index: number, cell: DayCell): string => cell.iso;
  trackByYear = (_index: number, year: number): number => year;

  private contains(target: EventTarget | null): boolean {
    const node = target as Node | null;
    return Boolean(node) && (this.host.nativeElement.contains(node) || this.panel.nativeElement.contains(node));
  }

  private openPanel(): void {
    this.open = true;
    const panel = this.panel.nativeElement;
    panel.classList.add('dp-portal');
    document.body.appendChild(panel);
    // The grid only renders while open — render it NOW, so the height the flip decision
    // measures is the real panel's, not an empty one's.
    this.cdr.detectChanges();
    this.position();
    // Scroll events don't bubble, so the capture phase is the only way to hear a modal body
    // move the trigger. Attached only while open.
    document.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }

  private close(): void {
    this.open = false;
    this.detach();
    const panel = this.panel.nativeElement;
    panel.classList.remove('dp-portal', 'flipped');
    panel.removeAttribute('style');
    // Back into the host: the panel's bindings are the host's, and a closed panel has no
    // reason to sit in <body>.
    this.host.nativeElement.appendChild(panel);
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

  /** Month ↔ year grid and the Clear row change the panel's height — re-place it. */
  private relayout(): void {
    if (!this.open) return;
    this.cdr.detectChanges();
    this.position();
  }

  /**
   * Below the trigger if the whole panel fits; else above it if it fits there; else whichever
   * side has more room, with the panel's height capped to that room (it scrolls). Left-aligned
   * with the field and clamped inside the viewport.
   */
  private position(): void {
    const panel = this.panel.nativeElement;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    panel.style.position = 'fixed';
    panel.style.maxHeight = '';

    const height = panel.offsetHeight;
    const width = panel.offsetWidth;
    const below = viewportH - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;

    this.flipped = height > below && (height <= above || above > below);
    const room = this.flipped ? above : below;
    if (height > room) panel.style.maxHeight = `${Math.max(160, room)}px`;
    const finalHeight = Math.min(height, Math.max(160, room));
    const top = this.flipped ? rect.top - GAP - finalHeight : rect.bottom + GAP;
    const left = Math.min(Math.max(EDGE, rect.left), viewportW - width - EDGE);

    panel.style.top = `${Math.min(Math.max(EDGE, top), Math.max(EDGE, viewportH - finalHeight - EDGE))}px`;
    panel.style.left = `${Math.max(EDGE, left)}px`;
    panel.classList.toggle('flipped', this.flipped);
  }

  private syncViewToValue(): void {
    // No value: the month of `max` if that is already past, else this month — never the
    // month an earlier, abandoned open was left browsing.
    const today = todayIso();
    const parts = parseIso(this.value) || parseIso(this.max && this.max < today ? this.max : today);
    if (parts) {
      this.viewYear = parts.year;
      this.viewMonth = parts.month;
    }
  }

  /** A Monday-first 6×7 grid with the neighbouring months' days filling the edges. */
  private buildDays(): void {
    const today = todayIso();
    const firstWeekday = (new Date(this.viewYear, this.viewMonth, 1).getDay() + 6) % 7;
    const start = new Date(this.viewYear, this.viewMonth, 1 - firstWeekday);
    const cells: DayCell[] = [];
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = toIso(date.getFullYear(), date.getMonth(), date.getDate());
      cells.push({
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === this.viewMonth,
        today: iso === today,
        selected: iso === this.value,
        disabled: Boolean((this.min && iso < this.min) || (this.max && iso > this.max)),
      });
    }
    this.cells = cells;
  }

  private buildYears(firstYear: number): void {
    this.years = Array.from({ length: YEARS_PER_PAGE }, (_value, index) => firstYear + index);
  }
}
