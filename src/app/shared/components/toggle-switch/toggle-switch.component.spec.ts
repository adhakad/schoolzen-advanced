import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToggleSwitchComponent } from './toggle-switch.component';

describe('ToggleSwitchComponent', () => {
  let fixture: ComponentFixture<ToggleSwitchComponent>;
  let component: ToggleSwitchComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [ToggleSwitchComponent] }).compileComponents();
    fixture = TestBed.createComponent(ToggleSwitchComponent);
    component = fixture.componentInstance;
  });

  const knob = (): HTMLButtonElement => fixture.nativeElement.querySelector('.toggle-switch');

  /** Marks the COMPONENT's own view, which is what a real @Input() binding would dirty —
   *  fixture.changeDetectorRef is the host view and leaves an OnPush child clean. */
  const render = () => {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };

  it('renders the label and the switch role', () => {
    component.label = 'This class has streams (11th/12th)';
    render();
    expect(fixture.nativeElement.querySelector('.toggle-label').textContent.trim())
      .toBe('This class has streams (11th/12th)');
    expect(knob().getAttribute('role')).toBe('switch');
  });

  it('carries the .on class and aria-checked only when checked', () => {
    render();
    expect(knob().classList).not.toContain('on');
    expect(knob().getAttribute('aria-checked')).toBe('false');

    component.checked = true;
    render();
    expect(knob().classList).toContain('on');
    expect(knob().getAttribute('aria-checked')).toBe('true');
  });

  /** Controlled component: it emits the value the parent should move to and changes
   *  nothing itself, so the switch can never drift from the form it drives. */
  it('emits the NEW value without mutating its own state', () => {
    const emitted: boolean[] = [];
    component.checkedChange.subscribe((value) => emitted.push(value));
    render();

    knob().click();
    expect(emitted).toEqual([true]);
    expect(component.checked).toBe(false);
  });

  it('emits nothing while disabled', () => {
    const emitted: boolean[] = [];
    component.disabled = true;
    component.checkedChange.subscribe((value) => emitted.push(value));
    render();

    component.toggle();
    expect(emitted).toEqual([]);
    expect(knob().disabled).toBe(true);
  });
});
