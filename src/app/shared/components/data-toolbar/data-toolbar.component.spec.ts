import { ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { DataToolbarComponent, needReason, renderMenu } from './data-toolbar.component';
import { DdComponent } from '../dd/dd.component';
import { ToolbarFilter, ToolbarMenuItem } from 'src/app/shared/models/shared-components.model';

describe('DataToolbarComponent', () => {
  let fixture: ComponentFixture<DataToolbarComponent>;
  let component: DataToolbarComponent;

  const filters: ToolbarFilter[] = [
    { key: 'department', value: '', options: [{ value: '', label: 'All depts' }] },
    { key: 'designation', value: '', disabled: true, options: [{ value: '', label: 'All designations' }] },
    { key: 'section', value: '', existenceBased: true, hidden: true, options: [{ value: '', label: 'All sections' }] }
  ];

  /** What a real template binding does: ngOnChanges, mark the OnPush view dirty, run CD. */
  const sync = () => {
    component.ngOnChanges();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CommonModule, NoopAnimationsModule,
        MatDatepickerModule, MatNativeDateModule
      ],
      // app-dd is declared too: every select-like control in the toolbar IS that
      // component now, so a shallow render would assert nothing about them.
      declarations: [DataToolbarComponent, DdComponent]
    })
      // The component ships OnPush; these tests set @Input()s straight on the instance
      // (no host binding to mark the view dirty), so DOM assertions need Default here.
      .overrideComponent(DataToolbarComponent, {
        set: { changeDetection: ChangeDetectionStrategy.Default }
      })
      .compileComponents();
    fixture = TestBed.createComponent(DataToolbarComponent);
    component = fixture.componentInstance;
    component.filters = filters;
    sync();
  });

  it('emits search input as typed (pages debounce their own fetch)', () => {
    const emitted: string[] = [];
    component.searchChange.subscribe((value: string) => emitted.push(value));
    component.onSearchInput('pri');
    expect(emitted).toEqual(['pri']);
  });

  // --- Rule 21: Actions menu + needs ---------------------------------------------------
  const ITEMS: ToolbarMenuItem[] = [
    { key: 'delete', label: 'Bulk Delete', icon: 'trash', needs: ['sel'], danger: true },
    { key: 'marks', label: 'Bulk Enter Marks', needs: ['Term', 'sel'] },
    { key: 'import', label: 'Import' }
  ];
  const openMenu = () => {
    component.actions = ITEMS;
    sync();
    (fixture.nativeElement.querySelector('.tb-actions-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
  };
  const item = (key: string) => fixture.nativeElement.querySelector(`.tb-menu-item[data-key="${key}"]`) as HTMLElement;

  it('renders one "Actions" button, danger last after a separator, hint line shown', () => {
    openMenu();
    expect(fixture.nativeElement.querySelector('.tb-actions-btn').textContent.trim()).toBe('Actions');
    const keys = Array.from(fixture.nativeElement.querySelectorAll('.tb-menu-item')).map((el: any) => el.dataset.key);
    expect(keys).toEqual(['marks', 'import', 'delete']);
    expect(item('delete').previousElementSibling!.classList).toContain('tb-menu-sep');
    expect(item('delete').classList).toContain('danger');
    expect(fixture.nativeElement.querySelector('.tb-menu-hint').textContent).toContain('Some actions unlock');
  });

  it('needs: disabled with the reason until rows are ticked / the filter is chosen, live', () => {
    openMenu();
    expect(item('delete').getAttribute('aria-disabled')).toBe('true');
    expect(item('delete').querySelector('.tb-item-why')!.textContent).toBe('select rows');
    expect(item('delete').title).toBe('Select rows — Bulk Delete');
    expect(item('import').getAttribute('aria-disabled')).toBeNull();

    component.selectedCount = 3; sync();
    expect(item('delete').getAttribute('aria-disabled')).toBeNull();
    expect(item('delete').querySelector('.tb-item-label')!.textContent).toBe('Bulk Delete (3)');
    expect(item('marks').querySelector('.tb-item-why')!.textContent).toBe('choose a term');

    component.chosen = { Term: true }; sync();
    expect(item('marks').getAttribute('aria-disabled')).toBeNull();
  });

  it('a disabled item does not fire; an enabled one fires and closes the menu', () => {
    const fired: string[] = [];
    component.actionClick.subscribe((key: string) => fired.push(key));
    openMenu();
    item('delete').click();
    expect(fired).toEqual([]);
    item('import').click();
    fixture.detectChanges();
    expect(fired).toEqual(['import']);
    expect(fixture.nativeElement.querySelector('.tb-menu')).toBeNull();
  });

  it('keyboard: ArrowDown opens and focuses the first item, Escape closes', () => {
    component.actions = ITEMS; sync();
    const trigger = fixture.nativeElement.querySelector('.tb-actions-btn') as HTMLButtonElement;
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.tb-menu-item'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tb-menu')).toBeNull();
  });

  it('primary: right-most, tooltip carries the reason when disabled', () => {
    component.actions = ITEMS;
    component.primaryAction = { label: 'Apply Leave', disabled: true, why: 'finish the open action first' };
    sync();
    const buttons = fixture.nativeElement.querySelectorAll('.tb-buttons > *');
    expect(buttons[buttons.length - 1].classList).toContain('tb-primary');
    expect(buttons[buttons.length - 1].title).toBe('Finish the open action first — Apply Leave');
  });

  it('needReason / renderMenu name the need in plain words', () => {
    expect(needReason('sel')).toBe('select rows');
    expect(needReason('Class')).toBe('choose a class');
    expect(needReason('Exam')).toBe('choose an exam');
    expect(renderMenu([{ key: 'x', label: 'X', hidden: true }], 0, {})).toEqual([]);
  });

  it('renders a disabled mutual-dependency pill instead of hiding it', () => {
    const pills = fixture.nativeElement.querySelectorAll('app-dd');
    // department + designation render; the existence-based section filter does not.
    expect(pills.length).toBe(2);

    const designationPill = pills[1] as HTMLElement;
    expect(designationPill.classList).toContain('disabled');
    // The bug this guards against: a dependent pill hidden with display:none never came back.
    expect(designationPill.style.display).toBe('');
    expect(designationPill.querySelector('.dd-trigger')!.getAttribute('aria-disabled')).toBe('true');
  });

  /** design-system.md bans native selects — and a re-themed mat-select is not `.dd` either. */
  it('uses the .dd component, never a native select and never a mat-select', () => {
    expect(fixture.nativeElement.querySelector('app-dd .dd-trigger')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(fixture.nativeElement.querySelector('mat-select')).toBeNull();
  });

  it('emits the filter key and value on change', () => {
    const received: { key: string; value: string }[] = [];
    component.filterChange.subscribe((change: { key: string; value: string }) => received.push(change));
    component.onFilterChange('department', 'teaching');
    expect(received).toEqual([{ key: 'department', value: 'teaching' }]);
  });

  it('renders a month filter as a datepicker showing a month label, not a dropdown', () => {
    component.filters = [{ key: 'period', type: 'month', value: '2026-08' }];
    sync();

    const pill = fixture.nativeElement.querySelector('.sw-select-pill') as HTMLElement;
    // A date filter is the one control that is NOT an app-dd: `.dd` has no calendar.
    expect(pill.tagName.toLowerCase()).toBe('div');
    expect(pill.querySelector('.sw-pill-date-input')).not.toBeNull();
    // Parsed off the string, so August is August regardless of the runner's timezone.
    expect((pill.querySelector('.dd-label') as HTMLElement).textContent).toContain('Aug 2026');
  });

  it('emits YYYY-MM for a month pick and YYYY-MM-DD for a day pick', () => {
    const received: { key: string; value: string }[] = [];
    component.filterChange.subscribe((change: { key: string; value: string }) => received.push(change));

    component.filters = [{ key: 'period', type: 'month', value: '' }];
    sync();
    const monthView = component.views[0];
    const picker = jasmine.createSpyObj('MatDatepicker', ['close']);
    component.onMonthSelected(monthView, new Date(2026, 7, 1), picker);

    component.onDateSelected('day', new Date(2026, 7, 9));

    expect(received).toEqual([
      { key: 'period', value: '2026-08' },
      { key: 'day', value: '2026-08-09' }
    ]);
  });
});
