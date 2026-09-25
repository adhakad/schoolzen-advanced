import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { DataTableComponent } from './data-table.component';
import { DataTableColumn } from 'src/app/shared/models/shared-components.model';

interface Row { _id: string; name: string; }

describe('DataTableComponent', () => {
  let fixture: ComponentFixture<DataTableComponent<Row>>;
  let component: DataTableComponent<Row>;

  const columns: DataTableColumn[] = [
    { key: 'name', label: 'Employee', width: '180px' },
    { key: 'action', label: 'Action', width: '100px', align: 'right' }
  ];
  const rows: Row[] = [
    { _id: 'a', name: 'Priya' },
    { _id: 'b', name: 'Rahul' }
  ];

  /** What a real template binding does: ngOnChanges, mark the OnPush view dirty, run CD. */
  const sync = () => {
    component.ngOnChanges();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [DataTableComponent]
    }).compileComponents();
    fixture = TestBed.createComponent<DataTableComponent<Row>>(DataTableComponent);
    component = fixture.componentInstance;
    component.columns = columns;
    component.rows = rows;
    component.selectable = true;
    sync();
  });

  it('sizes the inner wrapper to exactly the column set plus the checkbox column', () => {
    // 180 + 100 + 32 (checkbox) + 16 (row padding). Min and max are the same value: the
    // table is never wider than its columns add up to, which is what stopped the row
    // hover and separators painting across dead space on a wide screen.
    expect(component.minWidth).toBe('328px');
    expect(component.naturalWidth).toBe('328px');

    component.columns = [{ key: 'a', label: 'A', width: '900px' }];
    component.ngOnChanges();
    expect(component.minWidth).toBe('948px');
    expect(component.naturalWidth).toBe('948px');
  });

  it('selects and deselects a single row without mutating the input array', () => {
    let emitted: readonly Row[] = [];
    component.selectionChange.subscribe((next: readonly Row[]) => { emitted = next; });

    component.toggleRow(rows[0]);
    expect(emitted).toEqual([rows[0]]);
    expect(component.selected.length).toBe(0);

    component.selected = [rows[0]];
    component.toggleRow(rows[0]);
    expect(emitted).toEqual([]);
  });

  it('reports all/some selected and toggles select-all both ways', () => {
    let emitted: readonly Row[] = [];
    component.selectionChange.subscribe((next: readonly Row[]) => { emitted = next; });

    expect(component.allSelected).toBeFalse();
    expect(component.someSelected).toBeFalse();

    component.selected = [rows[0]];
    expect(component.someSelected).toBeTrue();
    expect(component.allSelected).toBeFalse();

    component.toggleAll();
    expect(emitted.length).toBe(2);

    component.selected = rows.slice();
    expect(component.allSelected).toBeTrue();
    component.toggleAll();
    expect(emitted).toEqual([]);
  });

  it('tracks rows by the configured key, falling back to the index', () => {
    expect(component.trackByRow(0, rows[0])).toBe('a');
    component.trackByKey = 'missing';
    expect(component.trackByRow(3, rows[0])).toBe(3);
  });

  it('renders a header cell per column plus the checkbox column', () => {
    const headers = fixture.nativeElement.querySelectorAll('.sw-th');
    expect(headers.length).toBe(columns.length + 1);
  });
});
