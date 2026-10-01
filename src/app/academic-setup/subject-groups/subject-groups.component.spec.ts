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
    api.bulkDelete.and.callFake((_adminId: string, ids: string[]) =>
      of({ message: 'ok', results: ids.map((id) => ({ id, status: 'deleted' as const })) }));

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

  // --- student-fix5 #8 ------------------------------------------------------------------

  describe('the automatic "General" group and streams without groups', () => {
    beforeEach(() => {
      api.getSubjectGroups.and.returnValue(of({
        ...RESPONSE,
        rows: [{ ...RESPONSE.rows[0], name: 'General', isSystemGroup: true }, RESPONSE.rows[1]],
        summary: { ...RESPONSE.summary, streamsWithoutGroups: [{ classId: 'c11', class: 11, label: '11th', streamId: 'st2', streamName: 'commerce' }] }
      }));
      component.onPageChange(1);
      fixture.detectChanges();
    });

    const tableRows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));

    it('gives a "General" row an enabled Edit, a shown-but-disabled Delete, and a disabled checkbox', () => {
      const [general, normal] = tableRows();
      const [edit, del] = Array.from(general.querySelectorAll('.actions .icon-btn')) as HTMLButtonElement[];
      expect(edit.disabled).toBe(false);
      expect(del).toBeTruthy();
      expect(del.disabled).toBe(true);
      expect((general.querySelector('.row-check') as HTMLInputElement).disabled).toBe(true);

      const normalButtons = Array.from(normal.querySelectorAll('.actions .icon-btn')) as HTMLButtonElement[];
      expect(normalButtons.length).toBe(2);
      expect(normalButtons.every((button) => !button.disabled)).toBe(true);
    });

    it('never opens a delete confirmation for a "General" row, even if called directly', () => {
      component.onDeleteGroup(component.rows[0]);
      expect(component.confirmOpen).toBe(false);
      component.onConfirmed();
      expect(api.bulkDelete).not.toHaveBeenCalled();
    });

    it('opens the normal modal on Edit with Name and Class locked, showing its non-streamed class', () => {
      component.onEditGroup(component.rows[0]);
      fixture.detectChanges();

      expect(component.formOpen).toBe(true);
      expect(component.formSystemGroup).toBe(true);
      expect(component.form.name).toBe('General');
      // The non-streamed class is offered (read-only) so the locked dropdown can show it.
      expect(component.formClassOptions.map((option) => option.label)).toEqual(['— Select —', '9th', '11th']);
      expect(component.formStreamDisabled).toBe(true);

      const nameInput = fixture.nativeElement.querySelector('#group-name') as HTMLInputElement;
      expect(nameInput.readOnly).toBe(true);

      component.onFormNameChange('Renamed');
      component.onFormClassChange('c11');
      component.onFormStreamChange('st1');
      expect(component.form.name).toBe('General');
      expect(component.form.classId).toBe('c9');
      expect(component.form.streamId).toBe('');
    });

    it('keeps the subject checklist fully editable and saves it on the same name/class', () => {
      component.onEditGroup(component.rows[0]);
      component.toggleSubject('sub1');
      component.toggleSubject('sub3');
      component.onFormSubmit();

      expect(api.updateSubjectGroup).toHaveBeenCalledWith('g1', {
        adminId: 'a1', classId: 'c9', streamId: null, name: 'General', subjectIds: ['sub2', 'sub3']
      }, jasmine.any(String));
    });

    it('unlocks the modal again for a streamed group or a new one', () => {
      component.onEditGroup(component.rows[0]);
      component.onEditGroup(component.rows[1]);
      expect(component.formSystemGroup).toBe(false);
      component.onFormNameChange('Renamed');
      expect(component.form.name).toBe('Renamed');

      component.onEditGroup(component.rows[0]);
      component.onAddGroup();
      expect(component.formSystemGroup).toBe(false);
      expect(component.formClassOptions.map((option) => option.label)).toEqual(['— Select —', '11th']);
    });

    it('never bulk-selects it — select-all takes the editable rows only', () => {
      component.toggleAll();
      expect(component.isSelected('g1')).toBe(false);
      expect(component.isSelected('g2')).toBe(true);
      component.toggleRow('g1');
      expect(component.isSelected('g1')).toBe(false);
    });

    it('names streams that have no group yet, above the table', () => {
      expect(fixture.nativeElement.querySelector('.no-group-strip').textContent).toContain('11th Commerce');
    });

    it('only offers streamed classes in the Add Group modal', () => {
      expect(component.formClassOptions.map((option) => option.label)).toEqual(['— Select —', '11th']);
    });
  });

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
    }), jasmine.any(String));
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
    }, jasmine.any(String));
  });

  it('sends the chosen stream for a streamed class', () => {
    component.onAddGroup();
    component.onFormClassChange('c11');
    component.onFormStreamChange('st2');
    component.onFormNameChange('Commerce Group');
    component.onFormSubmit();

    expect(api.createSubjectGroup).toHaveBeenCalledWith(jasmine.objectContaining({
      classId: 'c11', streamId: 'st2', subjectIds: []
    }), jasmine.any(String));
  });

  it('updates by id when the modal was opened on an existing group', () => {
    component.onEditGroup(component.rows[0]);
    component.toggleSubject('sub3');
    component.onFormSubmit();

    expect(api.updateSubjectGroup).toHaveBeenCalledWith('g1', jasmine.objectContaining({
      subjectIds: ['sub1', 'sub2', 'sub3']
    }), jasmine.any(String));
    expect(api.createSubjectGroup).not.toHaveBeenCalled();
  });

  /** P1-8: both halves — pre-populated on open AND sent back from the checklist on Update. */
  it('round-trips the checklist on Edit, including an unticked subject', () => {
    component.onEditGroup(component.rows[0]);
    expect(component.isChecked('sub1')).toBe(true);
    expect(component.isChecked('sub2')).toBe(true);

    component.toggleSubject('sub1');
    component.onFormSubmit();

    expect(api.updateSubjectGroup.calls.mostRecent().args[1].subjectIds).toEqual(['sub2']);
  });

  it('keeps a group`s subject that the live list no longer offers visible and ticked on Edit', () => {
    api.getFormOptions.and.returnValue(of({ ...OPTIONS, subjects: [{ _id: 'sub1', name: 'Hindi' }] }));
    component.onEditGroup(component.rows[0]);

    expect(component.subjectChecklist.map((subject) => subject._id)).toEqual(['sub1', 'sub2']);
    expect(component.isChecked('sub2')).toBe(true);
  });

  it('sends one Idempotency-Key per modal-open and reuses it when the same submit is retried', () => {
    api.createSubjectGroup.and.returnValue(throwError(() => ({ category: 'InternalError', message: 'x', requestId: 'r' } as ApiError)));
    component.onAddGroup();
    component.onFormClassChange('c11');
    component.onFormStreamChange('st1');
    component.onFormNameChange('Science Group');
    component.onFormSubmit();
    component.onFormSubmit();

    const [first, second] = api.createSubjectGroup.calls.allArgs().map((args) => args[1]);
    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });

  it('says a failed form-options fetch out loud, holds Submit, and retries', () => {
    api.getFormOptions.and.returnValue(throwError(() => new Error('down')));
    component.onAddGroup();
    component.onFormClassChange('c11');
    component.onFormNameChange('Science Group');

    expect(component.optionsError).toBeTruthy();
    expect(component.submitDisabled).toBe(true);

    api.getFormOptions.and.returnValue(of(OPTIONS));
    component.retryOptions();
    expect(component.optionsError).toBe('');
    expect(component.subjectChecklist.length).toBe(3);
  });

  it('shows a failed list fetch as an error with Retry, never as the empty state', () => {
    api.getSubjectGroups.and.returnValue(throwError(() => new Error('down')));
    component.retryList();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tbl-empty.load-error')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('No subject groups created yet.');
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

  it('demands DELETE typed for a group nobody is placed in', () => {
    component.onDeleteGroup(component.rows[0]);

    expect(component.confirmConfig.title).toBe('Delete 1 group?');
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.blocked).toBe(false);
    expect(api.bulkDelete).not.toHaveBeenCalled();
  });

  it('shows the blocking student count upfront, from the list, and disables confirm', () => {
    api.getSubjectGroups.and.returnValue(of({
      ...RESPONSE, rows: [{ ...RESPONSE.rows[1], blockingCount: 4 }]
    }));
    component.retryList();
    component.onDeleteGroup(component.rows[0]);

    expect(component.confirmConfig.scopeNote).toContain('4 students are placed in this group');
    expect(component.confirmConfig.blocked).toBe(true);
  });

  it('lists each refused row after a partial bulk delete and keeps it selected', () => {
    api.bulkDelete.and.returnValue(of({
      results: [
        { id: 'g1', status: 'deleted' as const },
        { id: 'g2', status: 'blocked' as const, code: 'SUBJECT_GROUP_IN_USE', blockingCount: 3 }
      ]
    }));
    component.toggleRow('g1');
    component.toggleRow('g2');
    component.onDeleteSelected();
    component.onConfirmed();

    expect(component.bulkResultOpen).toBe(true);
    expect(component.bulkResultLines.length).toBe(1);
    expect(component.bulkResultLines[0].message).toContain('3 students are placed');
    expect(component.isSelected('g1')).toBe(false);
    expect(component.isSelected('g2')).toBe(true);
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
