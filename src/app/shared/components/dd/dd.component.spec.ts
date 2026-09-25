import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { DdComponent } from './dd.component';
import { DdOption } from 'src/app/shared/models/shared-components.model';

@Component({
  template: `
    <app-dd [options]="options" [value]="value" [disabled]="disabled"
            [disabledHint]="disabledHint" [placeholder]="placeholder"
            (valueChange)="value = $event; changes = changes + 1"></app-dd>
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
  const options = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.dd-option'));
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
    expect(options()[0].classList).not.toContain('selected');
  });

  it('closes an open menu if it becomes disabled', () => {
    trigger().click();
    fixture.detectChanges();

    host.disabled = true;
    fixture.detectChanges();

    expect(ddHost().classList).not.toContain('open');
  });
});
