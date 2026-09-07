/**
 * app-data-table — the scrollable flex-row list every module's table is built from. It
 * owns the parts that must never drift between modules: the checkbox/select-all column,
 * the uppercase column-header row, the two-layer horizontal-scroll wrapper, row hover,
 * and the footer line. The module supplies only its own cell content.
 *
 * Inputs:
 *   columns    — DataTableColumn[] { key, label, width, align? }. The inner wrapper's
 *                min-width is summed from these, which is what makes the row set scroll
 *                as one unit instead of squashing.
 *   rows       — the data
 *   trackByKey — property name used for *ngFor identity (default '_id')
 *   selectable — show the leading checkbox column
 *   selected   — currently selected rows (the parent owns selection state)
 *   emptyText, footerLeft, footerRight
 *
 * Output: selectionChange
 *
 * Cells are projected with a template that receives the row:
 *   <app-data-table [columns]="cols" [rows]="rows" (selectionChange)="sel = $event">
 *     <ng-template #cells let-row>
 *       <app-row-avatar class="sw-cell" style="width:180px" [name]="row.name"></app-row-avatar>
 *       ...
 *     </ng-template>
 *   </app-data-table>
 */
import {
  ChangeDetectionStrategy, Component, ContentChild, EventEmitter, Input, OnChanges, Output, TemplateRef
} from '@angular/core';
import { DataTableColumn } from 'src/app/shared/models/shared-components.model';

@Component({
  selector: 'app-data-table',
  templateUrl: './data-table.component.html',
  styleUrls: ['./data-table.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataTableComponent<T extends Record<string, any> = Record<string, any>> implements OnChanges {
  @Input() columns: readonly DataTableColumn[] = [];
  @Input() rows: readonly T[] = [];
  @Input() trackByKey = '_id';
  @Input() selectable = false;
  @Input() selected: readonly T[] = [];
  @Input() emptyText = 'Nothing to show yet.';
  @Input() footerLeft = '';
  @Input() footerRight = '';

  @Output() selectionChange = new EventEmitter<readonly T[]>();

  @ContentChild('cells') cellTemplate: TemplateRef<{ $implicit: T; index: number }> | null = null;

  /** Precomputed so the template never calls a function per row. */
  minWidth = '880px';

  ngOnChanges(): void {
    const columnsWidth = this.columns.reduce((total, column) => {
      const width = parseInt(column.width, 10);
      return total + (isNaN(width) ? 0 : width);
    }, 0);
    const checkWidth = this.selectable ? 32 : 0;
    this.minWidth = Math.max(columnsWidth + checkWidth + 16, 640) + 'px';
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.selected.length === this.rows.length;
  }

  get someSelected(): boolean {
    return this.selected.length > 0 && this.selected.length < this.rows.length;
  }

  isSelected(row: T): boolean {
    return this.selected.indexOf(row) !== -1;
  }

  toggleRow(row: T): void {
    const next = this.isSelected(row)
      ? this.selected.filter((candidate) => candidate !== row)
      : this.selected.concat([row]);
    this.selectionChange.emit(next);
  }

  toggleAll(): void {
    this.selectionChange.emit(this.allSelected ? [] : this.rows.slice());
  }

  trackByRow = (index: number, row: T): unknown => {
    const key = row[this.trackByKey];
    return key === undefined ? index : key;
  };

  trackByColumn = (_index: number, column: DataTableColumn): string => column.key;
}
