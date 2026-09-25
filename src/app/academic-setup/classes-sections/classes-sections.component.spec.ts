import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ClassSuffixPipe } from 'src/app/pipes/class-suffix.pipe';
import { StreamTitleCasePipe } from 'src/app/pipes/stream-title-case.pipe';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ApiError } from 'src/app/shared/models/api-error.model';
import { ClassesSectionsService } from 'src/app/shared/services/academic-setup/classes-sections.service';
import { AcademicClass } from 'src/app/shared/models/academic-setup/class.model';
import { ClassesSectionsComponent } from './classes-sections.component';

const classDoc = (over: Partial<AcademicClass>): AcademicClass => ({
  _id: 'c1',
  adminId: 'a1',
  class: 6,
  hasStreams: false,
  sections: [],
  streams: [],
  studentCount: 0,
  ...over
});

describe('ClassesSectionsComponent', () => {
  let fixture: ComponentFixture<ClassesSectionsComponent>;
  let component: ClassesSectionsComponent;
  let api: jasmine.SpyObj<ClassesSectionsService>;
  /** Stands in for the shell header: whatever session it holds is what the page fetches. */
  let context$: BehaviorSubject<{ activeSession: string }>;

  const CLASSES: AcademicClass[] = [
    classDoc({ _id: 'c6', class: 6, sections: [{ name: 'A' }, { name: 'B' }], studentCount: 72 }),
    // No sections and no students: the class a delete strands nobody over.
    classDoc({ _id: 'c7', class: 7, studentCount: 0 }),
    classDoc({
      _id: 'c11',
      class: 11,
      hasStreams: true,
      streams: [
        { name: 'science', sections: [{ name: 'A' }], studentCount: 60 },
        { name: 'commerce', sections: [], studentCount: 38 }
      ],
      studentCount: 98
    })
  ];

  beforeEach(async () => {
    context$ = new BehaviorSubject<{ activeSession: string }>({ activeSession: '2026-27' });

    api = jasmine.createSpyObj<ClassesSectionsService>('ClassesSectionsService', [
      'getClasses', 'getClassNameOptions', 'createClass', 'updateClass', 'deleteClass', 'bulkDelete'
    ]);
    api.getClasses.and.returnValue(of(CLASSES));
    api.getClassNameOptions.and.returnValue(of([{ class: 8, label: '8th' }]));
    api.createClass.and.returnValue(of('ok'));
    api.updateClass.and.returnValue(of('ok'));
    api.deleteClass.and.returnValue(of('ok'));
    api.bulkDelete.and.returnValue(of('ok'));

    await TestBed.configureTestingModule({
      declarations: [ClassesSectionsComponent],
      providers: [
        ClassSuffixPipe,
        StreamTitleCasePipe,
        { provide: ClassesSectionsService, useValue: api },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: ShellContextService, useValue: { context: context$.asObservable() } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ClassesSectionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const row = (id: string) => component.rows.find((candidate) => candidate._id === id)!;

  // --- list ---------------------------------------------------------------------------

  it('loads the school`s classes on init, scoped to the header`s session', () => {
    expect(api.getClasses).toHaveBeenCalledWith('a1', '2026-27');
    expect(component.rows.length).toBe(3);
    expect(component.loading).toBe(false);
  });

  /**
   * The structure is session-independent; the Students counts beside it are not. Switching
   * the header's selector has to actually refetch, not sit inert.
   */
  it('refetches when the header switches session, and not when anything else changes', () => {
    api.getClasses.calls.reset();

    context$.next({ activeSession: '2025-26' });
    expect(api.getClasses).toHaveBeenCalledWith('a1', '2025-26');

    // A context emission that leaves the session alone (school details landing, say).
    api.getClasses.calls.reset();
    context$.next({ activeSession: '2025-26' });
    expect(api.getClasses).not.toHaveBeenCalled();
  });

  /** A count, never the names inline — two streams and ten must render the same width. */
  it('builds the streams cell as a count tag only for a class that has streams', () => {
    expect(row('c11').showStreamTag).toBe(true);
    expect(row('c11').streamTagLabel).toBe('2 streams');
    expect(row('c6').showStreamTag).toBe(false);
  });

  it('pluralises the tag label off the count', () => {
    api.getClasses.and.returnValue(of([classDoc({ _id: 'x', class: 9, sections: [{ name: 'A' }] })]));
    context$.next({ activeSession: '2024-25' });
    expect(row('x').sectionTagLabel).toBe('1 section');
  });

  /**
   * A streamed class keeps its sections per stream, so the cell says where to look rather
   * than showing a count that would mean nothing at this level.
   */
  it('says "Set per stream" for a streamed class and counts sections for a flat one', () => {
    expect(row('c11').sectionTagLabel).toBe('Set per stream');
    expect(row('c11').sectionTagMuted).toBe(true);
    expect(row('c6').sectionTagLabel).toBe('2 sections');
    expect(row('c6').sectionTagMuted).toBe(false);
  });

  /** The reference renders the numeral and its ordinal suffix as two spans. */
  it('splits a class label into its numeral and suffix', () => {
    expect(row('c11').classNum).toBe('11');
    expect(row('c11').classSuffix).toBe('th');

    api.getClasses.and.returnValue(of([classDoc({ _id: 'n', class: 200 })]));
    context$.next({ activeSession: '2024-25' });
    // Nursery has no numeral to split off, so it falls through as a whole word.
    expect(row('n').classNum).toBe('Nursery');
    expect(row('n').classSuffix).toBe('');
  });

  it('filters client-side across class, stream and section names', () => {
    component.onSearchChange('commerce');
    expect(component.rows.map((candidate) => candidate._id)).toEqual(['c11']);

    component.onSearchChange('');
    expect(component.rows.length).toBe(3);
  });

  it('totals the side card from every class, counting sections under streams too', () => {
    // c6 has 2 sections, c11's two streams hold 1 between them.
    expect(component.stats).toEqual({ classes: 3, sections: 3, streams: 2, students: 170 });
  });

  // --- selection ----------------------------------------------------------------------

  it('arms Delete Selected only once something is checked', () => {
    expect(component.selectedCount).toBe(0);

    component.toggleRow('c6');
    expect(component.isSelected('c6')).toBe(true);
    expect(component.selectedCount).toBe(1);

    component.toggleRow('c6');
    expect(component.selectedCount).toBe(0);
  });

  it('select-all covers the visible rows and toggles back off', () => {
    component.toggleAll();
    expect(component.allSelected).toBe(true);
    expect(component.selectedCount).toBe(3);

    component.toggleAll();
    expect(component.selectedCount).toBe(0);
  });

  it('drops a selected id once its class is gone, so Delete Selected cannot re-fire', () => {
    component.toggleRow('c7');
    api.getClasses.and.returnValue(of(CLASSES.filter((item) => item._id !== 'c7')));

    context$.next({ activeSession: '2024-25' });

    expect(component.selectedCount).toBe(0);
  });

  // --- details modal --------------------------------------------------------------------

  it('opens the details modal with one group per stream', () => {
    component.showDetails(row('c11'));

    expect(component.detailsOpen).toBe(true);
    expect(component.detailsTitle).toBe('Streams & Sections — 11th');
    expect(component.detailsGroups).toEqual([
      { name: 'Science', sections: ['A'] },
      // A stream with no sections is a real, valid state.
      { name: 'Commerce', sections: [] }
    ]);
    expect(component.detailsSections).toEqual([]);
  });

  it('opens the details modal as a flat chip list for a class with no streams', () => {
    component.showDetails(row('c6'));

    expect(component.detailsTitle).toBe('Sections — 6th');
    expect(component.detailsGroups).toEqual([]);
    expect(component.detailsSections).toEqual(['A', 'B']);
  });

  // --- form ---------------------------------------------------------------------------

  it('clears the other half of the form whenever the streams toggle moves', () => {
    component.onAddClass();
    component.addSection();
    component.updateSection(0, 'A');

    component.onStreamsToggled(true);
    expect(component.form.sections).toEqual([]);

    component.addStream();
    component.updateStreamName(0, 'Science');
    component.onStreamsToggled(false);
    expect(component.form.streams).toEqual([]);
  });

  it('adds, edits and removes a section row without touching its neighbours', () => {
    component.onAddClass();
    component.addSection();
    component.addSection();
    component.updateSection(0, 'A');
    component.updateSection(1, 'B');

    component.removeSection(0);
    expect(component.form.sections).toEqual(['B']);
  });

  it('keeps each stream`s sections attached to it through add, rename and remove', () => {
    component.onAddClass();
    component.onStreamsToggled(true);
    component.addStream();
    component.updateStreamName(0, 'Science');
    component.addStreamSection(0);
    component.updateStreamSection(0, 0, 'A');

    component.addStream();
    component.updateStreamName(1, 'Commerce');
    component.addStreamSection(1);
    component.updateStreamSection(1, 0, 'C');

    // Renaming the first stream must not disturb the second one's sections.
    component.updateStreamName(0, 'Sciences');
    expect(component.form.streams[0].sections).toEqual(['A']);
    expect(component.form.streams[1].sections).toEqual(['C']);

    component.removeStreamSection(0, 0);
    expect(component.form.streams[0].sections).toEqual([]);
    expect(component.form.streams[1].sections).toEqual(['C']);
  });

  it('offers the class dropdown as strings and restores the number on selection', () => {
    component.onAddClass();

    expect(component.classDdOptions).toEqual([{ value: '8', label: '8th' }]);
    expect(component.classValue).toBe('');

    component.onClassSelected('8');
    expect(component.form.class).toBe(8);
    expect(component.classValue).toBe('8');
  });

  it('keeps Submit disabled until a class is chosen', () => {
    component.onAddClass();
    expect(component.submitDisabled).toBe(true);

    component.onClassSelected('8');
    expect(component.submitDisabled).toBe(false);
  });

  it('sends the class number on create and never on update', () => {
    component.onAddClass();
    component.onClassSelected('8');
    component.addSection();
    component.updateSection(0, 'A');
    component.onFormSubmit();

    expect(api.createClass).toHaveBeenCalledWith(jasmine.objectContaining({
      adminId: 'a1', class: 8, hasStreams: false, sections: [{ name: 'A' }]
    }));

    component.onEditClass(row('c6'));
    component.onFormSubmit();

    const [, payload] = api.updateClass.calls.mostRecent().args;
    expect('class' in (payload as object)).toBe(false);
  });

  it('demands a typed confirmation before a save strands a stream`s students', () => {
    component.onEditClass(row('c11'));
    component.removeStream(1); // Commerce, 38 students
    component.onFormSubmit();

    expect(api.updateClass).not.toHaveBeenCalled();
    expect(component.confirmOpen).toBe(true);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.scopeNote).toContain('38 students');

    component.onConfirmed();
    expect(api.updateClass).toHaveBeenCalled();
  });

  it('saves straight away when nothing is stranded', () => {
    component.onEditClass(row('c11'));
    component.addStreamSection(0);
    component.updateStreamSection(0, 1, 'B');
    component.onFormSubmit();

    expect(component.confirmOpen).toBe(false);
    expect(api.updateClass).toHaveBeenCalled();
  });

  /**
   * ErrorInterceptor rethrows the SHAPED ApiError, not the HttpErrorResponse it arrived in.
   * Reading error.error here once found nothing, so a rejected save bound no message and
   * left the modal looking like Submit had done nothing.
   */
  it('binds a ValidationError`s fields as the interceptor actually rethrows them', () => {
    const apiError: ApiError = {
      category: 'ValidationError',
      message: 'Please fix the highlighted fields',
      fields: [{ field: 'sections', message: 'Two sections have the same name' }],
      requestId: 'r1'
    };
    api.createClass.and.returnValue(throwError(() => apiError));

    component.onAddClass();
    component.onClassSelected('8');
    component.onFormSubmit();

    expect(component.fieldErrors['sections']).toBe('Two sections have the same name');
    expect(component.formOpen).toBe(true);
    expect(component.saving).toBe(false);
  });

  it('shows a form-level message when the rejected field is not one the modal renders', () => {
    api.createClass.and.returnValue(throwError(() => ({
      category: 'ValidationError',
      message: 'Please fix the highlighted fields',
      fields: [{ field: 'form', message: 'Something about the whole form' }],
      requestId: 'r2'
    } as ApiError)));

    component.onAddClass();
    component.onClassSelected('8');
    component.onFormSubmit();

    expect(component.formError).toBe('Something about the whole form');
  });

  // --- delete -------------------------------------------------------------------------

  /**
   * classes-sections.md calls type-to-confirm "the pattern for any destructive action in
   * this app" — so a row delete and a bulk delete both demand it, empty class or not.
   */
  it('always demands DELETE typed, and names the real student count when there is one', () => {
    component.onDeleteClass(row('c7'));
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.scopeNote).toBeUndefined();

    component.onDeleteClass(row('c6'));
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.scopeNote).toContain('72 students');
  });

  it('sends a whole selection as ONE bulk request, not a call per row', () => {
    component.toggleRow('c6');
    component.toggleRow('c7');
    component.onDeleteSelected();

    expect(component.confirmConfig.title).toBe('Delete 2 classes?');
    // Both classes' students are counted together, not reported per row.
    expect(component.confirmConfig.scopeNote).toContain('72 students');

    component.onConfirmed();

    expect(api.bulkDelete).toHaveBeenCalledTimes(1);
    expect(api.bulkDelete).toHaveBeenCalledWith('a1', ['c6', 'c7'], true);
  });

  it('deletes only once confirmed, and not at all when cancelled', () => {
    component.onDeleteClass(row('c6'));
    expect(api.bulkDelete).not.toHaveBeenCalled();

    component.onConfirmCancelled();
    expect(api.bulkDelete).not.toHaveBeenCalled();
    expect(component.confirmOpen).toBe(false);

    component.onDeleteClass(row('c6'));
    component.onConfirmed();
    expect(api.bulkDelete).toHaveBeenCalledWith('a1', ['c6'], true);
  });

  it('clears a deleted id from the selection so Delete Selected disarms', () => {
    component.toggleRow('c6');
    component.onDeleteSelected();
    component.onConfirmed();

    expect(component.selectedCount).toBe(0);
  });

  // --- paging -------------------------------------------------------------------------

  it('pages client-side and never strands the view past the last page', () => {
    component.onLimitChange(2);
    expect(component.rows.length).toBe(2);
    expect(component.total).toBe(3);

    component.onPageChange(2);
    expect(component.rows.length).toBe(1);

    // Filtering down to one page must pull the view back with it.
    component.onSearchChange('commerce');
    expect(component.page).toBe(1);
    expect(component.rows.length).toBe(1);
  });

  // --- rendered DOM -------------------------------------------------------------------
  //
  // The reference is a real <table> with Bootstrap Icons and the `.tag` chip — not a flex
  // grid, not Tabler, not a native select. These assertions are what stops the page drifting
  // back to a stand-in.

  it('renders the reference`s table, not a flex-row stand-in', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('table thead th.check-col')).toBeTruthy();
    expect(host.querySelectorAll('table tbody tr').length).toBe(3);
    expect(host.querySelector('.class-cell .class-num')).toBeTruthy();
    expect(host.querySelector('.pagination-bar, app-pagination-bar')).toBeTruthy();
  });

  it('renders the side column`s stats and tips cards', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('.col-side .stats-card')).toBeTruthy();
    expect(host.querySelectorAll('.col-side .stat-row').length).toBe(4);
    expect(host.querySelectorAll('.col-side .status-card .tip-item').length).toBe(3);
  });

  it('uses Bootstrap Icons only — never Tabler, never inline SVG', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelectorAll('i.bi').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('[class*="ti-"]').length).toBe(0);
    expect(host.querySelectorAll('svg').length).toBe(0);
  });

  it('has no native select anywhere on the page', () => {
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('select').length).toBe(0);
  });

  it('renders the streams cell as a clickable tag that opens the details modal', () => {
    const host: HTMLElement = fixture.nativeElement;
    const tag = host.querySelector('tbody tr:nth-child(3) .tag.clickable') as HTMLButtonElement;

    expect(tag).toBeTruthy();
    expect(tag.textContent!.trim()).toBe('2 streams');

    tag.click();
    expect(component.detailsOpen).toBe(true);
  });

  it('shows the absence text rather than an empty cell', () => {
    const host: HTMLElement = fixture.nativeElement;
    const cell = host.querySelector('tbody tr:nth-child(1) .na');

    expect(cell!.textContent!.trim()).toBe('— not applicable');
  });
});
