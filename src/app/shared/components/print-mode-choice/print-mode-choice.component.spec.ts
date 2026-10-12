import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { PrintModeChoiceComponent } from './print-mode-choice.component';

describe('PrintModeChoiceComponent', () => {
  let fixture: ComponentFixture<PrintModeChoiceComponent>;
  let component: PrintModeChoiceComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CommonModule], declarations: [PrintModeChoiceComponent] }).compileComponents();
    fixture = TestBed.createComponent(PrintModeChoiceComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing until open', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.print-mode-option')).toBeNull();
  });

  it('offers the two illustrated layouts (not a dropdown) and emits the choice', () => {
    component.open = true;
    component.count = 2;
    component.noun = 'admit cards';
    fixture.detectChanges();
    const options = fixture.nativeElement.querySelectorAll('.print-mode-option');
    expect(options.length).toBe(2);
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(options[0].textContent).toContain('One Student in One Page');
    expect(options[1].textContent).toContain('Two Students in One Page');
    expect(fixture.nativeElement.textContent).toContain('2 selected admit cards');
    const chosen: number[] = [];
    component.chosen.subscribe((mode) => chosen.push(mode));
    (options[1] as HTMLButtonElement).click();
    (options[0] as HTMLButtonElement).click();
    expect(chosen).toEqual([2, 1]);
  });
});
