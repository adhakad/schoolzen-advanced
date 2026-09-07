import { ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmModalComponent } from './confirm-modal.component';

describe('ConfirmModalComponent', () => {
  let fixture: ComponentFixture<ConfirmModalComponent>;
  let component: ConfirmModalComponent;

  /** What a real template binding does: ngOnChanges, mark the OnPush view dirty, run CD. */
  const sync = () => {
    component.ngOnChanges();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule],
      declarations: [ConfirmModalComponent]
    })
      // The component ships OnPush; these tests set @Input()s straight on the instance
      // (no host binding to mark the view dirty), so DOM assertions need Default here.
      .overrideComponent(ConfirmModalComponent, { set: { changeDetection: ChangeDetectionStrategy.Default } })
      .compileComponents();
    fixture = TestBed.createComponent(ConfirmModalComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing until it is opened', () => {
    sync();
    expect(fixture.nativeElement.querySelector('.sw-modal')).toBeNull();

    component.open = true;
    component.config = { title: 'Unlock?', message: 'Reopens it.', confirmLabel: 'Unlock' };
    sync();
    expect(fixture.nativeElement.querySelector('.sw-modal')).not.toBeNull();
  });

  it('keeps confirm disabled until the exact word is typed', () => {
    component.open = true;
    component.config = {
      title: 'Clear assignments?', message: 'Removes the shifts.',
      confirmLabel: 'Delete', typeToConfirm: 'DELETE'
    };
    sync();

    expect(component.confirmDisabled).toBeTrue();
    component.typed = 'delete';
    expect(component.confirmDisabled).toBeTrue();
    component.typed = 'DELETE';
    expect(component.confirmDisabled).toBeFalse();
  });

  it('does not emit confirmed while the type-to-confirm word is wrong', () => {
    let confirmed = 0;
    component.confirmed.subscribe(() => confirmed++);
    component.open = true;
    component.config = { title: 't', message: 'm', confirmLabel: 'Delete', typeToConfirm: 'DELETE' };
    sync();

    component.onConfirm();
    expect(confirmed).toBe(0);

    component.typed = 'DELETE';
    component.onConfirm();
    expect(confirmed).toBe(1);
  });
});
