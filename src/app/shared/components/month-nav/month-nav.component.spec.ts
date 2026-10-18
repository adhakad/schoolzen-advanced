import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MonthNavComponent } from './month-nav.component';

// The real tag inside a toolbar row, so the global stylesheet's app-month-nav rule applies.
@Component({ template: '<div class="row" [style.display]="display" style="width:1000px; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:8px"><app-month-nav month="2026-09"></app-month-nav></div>' })
class HostComponent { display = 'flex'; }

// Global rule 1 + 7: the month filter's calendar opens portaled to <body>, directly below the
// trigger; the filter is exactly one filter cell wide (--month-filter-w, global stylesheet)
// whatever its label; month names are 3 letters.
describe('MonthNavComponent', () => {
  let fixture: ComponentFixture<MonthNavComponent>;
  let component: MonthNavComponent;
  let row: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [MonthNavComponent] }).compileComponents();
    fixture = TestBed.createComponent(MonthNavComponent);
    component = fixture.componentInstance;
    component.month = '2026-09';
    // A 640px+ flex toolbar row, like Overview's / Roster's row 3.
    row = document.createElement('div');
    row.style.cssText = 'display:flex; width:1000px;';
    row.appendChild(fixture.nativeElement);
    document.body.appendChild(row);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    row.remove();
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

  it('3-letter month names in the label and the calendar title', () => {
    expect(fixture.nativeElement.querySelector('.dd-label').textContent.trim()).toBe('Sep 2026');
    expect(component.title).toBe('Sep 2026');
    component.month = '2026-05';
    expect(component.label).toBe('May 2026');
  });

  // One filter cell: (row − 40px) / 6 in a flex row; its own cell in a 6-column grid. Karma's
  // window may be under 640px, where the token is (row − 8px) / 2 — both are one cell.
  it('is exactly one filter cell of its row, flex or grid, whatever the label', async () => {
    await TestBed.resetTestingModule().configureTestingModule({ declarations: [MonthNavComponent, HostComponent] }).compileComponents();
    const host = TestBed.createComponent(HostComponent);
    document.body.appendChild(host.nativeElement);
    host.detectChanges();
    const width = () => (host.nativeElement.querySelector('.month-nav') as HTMLElement).getBoundingClientRect().width;
    const phone = window.matchMedia('(max-width: 640px)').matches;
    expect(width()).toBeCloseTo(phone ? (1000 - 8) / 2 : (1000 - 40) / 6, 0);
    host.componentInstance.display = 'grid';
    host.detectChanges();
    expect(width()).toBeCloseTo((1000 - 5 * 8) / 6, 0);
    host.destroy();
    host.nativeElement.remove();
  });

  it('Holidays mode: empty label, marked days only, Show all clears the filter', () => {
    component.month = '';
    component.today = '2026-10';
    component.emptyLabel = 'Holiday Calendar';
    component.marks = [{ startDate: '2026-10-20', endDate: '2026-10-21', name: 'Diwali' }];
    expect(component.label).toBe('Holiday Calendar');
    expect(component.title).toBe('Oct 2026');
    const marked = component.days.filter((cell) => cell.cls.includes('in-range'));
    expect(marked.map((cell) => cell.day)).toEqual([20, 21]);
    expect(marked[0].names).toBe('Diwali');
    let emitted: string | undefined;
    component.monthChange.subscribe((value) => (emitted = value));
    component.showAll();
    expect(emitted).toBe('');
  });
});

