/**
 * The toolbar's month navigator — chevrons step a month, the label opens a calendar preview
 * of that month. Same control on Overview and Roster (both references share it).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild
} from '@angular/core';
import { monthCalendar, monthLabel, shiftMonth } from 'src/app/shared/utils/attendance-time.util';
import { placeBelow } from 'src/app/shared/utils/overlay-position.util';

@Component({
  selector: 'app-month-nav',
  templateUrl: './month-nav.component.html',
  styleUrls: ['./month-nav.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthNavComponent implements OnDestroy {
  @ViewChild('menu', { static: true }) menu!: ElementRef<HTMLElement>;
  @ViewChild('trigger', { static: true }) trigger!: ElementRef<HTMLElement>;
  /** "YYYY-MM". */
  @Input() month = '';
  /** "YYYY-MM-DD" — outlined in the calendar. */
  @Input() today = '';
  @Output() monthChange = new EventEmitter<string>();

  open = false;

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.close();
  }

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
    this.monthChange.emit(shiftMonth(this.month, delta));
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
