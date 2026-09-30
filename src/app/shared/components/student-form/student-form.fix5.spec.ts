import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { FeeQuote, FieldConfigField, FieldConfigResponse, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { AdmissionService } from 'src/app/shared/services/student/admission.service';
import { StudentFormComponent } from './student-form.component';

// student-fix5.md #4, #9, #11 — the form side of IFSC case, Group, and admissionType.
const field = (fieldKey: string, label: string, rule: FieldConfigField['validationRule'], extra: Partial<FieldConfigField> = {}): FieldConfigField => ({
  fieldKey, label, group: 'student', required: false, visible: true, locked: false, validationRule: rule, ...extra
});

const CONFIG: FieldConfigResponse = {
  fields: [
    field('name', 'Name', { type: 'text', minLength: 2 }, { required: true, locked: true }),
    field('admissionType', 'Admission Type', { type: 'dropdown', options: ['new', 'old'] }, { required: true }),
    field('doa', 'Date of Admission', { type: 'date', notFuture: true }),
    field('bankIfscCode', 'Bank IFSC Code', { type: 'text', normalize: 'upper', pattern: '^[A-Z]{4}0[A-Z0-9]{6}$' }),
    field('feesConcession', 'Fees Concession (₹)', { type: 'number', min: 0 })
  ],
  options: { admissionType: ['new', 'old'] }
};

const C1 = 'c1'.padEnd(24, '0');
const C11 = 'c11'.padEnd(24, '0');
const SCI = 'sci'.padEnd(24, '0');
const ARTS = 'arts'.padEnd(24, '0');
const PCM = 'pcm'.padEnd(24, '0');
const OPTIONS: StudentFilterOptions = {
  classes: [
    { _id: C1, class: 1, label: '1st', hasStreams: false, sections: [], streams: [] },
    { _id: C11, class: 11, label: '11th', hasStreams: true, sections: [], streams: [
      { _id: SCI, name: 'science', sections: [] }, { _id: ARTS, name: 'arts', sections: [] }
    ] }
  ],
  groups: [
    { _id: 'gen'.padEnd(24, '0'), name: 'General', classId: C1, streamId: null, isSystemGroup: true },
    { _id: PCM, name: 'PCM', classId: C11, streamId: SCI }
  ]
};

describe('StudentFormComponent — student-fix5', () => {
  let fixture: ComponentFixture<StudentFormComponent>;
  let form: StudentFormComponent;
  let quote: FeeQuote;

  beforeEach(async () => {
    quote = { found: true, admissionFee: 0, totalFee: 40000, reasonThresholdPercent: 50, reasonRequiredAbove: 20000 };
    await TestBed.configureTestingModule({
      declarations: [StudentFormComponent],
      imports: [ReactiveFormsModule],
      providers: [{ provide: AdmissionService, useValue: { getFeeQuote: () => of(quote) } }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(StudentFormComponent);
    form = fixture.componentInstance;
    form.adminId = 'a1';
    form.session = '2026-2027';
    form.mode = 'admission';
    form.fieldConfig = CONFIG;
    form.filterOptions = OPTIONS;
    form.ngOnChanges({ fieldConfig: new SimpleChange(null, CONFIG, true) });
    form.set('name', 'Rohan Kapoor');
  });

  it('#4 upper-cases an IFSC typed in lowercase as soon as the field is left — and it is valid', () => {
    form.set('bankIfscCode', 'sbin0001234');
    form.touch('bankIfscCode');
    expect(form.value('bankIfscCode')).toBe('SBIN0001234');
    expect(form.error('bankIfscCode')).toBe('');
  });

  it('#9 no Group field for a class without streams; nothing sent — the server uses "General"', () => {
    form.onClassChange(C1);
    expect(form.showGroup).toBe(false);
    const body = form.buildPayload();
    expect(body?.has('groupId')).toBe(false);
  });

  it("#9 streamed class: Group required, only that stream's groups offered, never \"General\"", () => {
    form.onClassChange(C11);
    form.onStreamChange(SCI);
    expect(form.showGroup).toBe(true);
    expect(form.groupOptions).toEqual([{ value: PCM, label: 'PCM' }]);
    expect(form.buildPayload()).toBeNull();
    expect(form.error('groupId')).toBe('Group is required for this class/stream.');
    form.onGroupChange(PCM);
    expect(form.buildPayload()?.get('groupId')).toBe(PCM);
  });

  it('#9 a stream with no group at all is called out before submit', () => {
    form.onClassChange(C11);
    form.onStreamChange(ARTS);
    expect(form.streamHasNoGroups).toBe(true);
    expect(form.buildPayload()).toBeNull();
    expect(form.error('groupId')).toContain('Please group subjects for this class/stream');
  });

  it("#11 admissionType defaults to 'new': no DOA asked, none sent (the server sets today)", () => {
    form.onClassChange(C1);
    expect(form.value('admissionType')).toBe('new');
    expect(form.showDoa).toBe(false);
    expect(form.showAmountPaid).toBe(false);
    const body = form.buildPayload();
    expect(body?.get('admissionType')).toBe('new');
    expect(body?.has('doa')).toBe(false);
  });

  it("#11 'old': DOA becomes required, and 'amount already paid' is asked and bounded by what's payable", () => {
    form.onClassChange(C1);
    form.set('admissionType', 'old');
    expect(form.showDoa).toBe(true);
    expect(form.showAmountPaid).toBe(true);
    expect(form.buildPayload()).toBeNull();
    expect(form.error('doa')).toBe('Date of admission is required.');

    form.set('doa', '2025-06-01');
    form.set('feesConcession', '5000');
    form.set('amountPaid', '36000');
    expect(form.buildPayload()).toBeNull();
    expect(form.error('amountPaid')).toBe("Amount already paid can't be more than the fee payable (₹35,000).");

    form.set('amountPaid', '12,000');
    const body = form.buildPayload();
    expect(body?.get('doa')).toBe('2025-06-01');
    expect(body?.get('amountPaid')).toBe('12,000');
  });
});
