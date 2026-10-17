import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MonthNavComponent } from './month-nav.component';

// Global rule 1 + 7: the month filter's calendar opens portaled to <body>, directly below the
// trigger, and the filter has the ONE shared width token (--month-filter-w).
describe('MonthNavComponent', () => {
  let fixture: ComponentFixture<MonthNavComponent>;
  let component: MonthNavComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [MonthNavComponent] }).compileComponents();
    fixture = TestBed.createComponent(MonthNavComponent);
    component = fixture.componentInstance;
    component.month = '2026-09';
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('opens the calendar as a body overlay just below the trigger, and closes back into place', () => {
    const trigger: HTMLElement = fixture.nativeElement.querySelector('.month-nav');
    trigger.click();
    const menu = component.menu.nativeElement;
    expect(menu.parentElement).toBe(document.body);
    expect(menu.classList).toContain('dd-portal');
    const gap = menu.getBoundingClientRect().top - trigger.getBoundingClientRect().bottom;
    expect(Math.round(gap)).toBe(8);
    document.body.click();
    expect(menu.parentElement).not.toBe(document.body);
    expect(component.open).toBeFalse();
  });

  it('uses the shared --month-filter-w width (178px fallback), whatever the label', () => {
    const trigger: HTMLElement = fixture.nativeElement.querySelector('.month-nav');
    expect(trigger.getBoundingClientRect().width).toBe(178);
    expect(fixture.nativeElement.querySelector('.dd-label').textContent).toContain('September 2026');
  });
});
