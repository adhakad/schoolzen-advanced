import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { FieldConfigResponse, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { AdmissionService } from 'src/app/shared/services/student/admission.service';
import { StudentFormComponent } from './student-form.component';

// manage-students.md: the form's avatar circle opens the same picker as its button.
const CONFIG: FieldConfigResponse = {
  fields: [{
    fieldKey: 'name', label: 'Name', group: 'student', required: true, visible: true, locked: true,
    validationRule: { type: 'text', minLength: 2 }
  }],
  options: {}
};
const C1 = 'c1'.padEnd(24, '0');
const OPTIONS: StudentFilterOptions = {
  classes: [{ _id: C1, class: 1, label: '1st', hasStreams: false, sections: [], streams: [] }],
  groups: [{ _id: 'gen'.padEnd(24, '0'), name: 'General', classId: C1, streamId: null, isSystemGroup: true }]
};

describe('StudentFormComponent — photo', () => {
  let fixture: ComponentFixture<StudentFormComponent>;
  let form: StudentFormComponent;
  const el = (): HTMLElement => fixture.nativeElement;
  const input = (): HTMLInputElement => el().querySelector<HTMLInputElement>('.photo-upload input[type=file]')!;

  /** Puts `file` in the hidden input and fires its change, as a real pick does. */
  const pick = (file: File): void => {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input().files = transfer.files;
    input().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StudentFormComponent],
      imports: [ReactiveFormsModule],
      providers: [{ provide: AdmissionService, useValue: { getFeeQuote: () => of({ found: false }) } }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(StudentFormComponent);
    form = fixture.componentInstance;
    form.adminId = 'a1';
    form.session = '2026-2027';
    form.mode = 'create';
    form.fieldConfig = CONFIG;
    form.filterOptions = OPTIONS;
    form.ngOnChanges({ fieldConfig: new SimpleChange(null, CONFIG, true) });
    fixture.detectChanges();
  });

  it('opens the picker from the circle and from the button — JPG/PNG only', () => {
    const opened = spyOn(input(), 'click');
    el().querySelector<HTMLButtonElement>('button.photo-circle')!.click();
    el().querySelector<HTMLButtonElement>('button.photo-btn')!.click();
    expect(opened).toHaveBeenCalledTimes(2);
    expect(input().accept).toBe('image/png,image/jpeg');
  });

  it('previews a valid pick and sends it as `photo`', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:http://localhost/preview');
    pick(new File(['x'], 'me.png', { type: 'image/png' }));
    expect(el().querySelector<HTMLImageElement>('.photo-circle img')!.getAttribute('src')).toBe('blob:http://localhost/preview');
    form.set('name', 'Rohan Kapoor');
    form.onClassChange(C1);
    expect((form.buildPayload() as FormData | null)?.get('photo')).toEqual(jasmine.any(File));
  });

  it('rejects a non-image or an over-2MB file with its message, and keeps nothing', () => {
    pick(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(el().querySelector('.photo-error')!.textContent).toContain('Only JPG/PNG images are allowed.');
    expect(form.photoFile).toBeNull();

    pick(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }));
    expect(el().querySelector('.photo-error')!.textContent).toContain('Image must be under 2MB.');
    expect(form.photoFile).toBeNull();
  });
});
