import { ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { DateRangePickerComponent } from './date-range-picker.component';

describe('DateRangePickerComponent (popover — roster.html "Applies to")', () => {
  let fixture: ComponentFixture<DateRangePickerComponent>;
  let component: DateRangePickerComponent;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CommonModule], declarations: [DateRangePickerComponent] })
      .overrideComponent(DateRangePickerComponent, { set: { changeDetection: ChangeDetectionStrategy.Default } })
      .compileComponents();
    fixture = TestBed.createComponent(DateRangePickerComponent);
    component = fixture.componentInstance;
    component.popover = true;
    component.start = '2099-08-10';
    component.end = '2099-08-31';
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    host.remove();
  });

  const panel = (): HTMLElement | null => document.body.querySelector(':scope > .drp-panel.drp-portal');

  it('the calendar is hidden until the field is clicked', () => {
    expect(host.querySelector('.range-input-trigger')?.textContent).toContain('10 August 2099 – 31 August 2099');
    expect(host.querySelector('.range-cal-grid')).toBeNull();
    expect(panel()).toBeNull();
  });

  it('opens as an overlay directly below the field, and Done closes it', () => {
    (host.querySelector('.range-input-trigger') as HTMLElement).click();
    fixture.detectChanges();
    const open = panel();
    expect(open).not.toBeNull();
    const trigger = (host.querySelector('.range-input-trigger') as HTMLElement).getBoundingClientRect();
    const box = (open as HTMLElement).getBoundingClientRect();
    expect(Math.round(box.top)).toBe(Math.round(trigger.bottom + 8));
    (open?.querySelector('.drp-done') as HTMLElement).click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it('clicking inside the open calendar never closes it; Escape does', () => {
    (host.querySelector('.range-input-trigger') as HTMLElement).click();
    fixture.detectChanges();
    (panel()?.querySelector('.range-cal-nav:last-child') as HTMLElement).click();
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
    component.onEscape();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });
});
