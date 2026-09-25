/**
 * app-pagination-bar — the `.pagination-bar` every list page ends with: a rows-per-page
 * `.dd`, the "1–20 of 84" range, and prev/next.
 *
 * Built once and shared, per additional-technical-considerations.md's pagination note, so
 * no module invents its own "load more" or page-number UI.
 *
 * The VISUAL pattern is identical whether the query underneath is offset- or keyset-based
 * (performance-principles.md) — only the page's own service decides that. Academic Setup's
 * three lists are inherently small (a school has tens of classes and subjects, not
 * thousands), which is exactly the case that doc allows offset pagination for.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { DdOption } from 'src/app/shared/models/shared-components.model';

@Component({
  selector: 'app-pagination-bar',
  templateUrl: './pagination-bar.component.html',
  styleUrls: ['./pagination-bar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaginationBarComponent {
  /** 1-based. */
  @Input() page = 1;
  @Input() limit = 10;
  @Input() total = 0;

  @Output() pageChange = new EventEmitter<number>();
  @Output() limitChange = new EventEmitter<number>();

  readonly limitOptions: readonly DdOption[] = [
    { value: '10', label: '10' },
    { value: '25', label: '25' },
    { value: '50', label: '50' }
  ];

  get limitValue(): string {
    return String(this.limit);
  }

  get firstRow(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.limit + 1;
  }

  get lastRow(): number {
    return Math.min(this.page * this.limit, this.total);
  }

  get hasPrev(): boolean {
    return this.page > 1;
  }

  get hasNext(): boolean {
    return this.page * this.limit < this.total;
  }

  onLimit(value: string): void {
    const limit = Number(value);
    if (!limit || limit === this.limit) return;
    this.limitChange.emit(limit);
  }

  prev(): void {
    if (this.hasPrev) this.pageChange.emit(this.page - 1);
  }

  next(): void {
    if (this.hasNext) this.pageChange.emit(this.page + 1);
  }
}
