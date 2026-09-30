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
 * Positioning and closing behave exactly like `.dd`: the panel opens below the field, one
 * open at a time, and it closes on select, outside click or Escape. Every close emits
 * `closed`, because a `.dp` gets no native blur either — the bound form control has to be
 * marked touched from here or a required, never-opened date would never show its error.
 *
 * Month/year navigation is by chevrons only (no native select inside). Clicking the month
 * label switches to a 12-year grid, so a date of birth fifteen years back is a few clicks,
 * not 180.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostBinding,
  HostListener, Input, OnChanges, Output
} from '@angular/core';

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
export class DpComponent implements OnChanges {
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

  @HostBinding('class.dp') readonly dpClass = true;
  @HostBinding('class.open') get openClass(): boolean { return this.open; }
  @HostBinding('class.disabled') get disabledClass(): boolean { return this.disabled; }

  open = false;
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
      this.open = true;
    }
  }

  prev(event: Event): void {
    event.stopPropagation();
    if (this.mode === 'years') {
      this.buildYears(this.years[0] - YEARS_PER_PAGE);
      return;
    }
    this.viewMonth -= 1;
    if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear -= 1; }
    this.buildDays();
  }

  next(event: Event): void {
    event.stopPropagation();
    if (this.mode === 'years') {
      this.buildYears(this.years[0] + YEARS_PER_PAGE);
      return;
    }
    this.viewMonth += 1;
    if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear += 1; }
    this.buildDays();
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
  }

  pickYear(event: Event, year: number): void {
    event.stopPropagation();
    this.viewYear = year;
    this.mode = 'days';
    this.buildDays();
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
    if (!this.open) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.close();
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open) return;
    this.close();
    this.cdr.markForCheck();
  }

  isYearSelected(year: number): boolean {
    return year === this.viewYear;
  }

  trackByIso = (_index: number, cell: DayCell): string => cell.iso;
  trackByYear = (_index: number, year: number): number => year;

  private close(): void {
    this.open = false;
    this.closed.emit();
  }

  private syncViewToValue(): void {
    const parts = parseIso(this.value) || parseIso(this.max && this.max < todayIso() ? this.max : '');
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
