import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldConfigResponse, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { StudentFormComponent } from './student-form.component';

const FIELD_CONFIG: FieldConfigResponse = {
  fields: [
    { fieldKey: 'name', label: 'Name', group: 'student', type: 'text', required: true, visible: true, locked: true, validationRule: {} },
    { fieldKey: 'dob', label: 'Date of Birth', group: 'student', type: 'date', required: true, visible: true, locked: true, validationRule: {} },
    { fieldKey: 'gender', label: 'Gender', group: 'student', type: 'enum', required: true, visible: true, locked: true, validationRule: { options: ['Male', 'Female'] } },
    {
      fieldKey: 'aadharNumber', label: 'Aadhar Number', group: 'student', type: 'text', required: false, visible: true, locked: false,
      validationRule: { pattern: '^\\d{12}$', patternMessage: 'Must be a 12-digit number' }
    }
  ],
  options: { gender: ['Male', 'Female'] }
};

const OPTIONS: StudentFilterOptions = {
  classes: [{ _id: 'c8', class: 8, label: '8th', hasStreams: false, sections: [], streams: [] }],
  groups: []
};

describe('StudentFormComponent', () => {
  let fixture: ComponentFixture<StudentFormComponent>;
  let form: StudentFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StudentFormComponent],
      imports: [ReactiveFormsModule],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(StudentFormComponent);
    form = fixture.componentInstance;
    form.adminId = 'a1';
    form.session = '2026-2027';
    form.fieldConfig = FIELD_CONFIG;
    form.filterOptions = OPTIONS;
    form.ngOnChanges({ fieldConfig: new SimpleChange(null, FIELD_CONFIG, true) });
  });

  it('shows no error on a field nobody has touched yet', () => {
    expect(form.error('name')).toBe('');
    expect(form.error('gender')).toBe('');
  });

  it('shows a field\'s own error once it has been touched (blur / dd-dp close)', () => {
    form.touch('name');
    expect(form.error('name')).toBe('Name is required');
    form.set('aadharNumber', '123');
    form.touch('aadharNumber');
    expect(form.error('aadharNumber')).toBe('Must be a 12-digit number');
    form.set('aadharNumber', '123456789012');
    expect(form.error('aadharNumber')).toBe('');
  });

  it('marks everything touched on submit, so an unvisited required field still shows', () => {
    expect(form.buildPayload()).toBeNull();
    expect(form.error('gender')).toBe('Gender is required');
    expect(form.error('dob')).toBe('Date of Birth is required');
    expect(form.error('classId')).toBe('Class is required');
  });

  it('shows a server error in the same slot, and clears it when the field is edited', () => {
    form.serverErrors = { aadharNumber: 'This Aadhar number is already registered.' };
    expect(form.error('aadharNumber')).toBe('This Aadhar number is already registered.');
    form.set('aadharNumber', '999999999999');
    expect(form.error('aadharNumber')).toBe('');
  });

  it('sends dates as ISO values from the date picker, never dd/mm text', () => {
    form.set('name', 'Rohan Kapoor');
    form.set('dob', '2013-03-12');
    form.set('gender', 'Male');
    form.set('classId', 'c8');
    const body = form.buildPayload();
    expect(body).not.toBeNull();
    expect(body?.get('dob')).toBe('2013-03-12');
    expect(body?.get('classId')).toBe('c8');
    expect(body?.get('session')).toBe('2026-2027');
  });
});
