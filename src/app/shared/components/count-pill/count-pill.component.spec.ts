import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { CountPillComponent } from './count-pill.component';
import { CountPillVariant } from 'src/app/shared/models/shared-components.model';

describe('CountPillComponent', () => {
  let fixture: ComponentFixture<CountPillComponent>;
  let component: CountPillComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CountPillComponent],
      imports: [CommonModule]
    }).compileComponents();
    fixture = TestBed.createComponent(CountPillComponent);
    component = fixture.componentInstance;
  });

  /** Setting an @Input() on the instance skips ngOnChanges and OnPush marking — this does
   *  what a real template binding would do. The ref has to come from the debug element:
   *  fixture.changeDetectorRef is the HOST view, and marking that leaves an OnPush
   *  component view clean, so a second render in one test would silently not happen. */
  const applyInputs = () => {
    component.ngOnChanges();
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };

  const pill = (): HTMLElement => fixture.nativeElement.querySelector('.count-pill');

  it('pluralises the noun', () => {
    component.count = 2;
    component.noun = 'stream';
    applyInputs();
    expect(pill().textContent).toContain('2 streams');
  });

  it('keeps the noun singular at one', () => {
    component.count = 1;
    component.noun = 'section';
    applyInputs();
    expect(pill().textContent).toContain('1 section');
  });

  it('wears the purple .sec class only for the section variant', () => {
    component.variant = 'section';
    applyInputs();
    expect(pill().classList).toContain('sec');

    component.variant = 'stream';
    applyInputs();
    expect(pill().classList).not.toContain('sec');
  });

  it('falls back to the stream variant and warns on an unknown one', () => {
    const warn = spyOn(console, 'warn');
    component.variant = 'colour' as CountPillVariant;
    applyInputs();
    expect(component.variantClass).toBe('stream');
    expect(warn).toHaveBeenCalled();
  });

  it('reveals the names only once clicked', () => {
    component.count = 2;
    component.noun = 'stream';
    component.items = ['Science', 'Commerce'];
    applyInputs();
    expect(fixture.nativeElement.querySelector('.count-pop')).toBeNull();

    pill().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.count-pop').textContent.trim())
      .toBe('Science, Commerce');
  });

  it('closes on an outside click and on Escape', () => {
    component.items = ['A'];
    applyInputs();

    pill().click();
    fixture.detectChanges();
    expect(component.open).toBe(true);

    component.onDocumentClick({ target: document.body } as unknown as MouseEvent);
    expect(component.open).toBe(false);

    pill().click();
    fixture.detectChanges();
    component.onEscape();
    expect(component.open).toBe(false);
  });

  it('stays open when the click landed inside the pill itself', () => {
    applyInputs();
    pill().click();
    fixture.detectChanges();

    component.onDocumentClick({ target: pill() } as unknown as MouseEvent);
    expect(component.open).toBe(true);
  });
});
