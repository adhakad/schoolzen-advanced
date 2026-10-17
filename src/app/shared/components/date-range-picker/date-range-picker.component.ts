/**
 * app-date-range-picker — THE date-range picker. Every from/to pair in v2 (Add/Edit Holiday,
 * Apply Leave, Roster Assign) is picked here, never with two separate calendars.
 *
 *   <app-date-range-picker [start]="from" [end]="to" [min]="today" noun="leave"
 *                          (rangeChange)="onRange($event)"></app-date-range-picker>
 *
 * The inline range calendar of holidays.html / leave-requests.html: the first click sets the
 * start, the second the end (a re-click of the start makes it one day). Once complete, days
 * outside the range are locked so a stray click can't nudge it — "Change dates" is the
 * deliberate way back in. `marked` ranges (e.g. existing holidays) are shown lightly, with a
 * chip per range in the visible month.
 *
 * `popover` (global-fixes.md rule 1 — the Roster "Applies to" field is the final design for
 * every picker): the calendar is hidden behind a `.range-input-trigger` field and opens as an
 * overlay portaled to <body>, directly below the field (flipping above only when it can't
 * fit), exactly like `.dd` / `.dp`. It closes on Done, an outside click or Escape.
 *
 * Values are 'YYYY-MM-DD' strings ('' = not chosen) — never Date objects, which drift a day
 * across time zones.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges,
  OnDestroy, Output, SimpleChanges, ViewChild
} from '@angular/core';
import { placeBelow } from 'src/app/shared/utils/overlay-position.util';

export interface DateRange {
  start: string;
  end: string;
}

export interface DateRangeMark {
  name: string;
  start: string;
  end: string;
}

interface RangeCell {
  key: string;
  day: number | null;
  cls: string;
  disabled: boolean;
  title: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
};

/** "5 August 2026". */
export const longDate = (key: string): string =>
  key ? Number(key.slice(8, 10)) + ' ' + MONTHS[Number(key.slice(5, 7)) - 1] + ' ' + key.slice(0, 4) : '';

/** "5 Aug". */
const shortDate = (key: string): string => Number(key.slice(8, 10)) + ' ' + MONTHS[Number(key.slice(5, 7)) - 1].slice(0, 3);

/** Inclusive calendar-day count of a 'YYYY-MM-DD' range (0 when incomplete or reversed). */
export const rangeDayCount = (start: string, end: string): number => {
  if (!start || !end || end < start) return 0;
  const toUtc = (key: string): number => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round((toUtc(end) - toUtc(start)) / 86400000) + 1;
};

/** "5 August 2026" or "5 August 2026 – 9 August 2026". */
export const rangeLabel = (start: string, end: string): string =>
  start === end ? longDate(start) : longDate(start) + ' – ' + longDate(end);

