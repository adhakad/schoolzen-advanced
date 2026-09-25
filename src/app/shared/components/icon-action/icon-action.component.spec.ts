import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconActionComponent } from './icon-action.component';
import { ConfirmModalComponent } from '../confirm-modal/confirm-modal.component';

describe('IconActionComponent', () => {
  let fixture: ComponentFixture<IconActionComponent>;
  let component: IconActionComponent;

  /** What a real template binding does: ngOnChanges, mark the OnPush view dirty, run CD. */
  const sync = () => {
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule],
      declarations: [IconActionComponent, ConfirmModalComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(IconActionComponent);
    component = fixture.componentInstance;
  });

  const click = () => (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

  it('emits immediately when no confirm is configured', () => {
    let emitted = 0;
    component.action.subscribe(() => emitted++);
    sync();
    click();
    expect(emitted).toBe(1);
    expect(component.confirmOpen).toBeFalse();
  });

  it('gates the click behind the confirm modal when confirm is set', () => {
    let emitted = 0;
    component.confirm = { title: 'Unlock?', message: 'Reopens the record.', confirmLabel: 'Unlock' };
    component.action.subscribe(() => emitted++);
    sync();

    click();
    expect(emitted).toBe(0);
    expect(component.confirmOpen).toBeTrue();

    component.onConfirmed();
    expect(emitted).toBe(1);
    expect(component.confirmOpen).toBeFalse();
  });

  it('never emits when cancelled or disabled', () => {
    let emitted = 0;
    component.confirm = { title: 'Unlock?', message: 'Reopens the record.', confirmLabel: 'Unlock' };
    component.action.subscribe(() => emitted++);
    sync();

    click();
    component.onCancelled();
    expect(emitted).toBe(0);

    component.disabled = true;
    component.onClick();
    expect(emitted).toBe(0);
  });

  it('maps each variant to its established class', () => {
    component.variant = 'neutral';
    expect(component.buttonClass).toBe('icon-btn');
    component.variant = 'primary';
    expect(component.buttonClass).toBe('icon-btn primary');
    component.variant = 'warning';
    expect(component.buttonClass).toBe('icon-btn danger');
  });
});
