import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { PersonFilterComponent } from './person-filter.component';
import { EMPTY_PERSON_FILTER, PersonFilterOptions, PersonFilterValue } from 'src/app/shared/models/leave/person-filter.model';

describe('PersonFilterComponent', () => {
  let fixture: ComponentFixture<PersonFilterComponent>;
  let component: PersonFilterComponent;
  let emitted: PersonFilterValue[];

  const options: PersonFilterOptions = {
    departments: [{ _id: 'd1', name: 'Teaching' }],
    designations: [{ _id: 'g1', title: 'PRT', departmentId: 'd1' }],
    classes: [
      { _id: 'c6', class: 6, label: '6th', hasStreams: false, sections: [{ _id: 's6a', name: 'A' }], streams: [] },
      {
        _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [],
        streams: [{ _id: 'sci', name: 'science', sections: [{ _id: 'sciA', name: 'A' }] }]
      }
    ] as any,
    groups: [
      { _id: 'gen6', name: 'General', classId: 'c6', streamId: null, isSystemGroup: true },
      { _id: 'pcm', name: 'PCM', classId: 'c11', streamId: 'sci' }
    ] as any
  };

  const pills = (): string[] => Array.from(fixture.nativeElement.querySelectorAll('app-dd'))
    .map((el: any) => el.getAttribute('arialabel') || el.getAttribute('ng-reflect-aria-label'));

  /** OnPush: re-render through the component's own change detector after an input change. */
  const render = (): void => fixture.componentRef.injector.get(ChangeDetectorRef).detectChanges();

  const setValue = (value: PersonFilterValue): void => {
    component.value = value;
    component.ngOnChanges();
    render();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PersonFilterComponent],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(PersonFilterComponent);
    component = fixture.componentInstance;
    component.options = options;
    emitted = [];
    component.valueChange.subscribe((value) => emitted.push(value));
    setValue(EMPTY_PERSON_FILTER);
  });

  it('shows every filter for both types by default; the other type is disabled, not hidden', () => {
    expect(pills().length).toBe(7);
    expect(component.departmentDisabled).toBeFalse();
    expect(component.classDisabled).toBeTrue();
    expect(component.streamDisabled && component.groupDisabled && component.sectionDisabled).toBeTrue();

    setValue({ ...EMPTY_PERSON_FILTER, personType: 'student' });
    expect(pills().length).toBe(7);
    expect(component.departmentDisabled).toBeTrue();
    expect(component.designationDisabled).toBeTrue();
    expect(component.classDisabled).toBeFalse();
  });

  it('every filter starts on its "All …" option', () => {
    expect(component.departmentOptions[0].label).toBe('All departments');
    expect(component.designationOptions[0].label).toBe('All designations');
    expect(component.classOptions[0].label).toBe('All classes');
    expect(component.streamOptions[0].label).toBe('All streams');
    expect(component.groupOptions[0].label).toBe('All stream groups');
    expect(component.sectionOptions[0].label).toBe('All sections');
  });

  it('hideByPersonType (Roster only) shows just the chosen type\'s filters', () => {
    component.hideByPersonType = true;
    render();
    expect(pills().length).toBe(3);
    setValue({ ...EMPTY_PERSON_FILTER, personType: 'student' });
    expect(pills().length).toBe(5);
  });

  it('a parent change resets every child to "All …"', () => {
    component.onDepartmentChange('d1');
    expect(component.designationDisabled).toBeFalse();
    expect(component.designationOptions.map((o) => o.label)).toEqual(['All designations', 'PRT']);
    component.onDesignationChange('g1');
    component.onDepartmentChange('');
    expect(emitted[emitted.length - 1].designationId).toBe('');

    component.onPersonTypeChange('student');
    expect(emitted[emitted.length - 1]).toEqual({ ...EMPTY_PERSON_FILTER, personType: 'student' });

    component.onClassChange('c11');
    expect(component.streamDisabled).toBeFalse();
    component.onStreamChange('sci');
    expect(component.groupOptions.map((o) => o.label)).toEqual(['All stream groups', 'PCM']);
    component.onGroupChange('pcm');
    component.onSectionChange('sciA');
    component.onClassChange('c6');
    const last = emitted[emitted.length - 1];
    expect([last.streamId, last.groupId, last.sectionId]).toEqual(['', '', '']);
    // General-group class: Stream Group stays disabled, show-only.
    expect(component.groupDisabled).toBeTrue();
  });
});
