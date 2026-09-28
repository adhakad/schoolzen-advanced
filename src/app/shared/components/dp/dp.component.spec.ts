import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DpComponent } from './dp.component';

describe('DpComponent', () => {
  let fixture: ComponentFixture<DpComponent>;
  let component: DpComponent;
  const click = new MouseEvent('click');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [DpComponent] }).compileComponents();
    fixture = TestBed.createComponent(DpComponent);
    component = fixture.componentInstance;
  });

  it('renders no native date input anywhere', () => {
    component.toggle(click);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="date"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.dp-panel')).toBeTruthy();
  });

  it('shows the value as a readable label and opens on that month', () => {
    component.value = '2013-03-12';
    component.ngOnChanges();
    expect(component.label).toBe('12 Mar 2013');
    component.toggle(click);
    expect(component.monthLabel).toBe('March 2013');
    expect(component.cells.find((cell) => cell.selected)?.iso).toBe('2013-03-12');
  });

  it('emits an ISO date on pick, then closes and emits closed (the touch hook)', () => {
    const picked: string[] = [];
    let closed = 0;
    component.valueChange.subscribe((value) => picked.push(value));
    component.closed.subscribe(() => closed++);
    component.value = '2013-03-12';
    component.ngOnChanges();
    component.toggle(click);
    const cell = component.cells.find((c) => c.iso === '2013-03-20');
    component.pick(click, cell as never);
    expect(picked).toEqual(['2013-03-20']);
    expect(component.open).toBe(false);
    expect(closed).toBe(1);
  });

  it('emits closed on outside click and Escape, like .dd', () => {
    let closed = 0;
    component.closed.subscribe(() => closed++);
    component.toggle(click);
    component.onDocumentClick({ target: document.body } as unknown as MouseEvent);
    component.toggle(click);
    component.onEscape();
    expect(closed).toBe(2);
  });

  it('greys out days past max and refuses to pick them', () => {
    const picked: string[] = [];
    component.valueChange.subscribe((value) => picked.push(value));
    component.value = '2026-09-10';
    component.max = '2026-09-15';
    component.ngOnChanges();
    component.toggle(click);
    const late = component.cells.find((c) => c.iso === '2026-09-20');
    expect(late?.disabled).toBe(true);
    component.pick(click, late as never);
    expect(picked).toEqual([]);
  });

  it('jumps years through the year grid (no native select)', () => {
    component.value = '2026-01-05';
    component.ngOnChanges();
    component.toggle(click);
    component.toggleYears(click);
    expect(component.mode).toBe('years');
    component.prev(click);
    component.pickYear(click, component.years[0]);
    expect(component.mode).toBe('days');
    expect(component.viewYear).toBe(component.years[0]);
  });
});
