/**
 * THE month filter (global rule 7, design-system.md "Month filter") — every page's month
 * filter is this component: chevrons step a month, the label opens a calendar of that month.
 * Its width is the global `--month-filter-w` (one filter cell), set once in the global stylesheet.
 *
 * Optional, for pages whose month filter does more (Holidays):
 *  - `emptyLabel`: `month` may be '' ("all months"); the trigger then shows this label.
 *  - `marks`: band only these date ranges (with their names as tooltips) instead of the month.
 *  - `showAllLabel`: a link under the calendar that clears the filter (emits '').
 *  - `[monthNavHead]` content is projected above the calendar (e.g. the month's holiday chips).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild
} from '@angular/core';
import { currentMonthKey, monthCalendar, monthLabel, shiftMonth } from 'src/app/shared/utils/attendance-time.util';
import { placeBelow } from 'src/app/shared/utils/overlay-position.util';

export interface MonthNavMark {
  startDate: string;
  endDate: string;
  name: string;
}

@Component({
  selector: 'app-month-nav',
  templateUrl: './month-nav.component.html',
  styleUrls: ['./month-nav.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthNavComponent implements OnDestroy {
  @ViewChild('menu', { static: true }) menu!: ElementRef<HTMLElement>;
  @ViewChild('trigger', { static: true }) trigger!: ElementRef<HTMLElement>;
  /** "YYYY-MM", or '' for all months when `emptyLabel` is set. */
  @Input() month = '';
  /** "YYYY-MM-DD" (outlined in the calendar) or "YYYY-MM"; also the month shown while `month` is ''. */
  @Input() today = '';
  @Input() emptyLabel = '';
  @Input() marks: MonthNavMark[] | null = null;
  @Input() showAllLabel = '';
  /** A wider calendar for projected head content (Holidays' chips). */
  @Input() wide = false;
  @Output() monthChange = new EventEmitter<string>();

  open = false;

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.close();
  }

  /** The month the calendar shows. */
  get viewMonth(): string {
    return this.month || (this.today ? this.today.slice(0, 7) : currentMonthKey());
  }

  get label(): string {
    return this.month ? monthLabel(this.month) : this.emptyLabel;
  }

  get title(): string {
    return monthLabel(this.viewMonth);
  }

  get days(): { day: number | null; cls: string; names: string | null }[] {
    const month = this.viewMonth;
    const cells = monthCalendar(month);
    const last = cells[cells.length - 1];
    return cells.map((day, index) => {
      if (day === null) return { day, cls: 'range-day', names: null };
      const key = month + '-' + String(day).padStart(2, '0');
      const dow = index % 7;
      const classes = ['range-day'];
      let names: string | null = null;
      if (this.marks) {
        const hits = this.marks.filter((mark) => mark.startDate <= key && mark.endDate >= key);
        // Each day's OWN first mark decides its band, so back-to-back ranges never merge.
        const own = hits[0];
        if (own) {
          classes.push('in-range', 'marked');
          if (dow === 0 || own.startDate === key) classes.push('band-l');
          if (dow === 6 || own.endDate === key) classes.push('band-r');
          if (own.startDate === key || own.endDate === key) classes.push('chain-endpoint');
          names = hits.map((mark) => mark.name).join(', ');
        }
      } else {
        classes.push('in-range');
        if (dow === 0 || day === 1) classes.push('band-l');
        if (dow === 6 || day === last) classes.push('band-r');
        if (day === 1 || day === last) classes.push('chain-endpoint');
      }
      if (this.today === key) classes.push('today');
      return { day, cls: classes.join(' '), names };
    });
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.open) this.close();
    else this.openMenu();
  }

  /** Same overlay rule as every `.dd`: portaled to <body>, placed directly below the trigger. */
  private openMenu(): void {
    this.open = true;
    const menu = this.menu.nativeElement;
    menu.classList.add('dd-portal');
    document.body.appendChild(menu);
    this.cdr.detectChanges();
    this.position();
    document.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    document.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    const menu = this.menu.nativeElement;
    menu.classList.remove('dd-portal', 'flipped');
    menu.removeAttribute('style');
    this.host.nativeElement.querySelector('.dd')?.appendChild(menu);
    this.cdr.markForCheck();
  }

  private position(): void {
    placeBelow(this.menu.nativeElement, this.trigger.nativeElement.getBoundingClientRect());
  }

  private reposition = (): void => {
    if (this.open) this.position();
  };

  step(event: Event, delta: number): void {
    event.stopPropagation();
    this.monthChange.emit(shiftMonth(this.viewMonth, delta));
  }

  showAll(): void {
    this.close();
    this.monthChange.emit('');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as Node;
    if (this.open && !this.host.nativeElement.contains(target) && !this.menu.nativeElement.contains(target)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  trackByIndex = (index: number): number => index;
}
