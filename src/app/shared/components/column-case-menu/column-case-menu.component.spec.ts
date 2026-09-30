import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ColumnCaseMenuComponent } from './column-case-menu.component';
import { TextCase } from 'src/app/shared/utils/text-case.util';

describe('ColumnCaseMenuComponent', () => {
  let fixture: ComponentFixture<ColumnCaseMenuComponent>;
  let component: ColumnCaseMenuComponent;
  const el = (): HTMLElement => fixture.nativeElement;
  const options = (): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>('.dd-option'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [ColumnCaseMenuComponent] }).compileComponents();
    fixture = TestBed.createComponent(ColumnCaseMenuComponent);
    component = fixture.componentInstance;
    component.columnLabel = 'Father';
    fixture.detectChanges();
  });

  const openMenu = (): void => {
    el().querySelector<HTMLButtonElement>('.case-trigger')!.click();
    fixture.detectChanges();
  };

  it('opens a menu of the three cases plus "Apply to all fields", Title Case selected', () => {
    expect(el().querySelector('.case-menu')).toBeNull();
    openMenu();
    expect(options().map((option) => option.textContent!.trim())).toEqual(
      ['Title Case', 'UPPERCASE', 'lowercase', 'Apply to all fieldsTitle Case']
    );
    expect(options()[0].classList).toContain('selected');
  });

  it('emits the picked case and stays open, so it can then be applied to all', () => {
    const picked: TextCase[] = [];
    const applied: TextCase[] = [];
    component.valueChange.subscribe((mode) => picked.push(mode));
    component.applyAll.subscribe((mode) => applied.push(mode));
    openMenu();

    options()[1].click();
    fixture.detectChanges();
    expect(picked).toEqual(['upper']);
    expect(el().querySelector('.case-menu')).not.toBeNull();

    options()[3].click();
    fixture.detectChanges();
    expect(applied).toEqual(['upper']);
    expect(el().querySelector('.case-menu')).toBeNull();
  });

  it('closes on an outside click and on Escape', () => {
    openMenu();
    document.body.click();
    fixture.detectChanges();
    expect(el().querySelector('.case-menu')).toBeNull();

    openMenu();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el().querySelector('.case-menu')).toBeNull();
  });

  // design-system.md: a menu never closes on its own — a scroll only moves it.
  it('stays open when the table scrolls under it, following its trigger', () => {
    openMenu();
    const scroller = document.createElement('div');
    document.body.appendChild(scroller);
    scroller.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(el().querySelector('.case-menu')).not.toBeNull();
    scroller.remove();
  });

  it('closes when focus moves to another control', () => {
    openMenu();
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    fixture.detectChanges();
    expect(el().querySelector('.case-menu')).toBeNull();
    other.remove();
  });

  it('without "Apply to all fields", a pick is the resolution and closes it', () => {
    component.showApplyAll = false;
    openMenu();
    expect(el().querySelector('.apply-all')).toBeNull();
    options()[2].click();
    fixture.detectChanges();
    expect(component.value).toBe('lower');
    expect(el().querySelector('.case-menu')).toBeNull();
  });

  it('never lets its click reach the header (which sorts)', () => {
    const header = jasmine.createSpy('header click');
    el().addEventListener('click', header);
    openMenu();
    expect(header).not.toHaveBeenCalled();
  });
});
