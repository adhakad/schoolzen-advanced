import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { FeeQuote, FieldConfigField, FieldConfigResponse, StudentDetail, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { AdmissionService } from 'src/app/shared/services/student/admission.service';
import { StudentFormComponent, VALIDATION_DEBOUNCE_MS } from './student-form.component';

const NAME_PATTERN = "^[\\p{L}\\p{M}\\s.'-]+$";

const field = (fieldKey: string, label: string, rule: FieldConfigField['validationRule'], extra: Partial<FieldConfigField> = {}): FieldConfigField => ({
  fieldKey, label, group: 'student', required: false, visible: true, locked: false, validationRule: rule, ...extra
});

const FIELD_CONFIG: FieldConfigResponse = {
  fields: [
    field('name', 'Name', { type: 'text', minLength: 2, pattern: NAME_PATTERN,
      errorMessages: { pattern: 'Name can only contain letters, spaces, dots, hyphens and apostrophes.' } }, { required: true, locked: true }),
    field('dob', 'Date of Birth', { type: 'date', notFuture: true }, { required: true, locked: true }),
    field('gender', 'Gender', { type: 'dropdown', options: ['Male', 'Female'] }, { required: true, locked: true }),
    field('aadharNumber', 'Aadhar Number', { type: 'text', normalize: 'digits', pattern: '^\\d{12}$', checksum: 'verhoeff',
      errorMessages: { pattern: 'Aadhar number must be a 12-digit number.', checksum: "This isn't a valid Aadhar number — please re-check the digits." } }),
    field('admissionClass', 'First Enrolled Class', { type: 'classRef' }, { group: 'admission' }),
    field('admissionFee', 'Admission Fee (₹)', { type: 'number', min: 0 }, { group: 'admission' }),
    field('feesConcession', 'Fees Concession (₹)', { type: 'number', integer: true, min: 0 }, { group: 'admission' }),
    // A school-added field: validated and worded by TYPE, never by name.
    field('bloodGroup', 'Blood Group', { type: 'dropdown', options: ['A+', 'O-'] }, { required: true, isCustom: true })
  ],
  options: { gender: ['Male', 'Female'] }
};

const OPTIONS: StudentFilterOptions = {
  classes: [{ _id: 'c8'.padEnd(24, '0'), class: 8, label: '8th', hasStreams: false, sections: [], streams: [] }],
  groups: []
};
const C8 = OPTIONS.classes[0]._id;
// A valid Aadhaar (Verhoeff check digit 6).
const AADHAR = '234123412346';

describe('StudentFormComponent', () => {
  let fixture: ComponentFixture<StudentFormComponent>;
  let form: StudentFormComponent;
  let feeQuote: FeeQuote;
  let admissionApi: jasmine.SpyObj<AdmissionService>;

  const init = (mode: 'create' | 'edit' | 'admission' = 'create', detail: StudentDetail | null = null): void => {
    form.mode = mode;
    form.detail = detail;
    form.ngOnChanges({ fieldConfig: new SimpleChange(null, FIELD_CONFIG, true) });
  };
  const fillValid = (): void => {
    form.set('name', 'Rohan Kapoor');
    form.set('dob', '2013-03-12');
    form.set('gender', 'Male');
    form.set('bloodGroup', 'O-');
    form.onClassChange(C8);
  };

  beforeEach(async () => {
    feeQuote = { found: true, admissionFee: 2000, totalFee: 40000, reasonThresholdPercent: 50, reasonRequiredAbove: 20000 };
    admissionApi = jasmine.createSpyObj<AdmissionService>('AdmissionService', ['getFeeQuote']);
    admissionApi.getFeeQuote.and.callFake(() => of(feeQuote));
    await TestBed.configureTestingModule({
      declarations: [StudentFormComponent],
      imports: [ReactiveFormsModule],
      providers: [{ provide: AdmissionService, useValue: admissionApi }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(StudentFormComponent);
    form = fixture.componentInstance;
    form.adminId = 'a1';
    form.session = '2026-2027';
    form.fieldConfig = FIELD_CONFIG;
    form.filterOptions = OPTIONS;
    init();
  });

  it('shows no error on a field nobody has touched yet', () => {
    expect(form.error('name')).toBe('');
    expect(form.error('gender')).toBe('');
  });

  it("words errors like the server: the field's own override, else a template by type", () => {
    form.touch('name');
    expect(form.error('name')).toBe('Name is required.');
    form.set('aadharNumber', '123');
    form.touch('aadharNumber');
    expect(form.error('aadharNumber')).toBe('Aadhar number must be a 12-digit number.');
    form.set('bloodGroup', 'Z+');
    form.touch('bloodGroup');
    expect(form.error('bloodGroup')).toBe('Blood Group must be one of: A+, O-.');
  });

  it('accepts regional and punctuated names the old a-z pattern rejected', () => {
    ["D'Souza", 'Mary-Jane', 'A. Kumar', 'कमला देवी', 'தமிழ் செல்வி'].forEach((name) => {
      form.set('name', name);
      form.touch('name');
      expect(form.error('name')).withContext(name).toBe('');
    });
    form.set('name', 'R0han');
    expect(form.error('name')).toBe('Name can only contain letters, spaces, dots, hyphens and apostrophes.');
  });

  it('normalizes spaces/dashes before the pattern, and checks the Aadhaar checksum', () => {
    form.set('aadharNumber', '2341 2341-2346');
    form.touch('aadharNumber');
    expect(form.error('aadharNumber')).toBe('');
    form.set('aadharNumber', '234123412345');
    expect(form.error('aadharNumber')).toBe("This isn't a valid Aadhar number — please re-check the digits.");
  });

  it('waits for a pause in typing before showing a pattern error (debounced, not per keystroke)', fakeAsync(() => {
    form.touch('aadharNumber');
    form.onInput('aadharNumber', { target: { value: '12' } } as unknown as Event);
    expect(form.error('aadharNumber')).toBe('');
    tick(VALIDATION_DEBOUNCE_MS - 50);
    form.onInput('aadharNumber', { target: { value: '123' } } as unknown as Event);
    tick(VALIDATION_DEBOUNCE_MS - 50);
    expect(form.error('aadharNumber')).toBe('');
    tick(60);
    expect(form.error('aadharNumber')).toBe('Aadhar number must be a 12-digit number.');
  }));

  it('shows the error at once on blur — leaving the field ends the debounce', fakeAsync(() => {
    form.onInput('aadharNumber', { target: { value: '12' } } as unknown as Event);
    form.touch('aadharNumber');
    expect(form.error('aadharNumber')).toBe('Aadhar number must be a 12-digit number.');
    tick(VALIDATION_DEBOUNCE_MS);
  }));

  it('points every invalid control at its error: aria-invalid + aria-describedby', () => {
    fixture.detectChanges();
    form.set('aadharNumber', '12');
    form.touch('aadharNumber');
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#f-aadharNumber');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('err-aadharNumber');
    expect(fixture.nativeElement.querySelector('#err-aadharNumber').textContent).toContain('12-digit');
  });

  it('on a failed submit: every field touched, a summary banner, focus on the first problem', fakeAsync(() => {
    fixture.detectChanges();
    expect(form.buildPayload()).toBeNull();
    fixture.detectChanges();
    expect(form.error('gender')).toBe('Gender is required.');
    expect(form.error('classId')).toBe('Class is required.');
    const banner: HTMLElement = fixture.nativeElement.querySelector('.form-summary');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain(`${form.submitErrorCount} fields need your attention`);
    tick();
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
  }));

  it("renders and validates a school's custom field, and sends it", () => {
    fixture.detectChanges();
    expect((Array.from(fixture.nativeElement.querySelectorAll('.group-title')) as HTMLElement[]).pop()?.textContent).toContain('Additional Info');
    fillValid();
    form.set('bloodGroup', '');
    expect(form.buildPayload()).toBeNull();
    expect(form.error('bloodGroup')).toBe('Blood Group is required.');
    form.set('bloodGroup', 'O-');
    expect(form.buildPayload()?.get('bloodGroup')).toBe('O-');
  });

  it('sends dates as ISO values and First Enrolled Class as a class id', () => {
    fillValid();
    form.set('admissionClass', C8);
    const body = form.buildPayload();
    expect(body?.get('dob')).toBe('2013-03-12');
    expect(body?.get('classId')).toBe(C8);
    expect(body?.get('admissionClass')).toBe(C8);
    expect(body?.get('session')).toBe('2026-2027');
  });

  describe('admission-time fee', () => {
    beforeEach(() => init('admission'));

    it("takes the admission fee from the class's Fee Structure — never typed, never sent", () => {
      fillValid();
      expect(admissionApi.getFeeQuote).toHaveBeenCalledWith('a1', jasmine.objectContaining({ session: '2026-2027', classId: C8 }));
      expect(form.value('admissionFee')).toBe('2000');
      expect(form.feeTotalLabel).toBe('₹40,000');
      expect(form.buildPayload()?.has('admissionFee')).toBe(false);
    });

    it('rejects a concession above the total fee (CONCESSION_EXCEEDS_FEE)', () => {
      fillValid();
      form.onInput('feesConcession', { target: { value: '45000' } } as unknown as Event);
      expect(form.error('feesConcession')).toBe("Concession can't be greater than the total fee (₹40,000).");
      expect(form.buildPayload()).toBeNull();
    });

    it('asks for a reason above the threshold, and sends it', () => {
      fillValid();
      form.onInput('feesConcession', { target: { value: '25000' } } as unknown as Event);
      expect(form.concessionNeedsReason).toBe(true);
      expect(form.buildPayload()).toBeNull();
      expect(form.error('concessionReason')).toContain('needs a reason');
      form.set('concessionReason', 'Sibling concession');
      expect(form.buildPayload()?.get('concessionReason')).toBe('Sibling concession');
    });

    it('says so when the class has no Fee Structure yet — the admission can still be saved', () => {
      feeQuote = { found: false, code: 'FEE_STRUCTURE_MISSING', message: 'No fee structure is set up for this class in 2026-2027 yet.' };
      fillValid();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.fee-note.warn')?.textContent).toContain('No fee structure');
      expect(form.buildPayload()).not.toBeNull();
    });
  });

  it('locks admission fee + concession once a fee record exists (Fees-module truth)', () => {
    const detail = {
      student: { _id: 's1', name: 'Rohan', admissionNo: 1, status: 'admitted', photoUrl: null, card: null, verifyMode: 4, gender: 'Male', dob: '2013-03-12T00:00:00.000Z' },
      placement: null,
      feeRecord: { totalFee: 40000, concession: 5000, admissionFee: 2000, payable: 35000, concessionReason: null }
    } as unknown as StudentDetail;
    init('edit', detail);
    form.set('bloodGroup', 'O-');
    expect(form.feesLocked).toBe(true);
    expect(form.value('feesConcession')).toBe('5000');
    expect(form.buildPayload()?.has('feesConcession')).toBe(false);
  });

  it('shows a server error in the same slot, and clears it when the field is edited', () => {
    form.serverErrors = { aadharNumber: 'This Aadhar number is already registered.' };
    expect(form.error('aadharNumber')).toBe('This Aadhar number is already registered.');
    form.set('aadharNumber', AADHAR);
    expect(form.error('aadharNumber')).toBe('');
  });
});
