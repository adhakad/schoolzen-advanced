/**
 * app-skeleton — THE loading state (Rule 22). No page has its own blur, spinner, "Loading…"
 * text or skeleton CSS.
 *
 * In a table, as a second tbody right after the real one (real column widths for free):
 *   <tbody app-skeleton *ngIf="loading" (retry)="fetch()"></tbody>
 * Anywhere else (cards, dashboard tiles, a panel):
 *   <app-skeleton *ngIf="loading" kind="cards" [count]="4" [height]="96" (retry)="load()"></app-skeleton>
 *
 * Nothing shows for the first 150ms (fast responses never flicker); then the real rows of
 * the same table step aside (`table.sk-loading`) and 8-10 shimmer rows take their place, so
 * a filter change shows the skeleton too. After 10s it turns into an error with Retry.
 * The page's own empty state ("No records") takes over the moment `loading` goes false.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostBinding,
  Input, OnDestroy, OnInit, Output
} from '@angular/core';

export type SkeletonKind = 'table' | 'cards' | 'lines';

@Component({
  selector: 'app-skeleton, tbody[app-skeleton]',
  templateUrl: './skeleton.component.html',
  styleUrls: ['./skeleton.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonComponent implements OnInit, OnDestroy {
  /** Inferred: a tbody host is a table, anything else is lines unless told. */
  @Input() kind: SkeletonKind | '' = '';
  /** Table rows / lines. */
  @Input() rows = 8;
  /** Table columns; read from the table's header row when not given. */
  @Input() cols = 0;
  /** 0-based column index that holds a round avatar (table kind). */
  @Input() avatarCol = -1;
  /** Cards. */
  @Input() count = 4;
  @Input() height = 88;
  @Input() delay = 150;
  @Input() timeout = 10000;
  @Output() retry = new EventEmitter<void>();

  @HostBinding('class.sk-body') isBody = false;

  visible = false;
  /** Only offer Retry when the page listens for it. */
  hasRetry = false;
  timedOut = false;
  rowList: number[] = [];
  colList: number[] = [];
  cardList: number[] = [];

  private timers: ReturnType<typeof setTimeout>[] = [];
  /** Cached: by ngOnDestroy the host is already out of the table. */
  private tableEl: HTMLTableElement | null = null;

  constructor(private readonly host: ElementRef<HTMLElement>, private readonly cd: ChangeDetectorRef) {}

  get mode(): SkeletonKind {
    return this.kind || (this.isBody ? 'table' : 'lines');
  }

  ngOnInit(): void {
    this.isBody = this.host.nativeElement.tagName === 'TBODY';
    this.hasRetry = this.retry.observers.length > 0;
    this.tableEl = this.isBody ? this.host.nativeElement.closest('table') : null;
    const rows = Math.max(1, this.rows);
    this.rowList = Array.from({ length: rows }, (_v, i) => i);
    this.cardList = Array.from({ length: Math.max(1, this.count) }, (_v, i) => i);
    this.colList = Array.from({ length: Math.max(1, this.cols || this.headerCols()) }, (_v, i) => i);
    this.start();
  }

  ngOnDestroy(): void {
    this.clear();
    this.table()?.classList.remove('sk-loading');
  }

  onRetry(): void {
    this.timedOut = false;
    this.show();
    this.retry.emit();
    this.timers.push(setTimeout(() => this.fail(), this.timeout));
  }

  /** Bar width per cell: varied, stable (no Math.random — no layout change between checks). */
  width(row: number, col: number): number {
    return 45 + ((row * 7 + col * 13) % 5) * 10;
  }

  private start(): void {
    this.clear();
    this.timers.push(setTimeout(() => this.show(), this.delay));
    this.timers.push(setTimeout(() => this.fail(), this.timeout));
  }

  private show(): void {
    this.visible = true;
    this.table()?.classList.add('sk-loading');
    this.cd.markForCheck();
  }

  private fail(): void {
    this.timedOut = true;
    this.show();
  }

  private clear(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  private table(): HTMLTableElement | null {
    return this.tableEl;
  }

  private headerCols(): number {
    const row = this.table()?.querySelector('thead tr:last-child');
    if (!row) return 5;
    return Array.from(row.children).reduce((n, th) => n + ((th as HTMLTableCellElement).colSpan || 1), 0);
  }
}
