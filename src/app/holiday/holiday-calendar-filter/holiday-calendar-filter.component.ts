/**
 * Holidays' month filter — a custom inline mini-calendar popover, deliberately NOT the
 * generic `.dd` option list (prompt 06, design rules).
 *
 * Collapsed: ‹ label › — the arrows step the month without opening anything; the label
 * opens the popover. Open: the month's holidays as chips, a 7-column calendar with every
 * holiday day banded, its own ‹ › controls, and "Show all months" to clear the filter.
 * `month` is "YYYY-MM", or '' for all months.
 */
import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output
} from '@angular/core';
import { Holiday } from 'src/app/shared/models/holiday/holiday.model';

interface CalendarCell {
  day: number | null;
  key: string;
  inRange: boolean;
  bandLeft: boolean;
  bandRight: boolean;
  endpoint: boolean;
  names: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shortDay = (key: string): string => `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1].slice(0, 3)}`;
const pad = (n: number): string => String(n).padStart(2, '0');

/** "YYYY-MM" shifted by `delta` months. */
export const shiftMonth = (month: string, delta: number): string => {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
};

@Component({
  selector: 'app-holiday-calendar-filter',
  templateUrl: './holiday-calendar-filter.component.html',
  styleUrls: ['./holiday-calendar-filter.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HolidayCalendarFilterComponent implements OnChanges {
  @Input() month = '';
  /** Every holiday (not just the current page) — what the calendar bands. */
  @Input() holidays: Holiday[] = [];
  /** "YYYY-MM" the popover opens on when no month is filtered. */
  @Input() today = '';
  @Output() monthChange = new EventEmitter<string>();

  open = false;
  /** The month shown in the popover (follows `month`, or today when unfiltered). */
  viewMonth = '';
  cells: CalendarCell[] = [];
  monthHolidays: Holiday[] = [];
  readonly dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    this.viewMonth = this.month || this.viewMonth || this.today || this.currentMonth();
    this.build();
  }

  get label(): string {
    return this.month ? this.titleOf(this.month) : 'Holiday Calendar';
  }

  get viewTitle(): string {
    return this.titleOf(this.viewMonth);
  }

  toggle(): void {
    this.open = !this.open;
  }

  /** Collapsed arrows: step the filter itself (starting from the view month when unfiltered). */
  step(delta: number, event?: Event): void {
    if (event) event.stopPropagation();
    const next = shiftMonth(this.month || this.viewMonth, delta);
    this.viewMonth = next;
    this.build();
    this.monthChange.emit(next);
  }

  showAll(): void {
    this.open = false;
    this.monthChange.emit('');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }

  /** "Diwali · 28 Oct – 1 Nov" — the chip per holiday in the visible month (holidays.html). */
  chipLabel(row: Holiday): string {
    return row.name + ' · ' + shortDay(row.startDate) + (row.startDate !== row.endDate ? ' – ' + shortDay(row.endDate) : '');
  }

  trackByCell = (index: number): number => index;
  trackByHoliday = (_index: number, row: Holiday): string => row._id;

  private build(): void {
    if (!this.viewMonth) return;
    const [year, mon] = this.viewMonth.split('-').map(Number);
    const first = `${this.viewMonth}-01`;
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const last = `${this.viewMonth}-${pad(lastDay)}`;
    this.monthHolidays = this.holidays.filter((row) => row.startDate <= last && row.endDate >= first);

    const lead = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
    const cells: CalendarCell[] = [];
    for (let i = 0; i < lead; i += 1) cells.push({ day: null, key: '', inRange: false, bandLeft: false, bandRight: false, endpoint: false, names: '' });
    for (let day = 1; day <= lastDay; day += 1) {
      const key = `${this.viewMonth}-${pad(day)}`;
      const hits = this.monthHolidays.filter((row) => row.startDate <= key && row.endDate >= key);
      // Each day's OWN holiday decides its band, so two holidays on back-to-back days never
      // merge into one continuous band.
      const own = hits[0];
      const column = (lead + day - 1) % 7;
      cells.push({
        day,
        key,
        inRange: Boolean(own),
        bandLeft: Boolean(own) && (own.startDate === key || column === 0),
        bandRight: Boolean(own) && (own.endDate === key || column === 6),
        endpoint: Boolean(own) && (own.startDate === key || own.endDate === key),
        names: hits.map((row) => row.name).join(', ')
      });
    }
    this.cells = cells;
  }

  private titleOf(month: string): string {
    const [year, mon] = month.split('-').map(Number);
    return `${MONTHS[mon - 1]} ${year}`;
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  }
}
