/**
 * app-data-toolbar — THE toolbar (Rule 21). Every page uses it; no page writes its own
 * search box or toolbar buttons.
 *
 *   <app-data-toolbar searchPlaceholder="Search classes" [searchValue]="search"
 *                     [actions]="menuItems" [selectedCount]="selected.size"
 *                     [chosen]="{ Class: !!classId }"
 *                     [primaryAction]="{ label: 'Add Class', icon: 'plus-lg' }"
 *                     (searchChange)="onSearchChange($event)" (actionClick)="onAction($event)"
 *                     (primaryActionClick)="onAdd()">
 *     <div class="toolbar-row2"> ...the page's filters (Rule 14 grid)... </div>
 *   </app-data-toolbar>
 *
 * Row 1: search (200-280px), then "Actions" (every non-primary button, as menu items),
 * then the black primary, right-most. A menu item's `needs` ('sel' and/or a filter name)
 * decides, live, whether it is enabled; an unmet item stays visible with its reason.
 * The card width (not the viewport) picks the layout: <= 640px search alone on its row,
 * then Actions | primary; 641-819px the filter grid is 4 per row, else 6.
 *
 * The legacy `filters` input still renders its own pills (components gallery).
 */
import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter,
  HostListener, Input, NgZone, OnChanges, OnDestroy, Output, Renderer2, ViewChild
} from '@angular/core';
import { MatDatepicker } from '@angular/material/datepicker';
import {
  ToolbarAction, ToolbarFilter, ToolbarFilterChange, ToolbarFilterOption, ToolbarFilterType, ToolbarMenuItem
} from 'src/app/shared/models/shared-components.model';
import { showTip, hideTip } from '../tip/tip.util';

interface RenderedFilter {
  key: string;
  icon: string;
  type: ToolbarFilterType;
  options: readonly ToolbarFilterOption[];
  value: string;
  disabled: boolean;
  isSelect: boolean;
  isMonth: boolean;
  startView: 'month' | 'multi-year';
  dateValue: Date | null;
  dateLabel: string;
}

export interface RenderedMenuItem {
  key: string;
  text: string;
  icon: string;
  danger: boolean;
  busy: boolean;
  /** Visible but not usable. */
  off: boolean;
  reason: string;
  tip: string;
  sepBefore: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number): string => (value < 10 ? '0' + value : String(value));
const parseValue = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value || '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || '1'));
};
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** 'sel' → "select rows"; 'Class' → "choose a class"; 'Exam' → "choose an exam". */
export const needReason = (need: string): string => {
  if (need === 'sel') return 'select rows';
  const word = need.toLowerCase();
  return 'choose ' + (/^[aeiou]/.test(word) ? 'an ' : 'a ') + word;
};

/** Pure: what the menu shows for the given items, ticked-row count and chosen filters. */
export const renderMenu = (
  items: readonly ToolbarMenuItem[], selectedCount: number, chosen: Readonly<Record<string, boolean>>
): RenderedMenuItem[] => {
  const shown = items.filter((item) => !item.hidden);
  const ordered = [...shown.filter((i) => !i.danger), ...shown.filter((i) => i.danger)];
  let firstDanger = true;
  return ordered.map((item) => {
    const needs = item.needs || [];
    const unmet = needs.find((need) => (need === 'sel' ? selectedCount < 1 : !chosen[need]));
    const text = item.label + (needs.includes('sel') && selectedCount > 0 ? ` (${selectedCount})` : '');
    let reason = unmet ? needReason(unmet) : '';
    if (!reason && item.disabled) reason = item.why || 'not available now';
    if (!reason && item.busy) reason = 'working…';
    const off = !!reason;
    const sepBefore = !!item.danger && firstDanger && ordered.length > 1 && ordered[0] !== item;
    if (item.danger) firstDanger = false;
    return {
      key: item.key, text, icon: item.icon || '', danger: !!item.danger, busy: !!item.busy,
      off, reason, sepBefore, tip: off ? `${cap(reason)} — ${text}` : text
    };
  });
};

