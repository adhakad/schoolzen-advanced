import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ClassSuffixPipe } from 'src/app/pipes/class-suffix.pipe';
import { StreamTitleCasePipe } from 'src/app/pipes/stream-title-case.pipe';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ApiError } from 'src/app/shared/models/api-error.model';
import { SubjectGroupsService } from 'src/app/shared/services/academic-setup/subject-groups.service';
import {
  SubjectGroupFormOptions, SubjectGroupListResponse
} from 'src/app/shared/models/academic-setup/subject-group.model';
import { SubjectGroupsComponent } from './subject-groups.component';

const OPTIONS: SubjectGroupFormOptions = {
  classes: [
    { _id: 'c9', class: 9, label: '9th', hasStreams: false, streams: [] },
    {
      _id: 'c11',
      class: 11,
      label: '11th',
      hasStreams: true,
      streams: [{ _id: 'st1', name: 'science' }, { _id: 'st2', name: 'commerce' }]
    }
  ],
  subjects: [
    { _id: 'sub1', name: 'Hindi' },
    { _id: 'sub2', name: 'English' },
    { _id: 'sub3', name: 'Biology' }
  ]
};

const RESPONSE: SubjectGroupListResponse = {
  rows: [
    {
      _id: 'g1', name: 'General Group', classId: 'c9', class: 9, hasStreams: false,
      streamId: null, streamName: null,
      subjects: [{ _id: 'sub1', name: 'Hindi' }, { _id: 'sub2', name: 'English' }]
    },
    {
      _id: 'g2', name: 'Biology Group', classId: 'c11', class: 11, hasStreams: true,
      streamId: 'st1', streamName: 'science',
      subjects: [{ _id: 'sub3', name: 'Biology' }]
    }
  ],
  total: 2,
  page: 1,
  limit: 10,
  summary: { total: 4, classesCovered: 3, streamsCovered: 1 }
};

