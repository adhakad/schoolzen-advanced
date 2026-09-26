import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import {
  ClassCascadeFilterComponent, describeClassScope, isClassScopeComplete
} from './class-cascade-filter.component';

const OPTIONS: StudentFilterOptions = {
  classes: [
    { _id: 'c8', class: 8, label: '8th', hasStreams: false, sections: [{ _id: 's8a', name: 'A' }], streams: [] },
    {
      _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [],
      streams: [{ _id: 'sci', name: 'science', sections: [{ _id: 's11a', name: 'A' }] }]
    }
  ],
  groups: [{ _id: 'g1', name: 'Mathematics Group', classId: 'c11', streamId: 'sci' }]
};

describe('ClassCascadeFilterComponent', () => {
  let fixture: ComponentFixture<ClassCascadeFilterComponent>;
  let component: ClassCascadeFilterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ClassCascadeFilterComponent],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(ClassCascadeFilterComponent);
    component = fixture.componentInstance;
    component.options = OPTIONS;
    component.ngOnChanges();
  });

  it('starts with every child pill disabled until a class is picked', () => {
    expect(component.classOptions[0]).toEqual({ value: '', label: 'All classes' });
    expect(component.streamDisabled).toBe(true);
    expect(component.groupDisabled).toBe(true);
    expect(component.sectionDisabled).toBe(true);
  });

  it('keeps Stream disabled for a class without streams, but opens its sections', () => {
    component.onClassChange('c8');
    expect(component.streamDisabled).toBe(true);
    expect(component.sectionDisabled).toBe(false);
  });

  it('needs the stream before a streamed class opens groups and sections', () => {
    component.onClassChange('c11');
    expect(component.streamDisabled).toBe(false);
    expect(component.groupDisabled).toBe(true);
    component.onStreamChange('sci');
    expect(component.groupDisabled).toBe(false);
    expect(component.sectionDisabled).toBe(false);
  });

  it('resets every child when the parent changes', () => {
    const emitted: string[] = [];
    component.valueChange.subscribe((value) => emitted.push(JSON.stringify(value)));
    component.onClassChange('c11');
    component.onStreamChange('sci');
    component.onGroupChange('g1');
    component.onClassChange('c8');
    expect(JSON.parse(emitted[emitted.length - 1])).toEqual({ classId: 'c8', streamId: '', groupId: '', sectionId: '' });
  });

  it('drops "All classes" when a class is required', () => {
    component.requireClass = true;
    component.ngOnChanges();
    expect(component.classOptions.map((option) => option.value)).toEqual(['c8', 'c11']);
  });

  it('treats a class as a complete Excel scope only with its stream when it has streams', () => {
    expect(isClassScopeComplete(OPTIONS, { classId: '', streamId: '', groupId: '', sectionId: '' })).toBe(false);
    expect(isClassScopeComplete(OPTIONS, { classId: 'c8', streamId: '', groupId: '', sectionId: '' })).toBe(true);
    expect(isClassScopeComplete(OPTIONS, { classId: 'c11', streamId: '', groupId: '', sectionId: '' })).toBe(false);
    expect(isClassScopeComplete(OPTIONS, { classId: 'c11', streamId: 'sci', groupId: '', sectionId: '' })).toBe(true);
    expect(describeClassScope(OPTIONS, { classId: 'c11', streamId: 'sci', groupId: '', sectionId: '' })).toBe('11th · Science');
  });
});