@Component({
  selector: 'app-date-range-picker',
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DateRangePickerComponent implements OnChanges, OnDestroy {
  @Input() start = '';
  @Input() end = '';
  /** Inclusive bounds — days outside are shown but can't be picked. */
  @Input() min = '';
  @Input() max = '';
  /** Existing ranges to show lightly (and as chips for the visible month). */
  @Input() marked: readonly DateRangeMark[] = [];
  @Input() showMarkedChips = false;
  /** What one picked day is called in the "now pick the last day" line: "holiday", "leave". */
  @Input() noun = 'day';
  /** Replaces the default summary line once a range is complete. */
  @Input() summary: string | null = null;
  @Input() hint = 'Click a date to start, then click a second date to set the end. A single click and re-click makes it one day.';
  @Input() invalid = false;
  /** View-only: nothing can be picked (e.g. a person's holiday calendar). */
  @Input() disabled = false;
  @Input() showSummary = true;
  /** Hidden until its trigger field is clicked; opens as an overlay below it. */
  @Input() popover = false;
  /** The trigger's text while no range is chosen (popover mode). */
  @Input() placeholder = 'Select dates';
  @Input() ariaLabel = '';

  @Output() rangeChange = new EventEmitter<DateRange>();
  /** Every close of the popover — Done, outside click, Escape. */
  @Output() closed = new EventEmitter<void>();

  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLElement>;

  open = false;
  /** A click that started inside the panel. Its target may be re-rendered away before the
   *  document listener sees it, so DOM containment alone can't be trusted. */
  private insideClick = false;

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.detach();
    if (this.popover) this.panel.nativeElement.remove();
  }

  /** "5 August 2026 – 31 August 2026", or the placeholder. */
  get triggerLabel(): string {
    if (!this.start) return this.placeholder;
    return rangeLabel(this.start, this.end || this.start);
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (!this.popover || this.disabled) return;
    if (this.open) this.close();
    else this.openPanel();
  }

  markInside(): void {
    this.insideClick = true;
  }

  done(event: Event): void {
    event.stopPropagation();
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) return;
    if (this.insideClick) {
      this.insideClick = false;
      return;
    }
    const node = event.target as Node | null;
    if (node && this.host.nativeElement.contains(node)) return;
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }

  private openPanel(): void {
    this.open = true;
    const panel = this.panel.nativeElement;
    panel.classList.add('drp-portal');
    document.body.appendChild(panel);
    // Render the calendar now so the flip decision measures the real panel height.
    this.cdr.detectChanges();
    this.position();
    document.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }

  private close(): void {
    this.open = false;
    this.detach();
    const panel = this.panel.nativeElement;
    panel.classList.remove('drp-portal', 'flipped');
    panel.removeAttribute('style');
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

  private position(): void {
    const trigger = this.host.nativeElement.querySelector('.range-input-trigger') as HTMLElement | null;
    placeBelow(this.panel.nativeElement, (trigger || this.host.nativeElement).getBoundingClientRect());
  }

  readonly today = localToday();
  viewMonth = this.today.slice(0, 7);

  ngOnChanges(changes: SimpleChanges): void {
    // A range set from outside (opening Edit) shows its month; a cleared one goes back to
    // the first pickable month. Clicks inside never move the view.
    const change = changes['start'];
    if (!change || change.currentValue === this.picked) return;
    this.viewMonth = this.start
      ? this.start.slice(0, 7)
      : (this.min && this.min > this.today ? this.min : this.today).slice(0, 7);
  }

  /** The start this component itself last emitted. */
  private picked: string | null = null;

  get monthLabel(): string {
    return MONTHS[Number(this.viewMonth.slice(5, 7)) - 1] + ' ' + this.viewMonth.slice(0, 4);
  }

  get prevDisabled(): boolean {
    return Boolean(this.min) && this.viewMonth <= this.min.slice(0, 7);
  }

  get nextDisabled(): boolean {
    return Boolean(this.max) && this.viewMonth >= this.max.slice(0, 7);
  }

  step(delta: number): void {
    const date = new Date(Number(this.viewMonth.slice(0, 4)), Number(this.viewMonth.slice(5, 7)) - 1 + delta, 1);
    this.viewMonth = date.getFullYear() + '-' + pad(date.getMonth() + 1);
    // A 5- vs 6-row month changes the panel's height — keep it anchored to the field.
    if (this.open) setTimeout(() => this.position());
  }

  private markOf(key: string): DateRangeMark | null {
    return this.marked.find((mark) => key >= mark.start && key <= mark.end) || null;
  }

  /** Marked ranges touching the visible month — the chips above the grid. */
  get monthMarks(): DateRangeMark[] {
    const first = this.viewMonth + '-01';
    const last = this.viewMonth + '-31';
    return this.marked.filter((mark) => mark.start <= last && mark.end >= first);
  }

  markLabel(mark: DateRangeMark): string {
    return mark.name + ' · ' + shortDate(mark.start) + (mark.start !== mark.end ? ' – ' + shortDate(mark.end) : '');
  }

  get cells(): RangeCell[] {
    const year = Number(this.viewMonth.slice(0, 4));
    const month = Number(this.viewMonth.slice(5, 7)) - 1;
    const firstDow = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const cells: RangeCell[] = [];
    for (let i = 0; i < firstDow; i += 1) cells.push({ key: '', day: null, cls: 'range-day empty', disabled: true, title: null });
    const end = this.end || this.start;
    for (let day = 1; day <= count; day += 1) {
      const key = this.viewMonth + '-' + pad(day);
      const dow = (firstDow + day - 1) % 7;
      const inRange = Boolean(this.start) && key >= this.start && key <= end;
      const outOfBounds = Boolean((this.min && key < this.min) || (this.max && key > this.max));
      // Picking the end: nothing before the start. Complete: nothing outside the range.
      const locked = (Boolean(this.start) && !this.end && key < this.start)
        || (Boolean(this.start) && Boolean(this.end) && (key < this.start || key > this.end));
      const disabled = this.disabled || outOfBounds || locked;
      const classes = ['range-day'];
      const mark = this.markOf(key);
      if (mark && !inRange) {
        classes.push('existing-hol');
        if (key === mark.start || dow === 0 || day === 1) classes.push('existing-band-l');
        if (key === mark.end || dow === 6 || day === count) classes.push('existing-band-r');
        if (key === mark.start || key === mark.end) classes.push('existing-endpoint');
      }
      if (inRange) {
        classes.push('in-range');
        if (key === this.start || dow === 0 || day === 1) classes.push('band-l');
        if (key === end || dow === 6 || day === count) classes.push('band-r');
      }
      if (key === this.start || key === this.end) classes.push('chain-endpoint');
      if (key === this.today) classes.push('today');
      if (disabled) classes.push('disabled');
      cells.push({ key, day, cls: classes.join(' '), disabled, title: mark ? this.markLabel(mark) : null });
    }
    return cells;
  }

  pick(cell: RangeCell): void {
    if (cell.disabled || !cell.key) return;
    let start = this.start;
    let end = this.end;
    if (!start || end) {
      start = cell.key;
      end = '';
    } else if (cell.key < start) {
      end = start;
      start = cell.key;
    } else {
      end = cell.key;
    }
    this.emit(start, end);
  }

  reset(): void {
    if (this.disabled) return;
    this.emit('', '');
  }

  private emit(start: string, end: string): void {
    this.start = start;
    this.end = end;
    this.picked = start;
    this.rangeChange.emit({ start, end });
  }

  get note(): string {
    if (!this.start) return 'Pick a date to start.';
    if (!this.end) return longDate(this.start) + ' — now pick the last day (or click it again for a one-day ' + this.noun + ').';
    if (this.summary) return this.summary;
    const days = rangeDayCount(this.start, this.end);
    return rangeLabel(this.start, this.end) + ' · ' + days + (days === 1 ? ' day.' : ' days, first and last day included.');
  }

  trackByIndex = (index: number): number => index;
}
