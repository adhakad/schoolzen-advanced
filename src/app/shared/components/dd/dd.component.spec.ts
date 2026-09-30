import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { By } from '@angular/platform-browser';
import { DdComponent } from './dd.component';
import { DdOption } from 'src/app/shared/models/shared-components.model';

@Component({
  template: `
    <div class="spacer" [style.height.px]="spacer"></div>
    <app-dd [options]="options" [value]="value" [disabled]="disabled"
            [disabledHint]="disabledHint" [placeholder]="placeholder" [invalid]="invalid" describedBy="err-x"
            (valueChange)="value = $event; changes = changes + 1" (closed)="closes = closes + 1"></app-dd>
    <button type="button" class="outside">outside</button>`
})
class HostComponent {
  options: DdOption[] = [
    { value: '', label: 'All classes' },
    { value: 'c9', label: '9th' },
    { value: 'c11', label: '11th' }
  ];
  value = '';
  disabled = false;
  disabledHint = '';
  placeholder = '— Select —';
  changes = 0;
  closes = 0;
  invalid = false;
  spacer = 0;
}

describe('DdComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [DdComponent, HostComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const query = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);
  // The menu element wherever it currently is — inside the host while closed, in <body>
  // while open (portaled).
  const dd = (): DdComponent => fixture.debugElement.query(By.directive(DdComponent)).componentInstance;
  const menu = (): HTMLElement => dd().menu.nativeElement;
  const options = (): HTMLElement[] => Array.from(menu().querySelectorAll('.dd-option'));
  const trigger = (): HTMLElement => query('.dd-trigger');
  const ddHost = (): HTMLElement => query('app-dd');

  /** design-system.md lists native selects under "Never do". */
  it('is never a native select', () => {
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(query('.dd-trigger')).not.toBeNull();
    expect(query('.dd-menu')).not.toBeNull();
  });

  it('wears the design system`s own classes so a hand-written .dd looks identical', () => {
    expect(ddHost().classList).toContain('dd');
    expect(ddHost().classList).toContain('sw-select-pill');
  });

  it('shows the selected option`s label, and the placeholder when nothing matches', () => {
    expect(query('.dd-label').textContent!.trim()).toBe('All classes');

    host.value = 'c11';
    fixture.detectChanges();
    expect(query('.dd-label').textContent!.trim()).toBe('11th');

    host.value = 'nope';
    fixture.detectChanges();
    expect(query('.dd-label').textContent!.trim()).toBe('— Select —');
  });

  it('opens on click and closes again on a second click', () => {
    trigger().click();
    fixture.detectChanges();
    expect(ddHost().classList).toContain('open');

    trigger().click();
    fixture.detectChanges();
    expect(ddHost().classList).not.toContain('open');
  });

  it('emits the chosen value and closes', () => {
    trigger().click();
    fixture.detectChanges();

    options()[2].click();
    fixture.detectChanges();

    expect(host.value).toBe('c11');
    expect(host.changes).toBe(1);
    expect(ddHost().classList).not.toContain('open');
  });

  /** '' is a real value — it is how "All classes" is selected, not "nothing chosen". */
  it('treats the empty value as a selectable option', () => {
    host.value = 'c9';
    fixture.detectChanges();

    trigger().click();
    fixture.detectChanges();
    options()[0].click();
    fixture.detectChanges();

    expect(host.value).toBe('');
  });

  it('does not re-emit when the already-selected option is picked', () => {
    trigger().click();
    fixture.detectChanges();
    options()[0].click();
    fixture.detectChanges();

    expect(host.changes).toBe(0);
  });

  it('marks the selected option so the menu shows where you are', () => {
    host.value = 'c9';
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();

    expect(options()[1].classList).toContain('selected');
    expect(options()[2].classList).not.toContain('selected');
  });

  it('closes when a click lands anywhere outside it', () => {
    trigger().click();
    fixture.detectChanges();
    expect(ddHost().classList).toContain('open');

    query('.outside').click();
    fixture.detectChanges();
    expect(ddHost().classList).not.toContain('open');
  });

  /**
   * A dependent control (Stream before a Class is picked) stays in the DOM and merely
   * greys out — a pill that disappears changes the toolbar's shape, which has been a real
   * bug. The hint is what tells the user why it is unusable.
   */
  it('stays rendered while disabled, showing its hint instead of a label', () => {
    host.disabled = true;
    host.disabledHint = 'Select a class first';
    fixture.detectChanges();

    expect(ddHost()).not.toBeNull();
    expect(ddHost().classList).toContain('disabled');
    expect(query('.dd-label').textContent!.trim()).toBe('Select a class first');
  });

  it('cannot be opened while disabled', () => {
    host.disabled = true;
    fixture.detectChanges();

    trigger().click();
    fixture.detectChanges();

    expect(ddHost().classList).not.toContain('open');
  });

  /**
   * The guard behind a real bug: the Subject Groups form options arrived without their
   * stream `_id`, so every option's value was undefined. `undefined === undefined` made the
   * first one look selected — the pill read "Science" while the parent's model held nothing,
   * and the save was rejected for having no stream. A valueless option must never match.
   */
  it('never treats a valueless option as the selected one', () => {
    host.options = [{ value: undefined as unknown as string, label: 'Science' }];
    host.value = undefined as unknown as string;
    fixture.detectChanges();

    expect(query('.dd-label').textContent!.trim()).toBe('— Select —');
    trigger().click();
    fixture.detectChanges();
    expect(options()[0].classList).not.toContain('selected');
  });

  // student-fix5.md #7: a closed dropdown renders no options — a form with ~25 of them no
  // longer builds every list on each modal open.
  it('renders its options only while open', () => {
    expect(options().length).toBe(0);
    trigger().click();
    fixture.detectChanges();
    expect(options().length).toBe(3);
    trigger().click();
    fixture.detectChanges();
    expect(options().length).toBe(0);
  });

  it('closes an open menu if it becomes disabled', () => {
    trigger().click();
    fixture.detectChanges();

    host.disabled = true;
    fixture.detectChanges();

    expect(ddHost().classList).not.toContain('open');
  });

  // design-system.md, Form validation state: a .dd has no native blur, so the form marks its
  // control touched from 'closed' — which must fire on EVERY close of an open menu.
  it('emits closed on pick, outside click and Escape — never while it was not open', () => {
    trigger().click();
    fixture.detectChanges();
    options()[1].click();
    fixture.detectChanges();
    expect(host.closes).toBe(1);

    trigger().click();
    fixture.detectChanges();
    query('.outside').click();
    fixture.detectChanges();
    expect(host.closes).toBe(2);

    trigger().click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(host.closes).toBe(3);

    query('.outside').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.closes).toBe(3);
  });

  // design-system.md, "Menu positioning and open/close behavior".
  describe('menu positioning', () => {
    it('renders the open menu in <body> (never clipped by a modal), and puts it back on close', () => {
      trigger().click();
      fixture.detectChanges();
      expect(menu().parentElement).toBe(document.body);
      expect(menu().classList).toContain('dd-portal');
      expect(getComputedStyle(menu()).position).toBe('fixed');

      trigger().click();
      fixture.detectChanges();
      expect(ddHost().contains(menu())).toBe(true);
      expect(menu().classList).not.toContain('dd-portal');
    });

    it('opens below the trigger when it fits', () => {
      trigger().click();
      fixture.detectChanges();
      expect(dd().flipped).toBe(false);
      expect(menu().getBoundingClientRect().top).toBeGreaterThanOrEqual(trigger().getBoundingClientRect().bottom);
    });

    it('flips upward when there is no room below', () => {
      host.spacer = window.innerHeight - 60;
      fixture.detectChanges();
      trigger().click();
      fixture.detectChanges();
      expect(dd().flipped).toBe(true);
      expect(menu().getBoundingClientRect().bottom).toBeLessThanOrEqual(trigger().getBoundingClientRect().top);
      expect(menu().getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    });

    it('stays open through a scroll — it follows the trigger instead of closing', () => {
      trigger().click();
      fixture.detectChanges();
      document.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      expect(ddHost().classList).toContain('open');
      expect(host.closes).toBe(0);
    });

    it('closes when focus moves to another field', () => {
      trigger().click();
      fixture.detectChanges();
      query('.outside').focus();
      fixture.detectChanges();
      expect(ddHost().classList).not.toContain('open');
      expect(host.closes).toBe(1);
    });

    it('a click inside the portaled menu (not on an option) does not close it', () => {
      trigger().click();
      fixture.detectChanges();
      menu().click();
      fixture.detectChanges();
      expect(ddHost().classList).toContain('open');
    });

    it('leaves nothing in <body> when destroyed while open', () => {
      trigger().click();
      fixture.detectChanges();
      const open = menu();
      fixture.destroy();
      expect(document.body.contains(open)).toBe(false);
    });
  });

  it('carries aria-invalid / aria-describedby for a field in error', () => {
    expect(trigger().getAttribute('aria-invalid')).toBeNull();
    host.invalid = true;
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-invalid')).toBe('true');
    expect(trigger().getAttribute('aria-describedby')).toBe('err-x');
  });
});
