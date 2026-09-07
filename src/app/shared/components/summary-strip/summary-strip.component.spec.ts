import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { SummaryStripComponent } from './summary-strip.component';

describe('SummaryStripComponent', () => {
  let fixture: ComponentFixture<SummaryStripComponent>;
  let component: SummaryStripComponent;

  /** What a real template binding does: ngOnChanges, mark the OnPush view dirty, run CD. */
  const sync = () => {
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [SummaryStripComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(SummaryStripComponent);
    component = fixture.componentInstance;
  });

  it('renders one count per entry and marks only the hero', () => {
    component.badgeLabel = 'Session active';
    component.counts = [
      { label: 'payroll this month', value: '58.6L', hero: true },
      { label: 'locked', value: 28 }
    ];
    sync();

    const counts = fixture.nativeElement.querySelectorAll('.ls-count');
    expect(counts.length).toBe(2);
    expect((counts[0] as HTMLElement).classList).toContain('hero');
    expect((counts[1] as HTMLElement).classList).not.toContain('hero');
    expect(fixture.nativeElement.querySelector('.ls-badge').textContent).toContain('Session active');
  });
});
