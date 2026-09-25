import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusChipComponent } from './status-chip.component';
import { StatusVariant } from 'src/app/shared/models/shared-components.model';

describe('StatusChipComponent', () => {
  let fixture: ComponentFixture<StatusChipComponent>;
  let component: StatusChipComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [StatusChipComponent] }).compileComponents();
    fixture = TestBed.createComponent(StatusChipComponent);
    component = fixture.componentInstance;
  });

  /** Setting an @Input() on the instance skips ngOnChanges and OnPush marking — this does
   *  what a real template binding would do. */
  const applyInputs = () => {
    component.ngOnChanges();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  const variants: StatusVariant[] = [
    'draft', 'locked', 'pending', 'present', 'late', 'absent', 'halfday',
    'leave', 'holiday', 'approved', 'rejected', 'active', 'inactive', 'neutral'
  ];

  variants.forEach((variant) => {
    it('renders the ' + variant + ' variant class', () => {
      component.label = variant;
      component.variant = variant;
      applyInputs();
      const span: HTMLElement = fixture.nativeElement.querySelector('span');
      expect(span.classList).toContain('status-chip');
      expect(span.classList).toContain(variant);
      expect(span.textContent?.trim()).toBe(variant);
    });
  });

  it('falls back to neutral and warns on an unknown variant', () => {
    const warn = spyOn(console, 'warn');
    component.variant = 'not-a-variant' as StatusVariant;
    applyInputs();
    expect(fixture.nativeElement.querySelector('span').classList).toContain('neutral');
    expect(warn).toHaveBeenCalled();
  });
});
