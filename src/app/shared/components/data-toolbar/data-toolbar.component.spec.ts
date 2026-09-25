import { ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { DataToolbarComponent } from './data-toolbar.component';
import { DdComponent } from '../dd/dd.component';
import { ToolbarFilter } from 'src/app/shared/models/shared-components.model';

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

  it('debounces search input', fakeAsync(() => {
    const emitted: string[] = [];
    component.searchChange.subscribe((value: string) => emitted.push(value));

    component.onSearchInput('p');
    component.onSearchInput('pr');
    component.onSearchInput('pri');
    tick(250);

    expect(emitted).toEqual(['pri']);
  }));

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
    expect((pill.querySelector('.dd-label') as HTMLElement).textContent).toContain('August 2026');
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