@Component({
  selector: 'app-data-toolbar',
  templateUrl: './data-toolbar.component.html',
  styleUrls: ['./data-toolbar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataToolbarComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() showSearch = true;
  @Input() searchPlaceholder = 'Search';
  @Input() searchValue = '';
  @Input() searchDisabled = false;
  @Input() filters: readonly ToolbarFilter[] = [];
  @Input() primaryAction: ToolbarAction | null = null;
  /** Every non-primary button, as items of the one "Actions" menu. */
  @Input() actions: readonly ToolbarMenuItem[] = [];
  @Input() selectedCount = 0;
  /** Filter name → has a value, for items whose `needs` names a filter. */
  @Input() chosen: Readonly<Record<string, boolean>> = {};

  @Output() searchChange = new EventEmitter<string>();
  @Output() filterChange = new EventEmitter<ToolbarFilterChange>();
  @Output() primaryActionClick = new EventEmitter<void>();
  @Output() actionClick = new EventEmitter<string>();

  @ViewChild('bar', { static: true }) bar!: ElementRef<HTMLElement>;
  @ViewChild('trigger') trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('menuEl') menuEl?: ElementRef<HTMLElement>;

  views: RenderedFilter[] = [];
  menu: RenderedMenuItem[] = [];
  hasNeeds = false;
  menuOpen = false;
  primaryTitle = '';
  narrow = false;

  private resize?: ResizeObserver;

  constructor(
    private readonly host: ElementRef<HTMLElement>, private readonly renderer: Renderer2,
    private readonly cd: ChangeDetectorRef, private readonly zone: NgZone
  ) {}

  ngOnChanges(): void {
    this.menu = renderMenu(this.actions || [], this.selectedCount || 0, this.chosen || {});
    this.hasNeeds = (this.actions || []).some((item) => !item.hidden && !!item.needs?.length);
    const p = this.primaryAction;
    this.primaryTitle = p ? (p.disabled && p.why ? `${cap(p.why)} — ${p.label}` : p.label) : '';
    this.views = (this.filters || [])
      .filter((filter) => !(filter.existenceBased && filter.hidden))
      .map((filter) => {
        const type: ToolbarFilterType = filter.type || 'select';
        const date = type === 'select' ? null : parseValue(filter.value);
        return {
          key: filter.key, icon: filter.icon || '', type, options: filter.options || [],
          value: filter.value, disabled: !!filter.disabled, isSelect: type === 'select',
          isMonth: type === 'month',
          startView: (type === 'month' ? 'multi-year' : 'month') as 'month' | 'multi-year',
          dateValue: date, dateLabel: this.formatDate(date, type)
        };
      });
    if (this.menuOpen && !this.menu.length) this.menuOpen = false;
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const card = this.host.nativeElement.closest('.sw-card-main') as HTMLElement | null;
    const target = card || this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      this.resize = new ResizeObserver(() => this.measure(target, !!card));
      this.resize.observe(target);
    });
    this.measure(target, !!card);
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
    hideTip();
  }

  /** Card width classes: tb-narrow (<= 640), tb-mid (641-819). */
  private measure(target: HTMLElement, isCard: boolean): void {
    const width = target.getBoundingClientRect().width + (isCard ? 0 : 40);
    if (!width) return;
    const el = this.host.nativeElement;
    this.narrow = width <= 640;
    const mid = !this.narrow && width < 820;
    if (el.classList.contains('tb-narrow') !== this.narrow) {
      this.narrow ? this.renderer.addClass(el, 'tb-narrow') : this.renderer.removeClass(el, 'tb-narrow');
    }
    // Divider bleed = distance from the toolbar to the card's inner edges (its padding), so the
    // line runs edge to edge of the card (Rule 21b.1).
    if (isCard) {
      const card = target.getBoundingClientRect();
      const own = el.getBoundingClientRect();
      const style = getComputedStyle(target);
      const left = Math.max(0, own.left - card.left - (parseFloat(style.borderLeftWidth) || 0));
      const right = Math.max(0, card.right - own.right - (parseFloat(style.borderRightWidth) || 0));
      el.style.setProperty('--tb-bleed-l', Math.round(left) + 'px');
      el.style.setProperty('--tb-bleed-r', Math.round(right) + 'px');
    }
    if (el.classList.contains('tb-mid') !== mid) {
      mid ? this.renderer.addClass(el, 'tb-mid') : this.renderer.removeClass(el, 'tb-mid');
    }
    if (this.menuOpen) this.position();
  }

  onSearchInput(value: string): void {
    this.searchChange.emit(value);
  }

  // --- Actions menu -------------------------------------------------------------------
  toggleMenu(focusFirst = false): void {
    this.menuOpen ? this.closeMenu() : this.openMenu(focusFirst);
  }

  openMenu(focusFirst = false): void {
    if (!this.menu.length) return;
    this.menuOpen = true;
    this.cd.detectChanges();
    this.position();
    if (focusFirst) this.items()[0]?.focus();
  }

  closeMenu(refocus = false): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    hideTip();
    this.cd.markForCheck();
    this.cd.detectChanges();
    if (refocus) this.trigger?.nativeElement.focus();
  }

  pick(item: RenderedMenuItem): void {
    if (item.off) {
      const el = this.menuEl?.nativeElement.querySelector<HTMLElement>(`[data-key="${item.key}"]`);
      if (el) showTip(el, item.tip);
      return;
    }
    this.closeMenu();
    this.actionClick.emit(item.key);
  }

  onTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.menuOpen ? this.items()[0]?.focus() : this.openMenu(true);
    }
  }

  onMenuKey(event: KeyboardEvent): void {
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => { event.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
    switch (event.key) {
      case 'ArrowDown': go(index + 1); break;
      case 'ArrowUp': go(index - 1); break;
      case 'Home': go(0); break;
      case 'End': go(items.length - 1); break;
      case 'Escape': event.preventDefault(); this.closeMenu(true); break;
      case 'Tab': this.closeMenu(); break;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen && !this.host.nativeElement.contains(event.target as Node)) this.closeMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuOpen) this.closeMenu(true);
  }

  /**
   * Under the button, `max-content` wide but never wider than the card's inner width.
   * Desktop: right edge under the trigger's right edge. Card <= 640px: left-aligned.
   */
  private position(): void {
    const menu = this.menuEl?.nativeElement;
    const trigger = this.trigger?.nativeElement;
    if (!menu || !trigger) return;
    const bar = this.bar.nativeElement.getBoundingClientRect();
    const t = trigger.getBoundingClientRect();
    const card = this.host.nativeElement.closest('.sw-card-main') as HTMLElement | null;
    const room = Math.min(bar.width, card ? card.getBoundingClientRect().width - 36 : bar.width);
    menu.style.maxWidth = Math.floor(room) + 'px';
    const w = menu.getBoundingClientRect().width;
    let left = this.narrow ? t.left - bar.left : t.right - bar.left - w;
    left = Math.max(0, Math.min(left, bar.width - w));
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(t.bottom - bar.top + 4) + 'px';
  }

  private items(): HTMLElement[] {
    return Array.from(this.menuEl?.nativeElement.querySelectorAll<HTMLElement>('.tb-menu-item') || []);
  }

  // --- legacy filters input -------------------------------------------------------------
  onFilterChange(key: string, value: string): void {
    this.filterChange.emit({ key, value });
  }

  onDateSelected(key: string, date: Date | null): void {
    if (!date) return;
    this.onFilterChange(key, date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()));
  }

  onMonthSelected(filter: RenderedFilter, date: Date, picker: MatDatepicker<Date>): void {
    if (!filter.isMonth) return;
    this.onFilterChange(filter.key, date.getFullYear() + '-' + pad(date.getMonth() + 1));
    picker.close();
  }

  trackByKey = (_index: number, filter: RenderedFilter): string => filter.key;
  trackByItemKey = (_index: number, item: RenderedMenuItem): string => item.key;
  trackByValue = (_index: number, option: ToolbarFilterOption): string => option.value;

  private formatDate(date: Date | null, type: ToolbarFilterType): string {
    if (!date || type === 'select') return '';
    const month = MONTH_NAMES[date.getMonth()];
    return type === 'month' ? month + ' ' + date.getFullYear() : date.getDate() + ' ' + month + ' ' + date.getFullYear();
  }
}
