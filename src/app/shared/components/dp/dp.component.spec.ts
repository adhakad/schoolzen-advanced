import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DpComponent } from './dp.component';

/**
 * A dp with another field to move focus to. `spacer` > 0 pins the field that many px from
 * the viewport top (fixed, so whatever else Karma left in <body> can't shift it).
 */
@Component({
  template: `
    <div [style.position]="spacer ? 'fixed' : null" [style.top.px]="spacer || null" style="left: 0; width: 300px">
      <app-dp [value]="value" (closed)="closes = closes + 1"></app-dp>
    </div>
    <input class="outside" />`
})
class DpHostComponent {
  spacer = 0;
  value = '2013-03-12';
  closes = 0;
}

describe('DpComponent', () => {
  let fixture: ComponentFixture<DpComponent>;
  let component: DpComponent;
  const click = new MouseEvent('click');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [DpComponent, DpHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(DpComponent);
    component = fixture.componentInstance;
  });

  it('renders no native date input anywhere', () => {
    component.toggle(click);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="date"]')).toBeNull();
    expect(component.panel.nativeElement.querySelector('input[type="date"]')).toBeNull();
    expect(component.panel.nativeElement.querySelector('.dp-day')).toBeTruthy();
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
  it('reopens an empty picker on this month, not the month an abandoned open was left on', () => {
    const now = new Date();
    component.toggle(click);
    component.next(click);
    component.next(click);
    component.onEscape();
    component.toggle(click);
    expect(component.viewMonth).toBe(now.getMonth());
    expect(component.viewYear).toBe(now.getFullYear());
  });

  /** design-system.md, "Menu positioning and open/close behavior" — the same rule as .dd. */
  describe('panel positioning', () => {
    let hostFixture: ComponentFixture<DpHostComponent>;
    let host: DpHostComponent;

    beforeEach(() => {
      hostFixture = TestBed.createComponent(DpHostComponent);
      host = hostFixture.componentInstance;
      hostFixture.detectChanges();
    });

    const dp = (): DpComponent => hostFixture.debugElement.query(By.directive(DpComponent)).componentInstance;
    const panel = (): HTMLElement => dp().panel.nativeElement;
    const dpHost = (): HTMLElement => hostFixture.nativeElement.querySelector('app-dp');
    const trigger = (): HTMLElement => hostFixture.nativeElement.querySelector('.dp-trigger');
    const openIt = (): void => { trigger().click(); hostFixture.detectChanges(); };

    it('renders the open panel in <body> (never clipped by a modal), and puts it back on close', () => {
      expect(getComputedStyle(panel()).display).toBe('none');
      openIt();
      expect(panel().parentElement).toBe(document.body);
      expect(panel().classList).toContain('dp-portal');
      expect(getComputedStyle(panel()).position).toBe('fixed');
      expect(Number(getComputedStyle(panel()).zIndex)).toBeGreaterThan(70);

      trigger().click();
      hostFixture.detectChanges();
      expect(dpHost().contains(panel())).toBe(true);
      expect(panel().classList).not.toContain('dp-portal');
      expect(panel().querySelector('.dp-day')).toBeNull();
    });

    it('opens below the trigger when it fits', () => {
      openIt();
      expect(dp().flipped).toBe(false);
      expect(panel().getBoundingClientRect().top).toBeGreaterThanOrEqual(trigger().getBoundingClientRect().bottom);
    });

    it('flips upward when there is no room below, fully inside the viewport', () => {
      host.spacer = window.innerHeight - 60;
      hostFixture.detectChanges();
      openIt();
      const rect = panel().getBoundingClientRect();
      expect(dp().flipped).toBe(true);
      expect(rect.bottom).toBeLessThanOrEqual(trigger().getBoundingClientRect().top);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    });

    it('re-places a flipped panel when the year grid changes its height', () => {
      host.spacer = window.innerHeight - 60;
      hostFixture.detectChanges();
      openIt();
      (panel().querySelector('.dp-month-label') as HTMLElement).click();
      hostFixture.detectChanges();
      expect(dp().mode).toBe('years');
      const gap = trigger().getBoundingClientRect().top - panel().getBoundingClientRect().bottom;
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThan(20);
    });

    it('stays open through a scroll and a resize — it follows the trigger instead of closing', () => {
      openIt();
      document.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      hostFixture.detectChanges();
      expect(dpHost().classList).toContain('open');
      expect(host.closes).toBe(0);
    });

    it('a click inside the portaled panel, or on its nav, does not close it', () => {
      openIt();
      panel().click();
      (panel().querySelector('.dp-nav-btn') as HTMLElement).click();
      hostFixture.detectChanges();
      expect(dpHost().classList).toContain('open');
      expect(host.closes).toBe(0);
    });

    it('closes on an outside click and on Escape, emitting closed each time', () => {
      openIt();
      document.body.click();
      hostFixture.detectChanges();
      expect(dpHost().classList).not.toContain('open');
      openIt();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      hostFixture.detectChanges();
      expect(dpHost().classList).not.toContain('open');
      expect(host.closes).toBe(2);
      expect(panel().parentElement).not.toBe(document.body);
    });

    it('closes when focus moves to another field', () => {
      openIt();
      (hostFixture.nativeElement.querySelector('.outside') as HTMLElement).focus();
      hostFixture.detectChanges();
      expect(dpHost().classList).not.toContain('open');
      expect(host.closes).toBe(1);
    });

    it('picking a day closes it and returns the panel to the host', () => {
      openIt();
      (panel().querySelector('.dp-day:not(.outside)') as HTMLElement).click();
      hostFixture.detectChanges();
      expect(dp().open).toBe(false);
      expect(dpHost().contains(panel())).toBe(true);
    });

    it('leaves nothing in <body> when destroyed while open', () => {
      openIt();
      const open = panel();
      hostFixture.destroy();
      expect(document.body.contains(open)).toBe(false);
    });
  });
});
