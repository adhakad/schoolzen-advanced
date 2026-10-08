/**
 * The toolbar's month navigator — chevrons step a month, the label opens a calendar preview
 * of that month. Same control on Overview and Roster (both references share it).
 */
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { monthCalendar, monthLabel, shiftMonth } from 'src/app/shared/utils/attendance-time.util';

@Component({
  selector: 'app-month-nav',
  templateUrl: './month-nav.component.html',
  styleUrls: ['./month-nav.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthNavComponent {
  /** "YYYY-MM". */
  @Input() month = '';
  /** "YYYY-MM-DD" — outlined in the calendar. */
  @Input() today = '';
  @Output() monthChange = new EventEmitter<string>();

  open = false;

  constructor(private host: ElementRef<HTMLElement>) {}

  get label(): string {
    return this.month ? monthLabel(this.month) : '';
  }

  get days(): { day: number | null; cls: string }[] {
    if (!this.month) return [];
    const cells = monthCalendar(this.month);
    const last = cells[cells.length - 1];
    return cells.map((day, index) => {
      if (day === null) return { day, cls: 'range-day' };
      const dow = index % 7;
      const classes = ['range-day', 'in-range'];
      if (dow === 0 || day === 1) classes.push('band-l');
      if (dow === 6 || day === last) classes.push('band-r');
      if (day === 1 || day === last) classes.push('chain-endpoint');
      if (this.today === this.month + '-' + String(day).padStart(2, '0')) classes.push('today');
      return { day, cls: classes.join(' ') };
    });
  }

  toggle(event: Event): void {
    event.stopPropagation();
    this.open = !this.open;
  }

  step(event: Event, delta: number): void {
    event.stopPropagation();
    this.monthChange.emit(shiftMonth(this.month, delta));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }

  trackByIndex = (index: number): number => index;
}
