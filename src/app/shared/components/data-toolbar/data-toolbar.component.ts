/**
 * app-data-toolbar — the one toolbar every list page uses: a search box, N fixed-width
 * (128px) filter pills, and the primary action button, all wrapping together as one group.
 *
 * Inputs:
 *   searchPlaceholder
 *   searchValue
 *   filters       — ToolbarFilter[]; supply them in the fixed order
 *                   Search -> scope filters -> status/mode filters -> period picker LAST,
 *                   keeping dependent pairs (Department+Designation, Class+Section)
 *                   adjacent.
 *   primaryAction — ToolbarAction | null. A bulk action stays disabled until at least one
 *                   row is selected; that is the caller's job to set.
 *
 * Outputs: searchChange (debounced 250ms), filterChange, primaryActionClick
 *
 * Controls are Angular Material (mat-select / mat-datepicker — the app's one component
 * library) re-themed to the `.sw-select-pill` shape in the design system; a page never
 * sees Material's own chrome and never needs its own pill CSS.
 *
 * Two filter behaviours, deliberately NOT interchangeable:
 *   - a mutual-dependency filter (Department/Designation/Class) is ALWAYS in the DOM and
 *     merely `disabled` until its parent is chosen — hiding one has caused a real bug
 *     where the pill never came back;
 *   - only an `existenceBased` filter (Section/Stream) may be absent entirely, and only
 *     when the school has never created any.
 *
 * A 'date'/'month' filter emits the same {key, value} string change as a select
 * ('YYYY-MM-DD' / 'YYYY-MM'), so no page deals in Date objects.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output
} from '@angular/core';
import { MatDatepicker } from '@angular/material/datepicker';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import {
  ToolbarAction, ToolbarFilter, ToolbarFilterChange, ToolbarFilterOption, ToolbarFilterType
} from 'src/app/shared/models/shared-components.model';

/** One pill, fully precomputed — the template does no work beyond reading these. */
interface RenderedFilter {
  key: string;
  icon: string;
  type: ToolbarFilterType;
  options: readonly ToolbarFilterOption[];
  value: string;
  disabled: boolean;
  isSelect: boolean;
  isMonth: boolean;
  /** A month filter opens straight on the year grid; a date filter on the day grid. */
  startView: 'month' | 'multi-year';
  /** Datepicker value; null when the filter is a select or has no value yet. */
  dateValue: Date | null;
  /** What a date pill shows when closed, e.g. 'August 2026'. */
  dateLabel: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const pad = (value: number): string => (value < 10 ? '0' + value : String(value));

/**
 * Parsed off the string, never through Date arithmetic — the same rule the backend's
 * parseDateKey() follows, so a value can never drift a day or a month across a timezone.
 */
const parseValue = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value || '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || '1'));
};

@Component({
  selector: 'app-data-toolbar',
  templateUrl: './data-toolbar.component.html',
  styleUrls: ['./data-toolbar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataToolbarComponent implements OnInit, OnChanges, OnDestroy {
  @Input() searchPlaceholder = 'Search';
  @Input() searchValue = '';
  @Input() filters: readonly ToolbarFilter[] = [];
  @Input() primaryAction: ToolbarAction | null = null;

  @Output() searchChange = new EventEmitter<string>();
  @Output() filterChange = new EventEmitter<ToolbarFilterChange>();
  @Output() primaryActionClick = new EventEmitter<void>();

  /** Precomputed pills — no function calls from the template. */
  views: RenderedFilter[] = [];

  private readonly search$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((value) => this.searchChange.emit(value));
  }

  ngOnChanges(): void {
    this.views = this.filters
      // An existence-based filter (Section/Stream) is the only kind allowed to be absent;
      // every other filter stays visible and is merely disabled.
      .filter((filter) => !(filter.existenceBased && filter.hidden))
      .map((filter) => {
        const type: ToolbarFilterType = filter.type || 'select';
        const date = type === 'select' ? null : parseValue(filter.value);
        return {
          key: filter.key,
          icon: filter.icon || '',
          type,
          options: filter.options || [],
          value: filter.value,
          disabled: !!filter.disabled,
          isSelect: type === 'select',
          isMonth: type === 'month',
          startView: (type === 'month' ? 'multi-year' : 'month') as 'month' | 'multi-year',
          dateValue: date,
          dateLabel: this.formatDate(date, type)
        };
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(value: string): void {
    this.search$.next(value);
  }

  onFilterChange(key: string, value: string): void {
    this.filterChange.emit({ key, value });
  }

  /** A day was picked: emit 'YYYY-MM-DD'. */
  onDateSelected(key: string, date: Date | null): void {
    if (!date) return;
    this.onFilterChange(key, date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()));
  }

  /**
   * A month was picked in the year view: emit 'YYYY-MM' and close the calendar, since a
   * month picker must not fall through to day selection.
   */
  onMonthSelected(filter: RenderedFilter, date: Date, picker: MatDatepicker<Date>): void {
    if (!filter.isMonth) return;
    this.onFilterChange(filter.key, date.getFullYear() + '-' + pad(date.getMonth() + 1));
    picker.close();
  }

  trackByKey = (_index: number, filter: RenderedFilter): string => filter.key;
  trackByValue = (_index: number, option: ToolbarFilterOption): string => option.value;

  private formatDate(date: Date | null, type: ToolbarFilterType): string {
    if (!date || type === 'select') return '';
    const month = MONTH_NAMES[date.getMonth()];
    return type === 'month'
      ? month + ' ' + date.getFullYear()
      : date.getDate() + ' ' + month.slice(0, 3) + ' ' + date.getFullYear();
  }
}
