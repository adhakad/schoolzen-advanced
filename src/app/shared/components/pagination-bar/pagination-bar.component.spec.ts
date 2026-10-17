import { PaginationBarComponent } from './pagination-bar.component';

describe('PaginationBarComponent', () => {
  it('offers 75 and 100 rows per page (global rule 10)', () => {
    const bar = new PaginationBarComponent();
    expect(bar.limitOptions.map((option) => option.value)).toEqual(['10', '25', '50', '75', '100']);
    const emitted: number[] = [];
    bar.limitChange.subscribe((limit) => emitted.push(limit));
    bar.onLimit('100');
    expect(emitted).toEqual([100]);
  });
});
