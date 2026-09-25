import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormModalComponent } from './form-modal.component';

@Component({
  template: `
    <app-form-modal [open]="open" title="Add Class" submitLabel="Submit"
                    [submitDisabled]="disabled"
                    (submitted)="submits = submits + 1" (cancelled)="cancels = cancels + 1">
      <div class="projected-field">Class Name</div>
    </app-form-modal>`
})
class HostComponent {
  open = false;
  disabled = false;
  submits = 0;
  cancels = 0;
}

describe('FormModalComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FormModalComponent, HostComponent],
      imports: [CommonModule]
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const query = (selector: string): HTMLElement =>
    fixture.nativeElement.querySelector(selector);

  /** A page with a table full of Edit buttons must not carry a hidden copy of the form. */
  it('renders nothing at all while closed', () => {
    expect(query('.sz-modal-overlay')).toBeNull();
    expect(query('.projected-field')).toBeNull();
  });

  it('projects the form body and shows the title and labels once open', () => {
    host.open = true;
    fixture.detectChanges();

    expect(query('.modal-title').textContent!.trim()).toBe('Add Class');
    expect(query('.projected-field').textContent!.trim()).toBe('Class Name');
    expect(query('.btn-plain').textContent!.trim()).toBe('Cancel');
    expect(query('.btn-brand').textContent!.trim()).toBe('Submit');
  });

  /** 460px, not the confirm dialog's 420px — a field stack needs the extra room. The
      read-only Details modal overrides it to the reference's 420px. */
  it('uses the wider form shell, and takes a narrower width when asked', () => {
    host.open = true;
    fixture.detectChanges();
    expect((query('.modal-box') as HTMLElement).style.width).toBe('460px');
  });

  it('emits submitted, and cancelled from the close button, the ghost button and the backdrop', () => {
    host.open = true;
    fixture.detectChanges();

    query('.btn-brand').click();
    expect(host.submits).toBe(1);

    query('.modal-close').click();
    query('.btn-plain').click();
    query('.sz-modal-overlay').click();
    expect(host.cancels).toBe(3);
  });

  it('does not submit while disabled, and a click inside the box is not a cancel', () => {
    host.open = true;
    host.disabled = true;
    fixture.detectChanges();

    expect((query('.btn-brand') as HTMLButtonElement).disabled).toBe(true);
    query('.btn-brand').click();
    expect(host.submits).toBe(0);

    query('.modal-box').click();
    expect(host.cancels).toBe(0);
  });
});