describe('SubjectGroupsComponent', () => {
  let fixture: ComponentFixture<SubjectGroupsComponent>;
  let component: SubjectGroupsComponent;
  let api: jasmine.SpyObj<SubjectGroupsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<SubjectGroupsService>('SubjectGroupsService', [
      'getSubjectGroups', 'getFormOptions', 'createSubjectGroup', 'updateSubjectGroup', 'bulkDelete'
    ]);
    api.getSubjectGroups.and.returnValue(of(RESPONSE));
    api.getFormOptions.and.returnValue(of(OPTIONS));
    api.createSubjectGroup.and.returnValue(of('ok'));
    api.updateSubjectGroup.and.returnValue(of('ok'));
    api.bulkDelete.and.returnValue(of('ok'));

    await TestBed.configureTestingModule({
      declarations: [SubjectGroupsComponent],
      providers: [
        ClassSuffixPipe,
        StreamTitleCasePipe,
        { provide: SubjectGroupsService, useValue: api },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(SubjectGroupsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // --- list ---------------------------------------------------------------------------

  it('loads the list and the form options on init — two calls, not a join per row', () => {
    expect(api.getSubjectGroups).toHaveBeenCalledTimes(1);
    expect(api.getFormOptions).toHaveBeenCalledTimes(1);
    expect(component.rows.length).toBe(2);
    expect(component.total).toBe(2);
  });

  /**
   * Class, Stream and the subject chips are resolved in the backend's own aggregation.
   * The page only renders them through the shared pipes the rest of the app uses.
   */
  it('renders class and stream through the app`s own label pipes', () => {
    expect(component.rows[0].className).toBe('9th');
    expect(component.rows[0].streamName).toBeNull();
    expect(component.rows[1].className).toBe('11th');
    expect(component.rows[1].streamName).toBe('Science');
    expect(component.rows[1].subjects).toEqual([{ _id: 'sub3', name: 'Biology' }]);
  });

  it('takes the side card`s counts from the list response', () => {
    expect(component.summary).toEqual({ total: 4, classesCovered: 3, streamsCovered: 1 });
  });

  it('debounces typing into one request and resets to the first page', fakeAsync(() => {
    api.getSubjectGroups.calls.reset();

    component.onSearchChange('bi');
    component.onSearchChange('bio');
    expect(api.getSubjectGroups).not.toHaveBeenCalled();

    tick(250);

    expect(api.getSubjectGroups).toHaveBeenCalledTimes(1);
    expect(api.getSubjectGroups).toHaveBeenCalledWith('a1', jasmine.objectContaining({
      search: 'bio', page: 1
    }));
  }));

  // --- toolbar filters ------------------------------------------------------------------
  //
  // The Stream pill is a DEPENDENT filter: always in the DOM, merely disabled. A pill that
  // disappears changes the toolbar's shape, which has been a real bug here.

  it('disables the stream filter until a class is chosen, and says why', () => {
    expect(component.filterStreamDisabled).toBe(true);
    expect(component.filterStreamHint).toBe('Select a class first');
  });

  it('keeps the stream filter disabled for a class that has no streams', () => {
    component.onFilterClassChange('c9');

    expect(component.filterStreamDisabled).toBe(true);
    expect(component.filterStreamHint).toBe('No streams');
  });

  it('populates the stream filter from the chosen class`s own streams', () => {
    component.onFilterClassChange('c11');

    expect(component.filterStreamDisabled).toBe(false);
    expect(component.streamFilterOptions).toEqual([
      { value: '', label: 'All streams' },
      { value: 'st1', label: 'Science' },
      { value: 'st2', label: 'Commerce' }
    ]);
  });

  /**
   * Regression: GetFormOptions once projected `streams.name` only, and MongoDB's automatic
   * _id inclusion does not reach into an embedded array, so every stream arrived without its
   * id. The dropdown showed "Science" while the payload carried no stream, and the save came
   * back "12th has streams, so this group must belong to one of them". The contract this
   * asserts is that a stream option's value IS the id the server will be sent.
   */
  it('builds every stream option with the id the payload will carry', () => {
    component.onFilterClassChange('c11');

    component.streamFilterOptions
      .filter((option) => option.value !== '')
      .forEach((option) => {
        expect(typeof option.value).withContext(option.label).toBe('string');
        expect(option.value.length).withContext(option.label).toBeGreaterThan(0);
      });

    component.onAddGroup();
    component.onFormClassChange('c11');
    component.onFormStreamChange('st1');
    component.onFormNameChange('Science Group');
    component.onFormSubmit();

    expect(api.createSubjectGroup).toHaveBeenCalledWith(jasmine.objectContaining({
      streamId: 'st1'
    }));
  });

  it('clears a stale stream when the class filter changes, and refetches', () => {
    component.onFilterClassChange('c11');
    component.onFilterStreamChange('st1');
    api.getSubjectGroups.calls.reset();

    component.onFilterClassChange('c9');

    expect(component.filterStreamId).toBe('');
    expect(api.getSubjectGroups).toHaveBeenCalledWith('a1', jasmine.objectContaining({
      classId: 'c9', streamId: '', page: 1
    }));
  });

  // --- form ---------------------------------------------------------------------------

  /**
   * subject-groups.md: "this checklist must always reflect the current Subjects list, never
   * a stale copy". Re-reading the options on open is what makes that true.
   */
  it('re-reads the subject checklist every time the modal opens', () => {
    api.getFormOptions.calls.reset();

    component.onAddGroup();
    expect(api.getFormOptions).toHaveBeenCalledTimes(1);
    expect(component.subjectChecklist.length).toBe(3);

    component.onEditGroup(component.rows[0]);
    expect(api.getFormOptions).toHaveBeenCalledTimes(2);
  });

  it('shows a renamed subject on the next open, because nothing is cached', () => {
    component.onAddGroup();
    expect(component.subjectChecklist[2].name).toBe('Biology');

    api.getFormOptions.and.returnValue(of({
      ...OPTIONS,
      subjects: [{ _id: 'sub3', name: 'Life Science' }]
    }));
    component.onAddGroup();

    expect(component.subjectChecklist).toEqual([{ _id: 'sub3', name: 'Life Science' }]);
  });

  it('seeds Edit from the row, pre-checking the subjects already in the group', () => {
    component.onEditGroup(component.rows[1]);

    expect(component.formTitle).toBe('Edit Subject Group');
    expect(component.form.classId).toBe('c11');
    expect(component.form.streamId).toBe('st1');
    expect(component.form.name).toBe('Biology Group');
    expect(component.isChecked('sub3')).toBe(true);
    expect(component.isChecked('sub1')).toBe(false);
  });

  it('disables the modal`s stream field for a class with no streams, with the reference hint', () => {
    component.onAddGroup();
    expect(component.formStreamDisabled).toBe(true);
    expect(component.formStreamHint).toBe('Select a class first');

    component.onFormClassChange('c9');
    expect(component.formStreamDisabled).toBe(true);
    expect(component.formStreamHint).toBe('This class has no streams — leave as-is');

    component.onFormClassChange('c11');
    expect(component.formStreamDisabled).toBe(false);
    expect(component.formStreamHint).toBe('');
  });

  it('clears a stale stream when the modal`s class changes', () => {
    component.onEditGroup(component.rows[1]);
    expect(component.form.streamId).toBe('st1');

    component.onFormClassChange('c9');
    expect(component.form.streamId).toBe('');
  });

  it('keeps Submit disabled until both required fields are filled', () => {
    component.onAddGroup();
    expect(component.submitDisabled).toBe(true);

    component.onFormClassChange('c9');
    expect(component.submitDisabled).toBe(true);

    component.onFormNameChange('General Group');
    expect(component.submitDisabled).toBe(false);
  });

  it('toggles a subject on and off the checklist', () => {
    component.onAddGroup();

    component.toggleSubject('sub1');
    expect(component.isChecked('sub1')).toBe(true);

    component.toggleSubject('sub1');
    expect(component.isChecked('sub1')).toBe(false);
  });

  /** null, not absent: "this class has no streams" must never look like a dropped field. */
  it('sends streamId as null for a class with no streams', () => {
    component.onAddGroup();
    component.onFormClassChange('c9');
    component.onFormNameChange('  General Group  ');
    component.toggleSubject('sub1');
    component.onFormSubmit();

    expect(api.createSubjectGroup).toHaveBeenCalledWith({
      adminId: 'a1',
      classId: 'c9',
      streamId: null,
      name: 'General Group',
      subjectIds: ['sub1']
    });
  });

  it('sends the chosen stream for a streamed class', () => {
    component.onAddGroup();
    component.onFormClassChange('c11');
    component.onFormStreamChange('st2');
    component.onFormNameChange('Commerce Group');
    component.onFormSubmit();

    expect(api.createSubjectGroup).toHaveBeenCalledWith(jasmine.objectContaining({
      classId: 'c11', streamId: 'st2', subjectIds: []
    }));
  });

  it('updates by id when the modal was opened on an existing group', () => {
    component.onEditGroup(component.rows[0]);
    component.toggleSubject('sub3');
    component.onFormSubmit();

    expect(api.updateSubjectGroup).toHaveBeenCalledWith('g1', jasmine.objectContaining({
      subjectIds: ['sub1', 'sub2', 'sub3']
    }));
    expect(api.createSubjectGroup).not.toHaveBeenCalled();
  });

  it('binds a ValidationError`s fields and leaves the modal open', () => {
    api.createSubjectGroup.and.returnValue(throwError(() => ({
      category: 'ValidationError',
      message: 'Please fix the highlighted fields',
      fields: [{ field: 'streamId', message: '11th has streams, so this group must belong to one of them.' }],
      requestId: 'r1'
    } as ApiError)));

    component.onAddGroup();
    component.onFormClassChange('c11');
    component.onFormNameChange('Science Group');
    component.onFormSubmit();

    expect(component.fieldErrors['streamId'])
      .toBe('11th has streams, so this group must belong to one of them.');
    expect(component.formOpen).toBe(true);
  });

  // --- delete -------------------------------------------------------------------------

  it('demands DELETE typed and warns about the students on the group', () => {
    component.onDeleteGroup(component.rows[0]);

    expect(component.confirmConfig.title).toBe('Delete 1 group?');
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.message)
      .toContain('Students currently on this group will need to be reassigned.');
    expect(api.bulkDelete).not.toHaveBeenCalled();
  });

  it('sends a whole selection as ONE bulk request', () => {
    component.toggleRow('g1');
    component.toggleRow('g2');
    component.onDeleteSelected();

    expect(component.confirmConfig.title).toBe('Delete 2 groups?');

    component.onConfirmed();

    expect(api.bulkDelete).toHaveBeenCalledTimes(1);
    expect(api.bulkDelete).toHaveBeenCalledWith('a1', ['g1', 'g2'], true);
    expect(component.selectedCount).toBe(0);
  });

  // --- rendered DOM -------------------------------------------------------------------

  it('renders THIS page`s two toolbar rows, not a sibling`s single row', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('.sw-toolbar .toolbar-row1')).toBeTruthy();
    expect(host.querySelector('.sw-toolbar .toolbar-row2')).toBeTruthy();
    // Both filter pills are always present — the stream one is disabled, never removed.
    expect(host.querySelectorAll('.toolbar-row2 app-dd').length).toBe(2);
  });

  it('renders a real table with the reference`s six columns', () => {
    const host: HTMLElement = fixture.nativeElement;
    const headers = Array.from(host.querySelectorAll('table thead th')).map((th) => th.textContent!.trim());

    expect(headers).toEqual(['', 'Class', 'Stream', 'Group Name', 'Subjects', 'Action']);
    expect(host.querySelectorAll('table tbody tr').length).toBe(2);
  });

  it('renders one slate tag per subject, and the absence text for a streamless class', () => {
    const host: HTMLElement = fixture.nativeElement;
    const rows = host.querySelectorAll('table tbody tr');

    expect(rows[0].querySelectorAll('.subj-tags .tag-slate').length).toBe(2);
    expect(rows[0].querySelector('.na')!.textContent!.trim()).toBe('— not applicable');
    expect(rows[1].querySelectorAll('.subj-tags .tag-slate').length).toBe(1);
  });

  it('uses Bootstrap Icons only, and no native select', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelectorAll('i.bi').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('[class*="ti-"]').length).toBe(0);
    expect(host.querySelectorAll('select').length).toBe(0);
    expect(host.querySelectorAll('svg').length).toBe(0);
  });

  it('renders the side column`s stats and tips cards', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelectorAll('.col-side .stat-row').length).toBe(3);
    expect(host.querySelectorAll('.col-side .status-card .tip-item').length).toBe(3);
  });
});
