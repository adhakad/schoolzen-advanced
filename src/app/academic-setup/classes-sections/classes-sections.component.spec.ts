import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ClassSuffixPipe } from 'src/app/pipes/class-suffix.pipe';
import { StreamTitleCasePipe } from 'src/app/pipes/stream-title-case.pipe';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ApiError } from 'src/app/shared/models/api-error.model';
import { ClassesSectionsService } from 'src/app/shared/services/academic-setup/classes-sections.service';
import { SubjectGroupsService } from 'src/app/shared/services/academic-setup/subject-groups.service';
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
    // blockingCount: the enrolled students that block a delete, sent WITH the list.
    classDoc({ _id: 'c6', class: 6, sections: [{ _id: 's6a', name: 'A' }, { _id: 's6b', name: 'B' }], studentCount: 72, blockingCount: 72 }),
    // No sections and no students: the class a delete strands nobody over.
    classDoc({ _id: 'c7', class: 7, studentCount: 0 }),
    classDoc({
      _id: 'c11',
      class: 11,
      hasStreams: true,
      streams: [
        { _id: 'sci', name: 'science', sections: [{ _id: 'sciA', name: 'A' }], studentCount: 60,
          groups: [{ _id: 'g-pcm', name: 'PCM', subjectIds: ['phy'] }], groupCount: 1 },
        // Saved before groups were mandatory: no group — the row's warning badge.
        { _id: 'com', name: 'commerce', sections: [], studentCount: 38, groups: [], groupCount: 0 }
      ],
      studentCount: 98
    })
  ];

  beforeEach(async () => {
    context$ = new BehaviorSubject<{ activeSession: string }>({ activeSession: '2026-2027' });

    api = jasmine.createSpyObj<ClassesSectionsService>('ClassesSectionsService', [
      'getClasses', 'getClassNameOptions', 'createClass', 'updateClass', 'deleteClass', 'bulkDelete'
    ]);
    api.getClasses.and.returnValue(of(CLASSES));
    api.getClassNameOptions.and.returnValue(of([{ class: 8, label: '8th' }]));
    api.createClass.and.returnValue(of('ok'));
    api.updateClass.and.returnValue(of('ok'));
    api.deleteClass.and.returnValue(of('ok'));
    api.bulkDelete.and.callFake((_adminId: string, ids: string[]) =>
      of({ message: 'ok', results: ids.map((id) => ({ id, status: 'deleted' as const })) }));

    await TestBed.configureTestingModule({
      declarations: [ClassesSectionsComponent],
      providers: [
        ClassSuffixPipe,
        StreamTitleCasePipe,
        { provide: ClassesSectionsService, useValue: api },
        {
          provide: SubjectGroupsService,
          useValue: { getFormOptions: () => of({ classes: [], subjects: [{ _id: 'phy', name: 'Physics' }, { _id: 'acc', name: 'Accounts' }] }) }
        },
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
    expect(api.getClasses).toHaveBeenCalledWith('a1', '2026-2027');
    expect(component.rows.length).toBe(3);
    expect(component.loading).toBe(false);
  });

  /**
   * The structure is session-independent; the Students counts beside it are not. Switching
   * the header's selector has to actually refetch, not sit inert.
   */
  it('refetches when the header switches session, and not when anything else changes', () => {
    api.getClasses.calls.reset();

    context$.next({ activeSession: '2025-2026' });
    expect(api.getClasses).toHaveBeenCalledWith('a1', '2025-2026');

    // A context emission that leaves the session alone (school details landing, say).
    api.getClasses.calls.reset();
    context$.next({ activeSession: '2025-2026' });
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
    context$.next({ activeSession: '2024-2025' });
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
    context$.next({ activeSession: '2024-2025' });
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

    context$.next({ activeSession: '2024-2025' });

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

  /** P0-1 #1: hasStreams follows the class name — never a manual toggle. */
  it('derives streams from the chosen class: on for 11th/12th only, never toggleable', () => {
    component.onAddClass();
    ['200', '201', '202', '1', '8', '9', '10'].forEach((value) => {
      component.onClassSelected(value);
      expect(component.form.hasStreams).withContext(value).toBe(false);
    });
    component.onClassSelected('11');
    expect(component.form.hasStreams).toBe(true);
    component.onClassSelected('12');
    expect(component.form.hasStreams).toBe(true);

    // No manual control exists to flip it.
    expect((component as unknown as Record<string, unknown>)['onStreamsToggled']).toBeUndefined();
  });

  it('hides the Streams UI for a non-streamed class and shows it, with no toggle, for 11th', () => {
    const host: HTMLElement = fixture.nativeElement;
    // OnPush: re-render through the component's own change detector.
    const render = () => fixture.componentRef.injector.get(ChangeDetectorRef).detectChanges();
    component.onAddClass();
    component.onClassSelected('9');
    render();
    expect(host.querySelector('.streams-auto')).toBeNull();
    expect(host.querySelector('.toggle-row')).toBeNull();
    expect(host.querySelector('[aria-label="Add stream"]')).toBeNull();

    component.onClassSelected('11');
    render();
    expect(host.querySelector('.streams-auto')).toBeTruthy();
    expect(host.querySelector('[aria-label="Add stream"]')).toBeTruthy();
    expect(host.querySelector('.toggle-row')).toBeNull();
  });

  it('clears the other half of the form whenever the chosen class flips streams', () => {
    component.onAddClass();
    component.onClassSelected('8');
    component.addSection();
    component.updateSection(0, 'A');

    component.onClassSelected('11');
    expect(component.form.sections).toEqual([]);

    component.addStream();
    component.updateStreamName(0, 'Science');
    component.onClassSelected('8');
    expect(component.form.streams).toEqual([]);
  });

  /** P0-1 #2: each stream's sections are its own list. */
  it('adds and removes sections per stream without touching any other stream', () => {
    component.onAddClass();
    component.onClassSelected('11');
    component.addStream();
    component.updateStreamName(0, 'Science');
    component.addStream();
    component.updateStreamName(1, 'Commerce');

    ['A', 'B', 'C'].forEach((name, j) => {
      component.addStreamSection(0);
      component.updateStreamSection(0, j, name);
    });
    component.addStreamSection(1);
    component.updateStreamSection(1, 0, 'A');

    component.removeStreamSection(0, 1); // Science's "B", specifically
    expect(component.form.streams[0].sections).toEqual([{ name: 'A' }, { name: 'C' }]);
    expect(component.form.streams[1].sections).toEqual([{ name: 'A' }]);

    component.addStreamSection(1);
    expect(component.form.streams[0].sections.length).toBe(2);
    expect(component.form.streams[1].sections.length).toBe(2);
  });

  it('adds, edits and removes a section row without touching its neighbours', () => {
    component.onAddClass();
    component.addSection();
    component.addSection();
    component.updateSection(0, 'A');
    component.updateSection(1, 'B');

    component.removeSection(0);
    expect(component.form.sections).toEqual([{ name: 'B' }]);
  });

  it('keeps each stream`s sections attached to it through add, rename and remove', () => {
    component.onAddClass();
    component.onClassSelected('11');
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
    expect(component.form.streams[0].sections).toEqual([{ name: 'A' }]);
    expect(component.form.streams[1].sections).toEqual([{ name: 'C' }]);

    component.removeStreamSection(0, 0);
    expect(component.form.streams[0].sections).toEqual([]);
    expect(component.form.streams[1].sections).toEqual([{ name: 'C' }]);
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
    }), jasmine.any(String));

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
    component.addStreamGroup(1);
    component.updateStreamGroupName(1, 0, 'Accounts');
    component.addStreamSection(0);
    component.updateStreamSection(0, 1, 'B');
    component.onFormSubmit();

    expect(component.confirmOpen).toBe(false);
    expect(api.updateClass).toHaveBeenCalled();
  });

  // A 12th saved before streams were mandatory: its sections sit on the class, not a stream.
  const legacyRow = () => ({
    _id: 'c12', className: '12th',
    source: classDoc({ _id: 'c12', class: 12, hasStreams: false, sections: [{ _id: 's12a', name: 'A' }, { _id: 's12b', name: 'B' }] })
  }) as any;

  it('names an 11th/12th`s legacy flat sections on edit instead of silently dropping them', () => {
    component.onEditClass(legacyRow());
    expect(component.form.hasStreams).toBe(true);
    expect(component.legacySections).toEqual(['A', 'B']);

    component.onEditClass(row('c6'));
    expect(component.legacySections).toEqual([]);
    component.onAddClass();
    expect(component.legacySections).toEqual([]);
  });

  it('demands a typed confirmation before a save removes legacy flat sections, then says so to the server', () => {
    component.onEditClass(legacyRow());
    component.addStream();
    component.updateStreamName(0, 'Science');
    component.updateStreamGroupName(0, 0, 'PCM');
    component.onFormSubmit();

    expect(api.updateClass).not.toHaveBeenCalled();
    expect(component.confirmOpen).toBe(true);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.message).toContain('A, B');

    component.onConfirmed();
    const [, payload] = api.updateClass.calls.mostRecent().args;
    expect(payload.confirmRemoveSections).toBe(true);
  });

  it('never sends the remove-sections confirmation for an ordinary edit', () => {
    component.onEditClass(row('c6'));
    component.onFormSubmit();
    expect(api.updateClass.calls.mostRecent().args[1].confirmRemoveSections).toBeUndefined();
  });

  // --- student-fix5 #6 / #8 -------------------------------------------------------------

  it('sends back the id of every existing section, stream and group — an edit never re-mints them', () => {
    component.onEditClass(row('c11'));
    component.addStreamGroup(1);
    component.updateStreamGroupName(1, 0, 'Accounts');
    component.updateStreamName(0, 'Sciences');   // a rename keeps the id
    component.addStreamSection(0);
    component.updateStreamSection(0, 1, 'B');     // a new section has none
    component.onFormSubmit();

    const [id, payload] = api.updateClass.calls.mostRecent().args;
    expect(id).toBe('c11');
    expect(payload.streams[0]).toEqual({
      _id: 'sci', name: 'Sciences',
      sections: [{ _id: 'sciA', name: 'A' }, { name: 'B' }],
      // Name only — never subjectIds, so an edit can't wipe what Subject Groups assigned.
      groups: [{ _id: 'g-pcm', name: 'PCM' }]
    });
    expect(payload.streams[1].groups).toEqual([{ name: 'Accounts' }]);

    component.onEditClass(row('c6'));
    component.onFormSubmit();
    expect(api.updateClass.calls.mostRecent().args[1].sections).toEqual([{ _id: 's6a', name: 'A' }, { _id: 's6b', name: 'B' }]);
  });

  it('blocks Submit while a stream has no subject group, and says so on that stream', () => {
    component.onEditClass(row('c11'));   // Commerce has none
    component.onFormSubmit();
    expect(api.updateClass).not.toHaveBeenCalled();
    expect(component.streamGroupErrors[1]).toContain('at least one subject group');
    expect(component.streamGroupErrors[0]).toBeUndefined();

    component.addStreamGroup(1);
    expect(component.streamGroupErrors[1]).toBeUndefined();
  });

  /** P0-1 #3: the inline Groups sub-block names a group — it never picks subjects. */
  it('a new stream starts with one empty, name-only group row and no subject checklist', () => {
    component.onAddClass();
    component.onClassSelected('11');
    component.addStream();
    expect(component.form.streams[0].groups).toEqual([{ name: '' }]);

    fixture.componentRef.injector.get(ChangeDetectorRef).detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.subj-check, .subj-check-grid')).toBeNull();
    // A group with no subjects yet says so.
    expect(host.querySelector('.group-no-subjects')!.textContent).toContain('No subjects assigned');
  });

  it('pre-fills an existing group`s subject count on edit, showing the tag only when it has none', () => {
    component.onEditClass(row('c11'));
    expect(component.form.streams[0].groups).toEqual([{ _id: 'g-pcm', name: 'PCM', subjectCount: 1 }]);
    fixture.componentRef.injector.get(ChangeDetectorRef).detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    // Science's PCM has a subject; Commerce has no group at all yet — so no tag either way.
    expect(host.querySelectorAll('.group-no-subjects').length).toBe(0);
  });

  it('flags a stream saved without any group on its table row', () => {
    expect(row('c11').streamsWithoutGroups).toEqual(['Commerce']);
    expect(row('c6').streamsWithoutGroups).toEqual([]);
    fixture.detectChanges();
    const badges = Array.from(fixture.nativeElement.querySelectorAll('.no-group')) as HTMLElement[];
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toContain('Admission blocked');
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
  it('always demands DELETE typed, and names the real blocking count upfront', () => {
    component.onDeleteClass(row('c7'));
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.scopeNote).toBeUndefined();
    expect(component.confirmConfig.blocked).toBe(false);

    // Known from the list response — the delete would be refused, so confirm is disabled.
    component.onDeleteClass(row('c6'));
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.scopeNote).toContain('72 students');
    expect(component.confirmConfig.blocked).toBe(true);
  });

  it('sends a whole selection as ONE bulk request, not a call per row', () => {
    component.toggleRow('c6');
    component.toggleRow('c7');
    component.onDeleteSelected();

    expect(component.confirmConfig.title).toBe('Delete 2 classes?');
    // Which of the selection will be refused is named before the attempt.
    expect(component.confirmConfig.scopeNote).toContain('1 of 2 selected have students enrolled');
    expect(component.confirmConfig.scopeNote).toContain('6th');
    expect(component.confirmConfig.blocked).toBe(false);

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

  it('shows the per-row outcome and keeps a refused class selected', () => {
    api.bulkDelete.and.returnValue(of({
      results: [
        { id: 'c6', status: 'blocked' as const, code: 'CLASS_HAS_STUDENTS', blockingCount: 72 },
        { id: 'c7', status: 'deleted' as const }
      ]
    }));
    component.toggleRow('c6');
    component.toggleRow('c7');
    component.onDeleteSelected();
    component.onConfirmed();

    expect(component.bulkResultOpen).toBe(true);
    expect(component.bulkResultSummary).toContain('1 of 2 deleted.');
    expect(component.bulkResultLines).toEqual([
      { id: 'c6', label: '6th', message: '72 students are enrolled in this class — move them before deleting it.' }
    ]);
    expect(component.isSelected('c6')).toBe(true);
    expect(component.isSelected('c7')).toBe(false);
  });

  it('shows a failed list fetch as an error with Retry, never as the empty state', () => {
    api.getClasses.and.returnValue(throwError(() => new Error('down')));
    component.retryList();
    fixture.componentRef.injector.get(ChangeDetectorRef).detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(component.loadError).toBeTruthy();
    expect(host.querySelector('.tbl-empty.load-error')).toBeTruthy();
    expect(host.textContent).not.toContain('No classes configured yet.');
  });

  it('loads the Class Name options from the API, with an error state and retry', () => {
    api.getClassNameOptions.and.returnValue(throwError(() => new Error('down')));
    component.onAddClass();
    expect(component.classOptionsError).toBeTruthy();
    expect(component.classDdOptions).toEqual([]);

    api.getClassNameOptions.and.returnValue(of([{ class: 8, label: '8th' }]));
    component.retryClassOptions();
    expect(component.classOptionsError).toBe('');
    expect(component.classDdOptions).toEqual([{ value: '8', label: '8th' }]);
  });

  it('sends one Idempotency-Key per modal-open on create', () => {
    component.onAddClass();
    component.onClassSelected('8');
    component.onFormSubmit();
    const first = api.createClass.calls.mostRecent().args[1];

    component.onAddClass();
    component.onClassSelected('8');
    component.onFormSubmit();
    const second = api.createClass.calls.mostRecent().args[1];

    expect(first).toBeTruthy();
    expect(second).not.toBe(first);
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
