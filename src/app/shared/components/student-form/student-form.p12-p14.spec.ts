import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { FeeQuote, FieldConfigField, FieldConfigResponse, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { AdmissionService } from 'src/app/shared/services/student/admission.service';
import { StudentFormComponent } from './student-form.component';

// student-critical-fixes.md P1-2 (admissionType) and P1-4 (group) — the form-side edges the
// student-fix5 spec doesn't cover: the enum offered, switching type back, and a group that
// belongs to another stream/class never reaching the payload.
const field = (fieldKey: string, label: string, rule: FieldConfigField['validationRule'], extra: Partial<FieldConfigField> = {}): FieldConfigField => ({
  fieldKey, label, group: 'student', required: false, visible: true, locked: false, validationRule: rule, ...extra
});

const CONFIG: FieldConfigResponse = {
  fields: [
    field('name', 'Name', { type: 'text', minLength: 2 }, { required: true, locked: true }),
    field('admissionType', 'Admission Type', { type: 'dropdown', options: ['new', 'old'] }, { required: true }),
    field('doa', 'Date of Admission', { type: 'date', notFuture: true }),
    field('feesConcession', 'Fees Concession (₹)', { type: 'number', min: 0 })
  ],
  options: { admissionType: ['new', 'old'] }
};

const C1 = 'c1'.padEnd(24, '0');
const C11 = 'c11'.padEnd(24, '0');
const C12 = 'c12'.padEnd(24, '0');
const SCI = 'sci'.padEnd(24, '0');
const COM = 'com'.padEnd(24, '0');
const SCI12 = 'sci12'.padEnd(24, '0');
const PCM = 'pcm'.padEnd(24, '0');
const PCB = 'pcb'.padEnd(24, '0');
const ACC = 'acc'.padEnd(24, '0');
const PCM12 = 'pcm12'.padEnd(24, '0');
const OPTIONS: StudentFilterOptions = {
  classes: [
    { _id: C1, class: 1, label: '1st', hasStreams: false, sections: [], streams: [] },
    { _id: C11, class: 11, label: '11th', hasStreams: true, sections: [], streams: [
      { _id: SCI, name: 'science', sections: [] }, { _id: COM, name: 'commerce', sections: [] }
    ] },
    { _id: C12, class: 12, label: '12th', hasStreams: true, sections: [], streams: [{ _id: SCI12, name: 'science', sections: [] }] }
  ],
  groups: [
    { _id: 'gen'.padEnd(24, '0'), name: 'General', classId: C1, streamId: null, isSystemGroup: true },
    { _id: PCM, name: 'PCM', classId: C11, streamId: SCI },
    { _id: PCB, name: 'PCB', classId: C11, streamId: SCI },
    { _id: ACC, name: 'Accounts', classId: C11, streamId: COM },
    { _id: PCM12, name: 'PCM', classId: C12, streamId: SCI12 }
  ]
};

describe('StudentFormComponent — P1-2 admissionType / P1-4 group', () => {
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

  it('P1-2 offers exactly new|old as a required dropdown, "new" preselected', () => {
    expect(form.enumOptions['admissionType'].map((o) => o.value)).toEqual(['new', 'old']);
    expect(form.value('admissionType')).toBe('new');
    fixture.detectChanges();
    const label = Array.from(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLElement>)
      .find((el) => /Admission Type/.test(el.textContent || ''));
    expect(label?.querySelector('.req-star')).toBeTruthy();
  });

  it("P1-2 the 'amount already paid' input and the DOA picker render only for 'old'", () => {
    form.onClassChange(C1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#f-amountPaid')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-dp[ariaLabel="Date of admission"]')).toBeNull();
    form.set('admissionType', 'old');
    // OnPush: in the app the dd's (valueChange) event marks the view dirty; here we do it.
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#f-amountPaid')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-dp[ariaLabel="Date of admission"]')).toBeTruthy();
  });

  it("P1-2 switching back from 'old' to 'new' drops the typed DOA and amount from the payload", () => {
    form.onClassChange(C1);
    form.set('admissionType', 'old');
    form.set('doa', '2025-06-01');
    form.set('amountPaid', '5000');
    form.set('admissionType', 'new');
    const body = form.buildPayload();
    expect(body).not.toBeNull();
    expect(body?.get('admissionType')).toBe('new');
    expect(body?.has('doa')).toBe(false);
    expect(body?.has('amountPaid')).toBe(false);
  });

  it("P1-2 'old': a negative or non-numeric amount is rejected before submit; blank is fine (default 0)", () => {
    form.onClassChange(C1);
    form.set('admissionType', 'old');
    form.set('doa', '2025-06-01');
    form.set('amountPaid', '-10');
    expect(form.buildPayload()).toBeNull();
    expect(form.error('amountPaid')).toBe('Enter a valid amount (numbers only).');
    form.set('amountPaid', 'abc');
    expect(form.buildPayload()).toBeNull();
    form.set('amountPaid', '');
    const body = form.buildPayload();
    expect(body?.get('doa')).toBe('2025-06-01');
    expect(body?.has('amountPaid')).toBe(false);
  });

  it("P1-4 each stream offers only its own groups — never another stream's or another class's same-named group", () => {
    form.onClassChange(C11);
    form.onStreamChange(SCI);
    expect(form.groupOptions.map((o) => o.value)).toEqual([PCM, PCB]);
    form.onStreamChange(COM);
    expect(form.groupOptions.map((o) => o.value)).toEqual([ACC]);
    form.onClassChange(C12);
    form.onStreamChange(SCI12);
    expect(form.groupOptions.map((o) => o.value)).toEqual([PCM12]);
  });

  it('P1-4 changing stream or class clears the chosen group, so a stale one is never sent', () => {
    form.onClassChange(C11);
    form.onStreamChange(SCI);
    form.onGroupChange(PCM);
    form.onStreamChange(COM);
    expect(form.value('groupId')).toBe('');
    expect(form.buildPayload()).toBeNull();
    expect(form.error('groupId')).toBe('Group is required for this class/stream.');

    form.onGroupChange(ACC);
    form.onClassChange(C1);
    expect(form.showGroup).toBe(false);
    const body = form.buildPayload();
    expect(body?.get('classId')).toBe(C1);
    expect(body?.has('groupId')).toBe(false);
    expect(body?.has('streamId')).toBe(true);
    expect(body?.get('streamId')).toBe('');
  });
});
