/**
 * app-student-form — the long, grouped student form, built ONCE and used by Manage
 * Students (Create / Update) and Admission (New Admission).
 *
 * FieldConfig-driven: which fields show, which are required and each field's rule come
 * from GET /api/v2/student/field-config — the same config the server validator and the
 * Excel import read (settings/admission-form-fields.md). The client-side checks here are a
 * convenience derived from that config, never a second rule set: the server re-validates
 * everything and its field errors are bound back through `serverErrors`.
 *
 * Every categorical field is an app-dd (never a native select). The host page owns the
 * modal (app-form-modal) and calls `buildPayload()` on Submit; this component owns the
 * fields.
 *
 * Placement follows the Student/Enrollment split:
 *   - create/admission: Class → Stream → Group → Section are chosen here.
 *   - edit: Class/Stream are read-only (Class Promotion moves students); Section and Roll
 *     Number are editable; Stream + Group unlock only while the enrollment is
 *     placementIncomplete (a promotion into 11th/12th that still needs them).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges
} from '@angular/core';
import { FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import {
  FieldConfigField, FieldConfigResponse, FilterClass, StudentDetail, StudentFilterOptions
} from 'src/app/shared/models/student/student.model';

export type StudentFormMode = 'create' | 'edit' | 'admission';

/** Largest photo the server accepts (helpers/file-upload.js studentImage). */
export const MAX_PHOTO_BYTES = 100 * 1024;

const PLACEMENT_KEYS = ['classId', 'streamId', 'groupId', 'sectionId'] as const;

const titleCase = (text: string): string => (text || '').replace(/\b\w/g, (c) => c.toUpperCase());
const pad = (n: number): string => String(n).padStart(2, '0');

/** ISO date from the API → the dd/mm/yyyy the inputs (and the validator) use. */
const toInputDate = (value: unknown): string => {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ''
    : `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
};

@Component({
  selector: 'app-student-form',
  templateUrl: './student-form.component.html',
  styleUrls: ['./student-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudentFormComponent implements OnChanges {
  @Input() mode: StudentFormMode = 'create';
  @Input() adminId = '';
  @Input() session = '';
  @Input() detail: StudentDetail | null = null;
  @Input() filterOptions: StudentFilterOptions | null = null;
  @Input() fieldConfig: FieldConfigResponse | null = null;
  /** Field → message, straight from a ValidationError's `fields`. */
  @Input() serverErrors: Record<string, string> = {};

  form = new FormGroup<Record<string, FormControl<string>>>({});
  /** Client-side messages, shown until the user edits the field. */
  clientErrors: Record<string, string> = {};

  photoFile: File | null = null;
  photoPreview: string | null = null;

  /** Field config by key — O(1) per template lookup. */
  private fields = new Map<string, FieldConfigField>();
  private classById = new Map<string, FilterClass>();

  classOptions: DdOption[] = [];
  streamOptions: DdOption[] = [];
  groupOptions: DdOption[] = [];
  sectionOptions: DdOption[] = [];
  admissionClassOptions: DdOption[] = [];
  enumOptions: Record<string, DdOption[]> = {};

  constructor(private cdr: ChangeDetectorRef) {}

  get isEdit(): boolean {
    return this.mode === 'edit';
  }

  /** Admission No. can be issued but never changed once it exists. */
  get admissionNoLocked(): boolean {
    return this.isEdit && this.detail?.student.admissionNo != null;
  }

  /** Stream/Group editable in edit mode only for an incomplete promotion placement. */
  get placementUnlocked(): boolean {
    return !this.isEdit || Boolean(this.detail?.placement?.placementIncomplete);
  }

  get selectedClass(): FilterClass | null {
    return this.classById.get(this.value('classId')) || null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fieldConfig'] || changes['filterOptions'] || changes['detail'] || changes['mode']) {
      this.fields = new Map((this.fieldConfig?.fields || []).map((field) => [field.fieldKey, field]));
      this.classById = new Map((this.filterOptions?.classes || []).map((item) => [item._id, item]));
      this.buildForm();
      this.buildStaticOptions();
      this.rebuildPlacementOptions();
    }
  }

  // --- template helpers -------------------------------------------------------------------

  /** A field renders unless the school hid it (locked fields can never be hidden). */
  show(key: string): boolean {
    const field = this.fields.get(key);
    return !field || field.visible || field.locked;
  }

  required(key: string): boolean {
    return Boolean(this.fields.get(key)?.required);
  }

  label(key: string, fallback: string): string {
    return this.fields.get(key)?.label || fallback;
  }

  error(key: string): string {
    return this.clientErrors[key] || this.serverErrors[key] || '';
  }

  value(key: string): string {
    return this.form.controls[key]?.value || '';
  }

  set(key: string, value: string): void {
    this.form.controls[key]?.setValue(value);
    delete this.clientErrors[key];
  }

  onInput(key: string, event: Event): void {
    this.set(key, (event.target as HTMLInputElement).value);
  }

  // --- placement ------------------------------------------------------------------------

  onClassChange(classId: string): void {
    this.set('classId', classId);
    ['streamId', 'groupId', 'sectionId'].forEach((key) => this.set(key, ''));
    this.rebuildPlacementOptions();
  }

  onStreamChange(streamId: string): void {
    this.set('streamId', streamId);
    this.set('groupId', '');
    // A stream change in edit mode keeps no section of the old stream.
    this.set('sectionId', '');
    this.rebuildPlacementOptions();
  }

  private rebuildPlacementOptions(): void {
    const chosen = this.selectedClass;
    const stream = chosen?.streams.find((item) => item._id === this.value('streamId')) || null;

    this.classOptions = (this.filterOptions?.classes || []).map((item) => ({ value: item._id, label: item.label }));
    this.streamOptions = (chosen?.streams || []).map((item) => ({ value: item._id, label: titleCase(item.name) }));

    const ready = Boolean(chosen) && (!chosen?.hasStreams || Boolean(stream));
    this.groupOptions = [{ value: '', label: '— None —' }].concat(ready
      ? (this.filterOptions?.groups || [])
          .filter((group) => group.classId === chosen?._id && (group.streamId || '') === (stream?._id || ''))
          .map((group) => ({ value: group._id, label: group.name }))
      : []);
    const sections = ready ? (chosen?.hasStreams ? stream?.sections || [] : chosen?.sections || []) : [];
    this.sectionOptions = [{ value: '', label: '— None —' }]
      .concat(sections.map((section) => ({ value: section._id, label: 'Section ' + section.name })));
  }

  // --- photo ----------------------------------------------------------------------------

  onPhotoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      this.clientErrors['photo'] = 'Only PNG or JPG images are allowed';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.clientErrors['photo'] = 'Photo must be 100KB or smaller';
      return;
    }
    delete this.clientErrors['photo'];
    this.photoFile = file;
    if (this.photoPreview) URL.revokeObjectURL(this.photoPreview);
    this.photoPreview = URL.createObjectURL(file);
    this.cdr.markForCheck();
  }

  // --- build ----------------------------------------------------------------------------

  private buildForm(): void {
    const controls: Record<string, FormControl<string>> = {};
    const student = this.detail?.student;
    const placement = this.detail?.placement;

    (this.fieldConfig?.fields || []).forEach((field) => {
      let initial = '';
      const raw = student ? student[field.fieldKey] : undefined;
      if (field.fieldKey === 'rollNumber') initial = placement?.rollNumber != null ? String(placement.rollNumber) : '';
      else if (field.type === 'date') initial = toInputDate(raw);
      else if (raw !== undefined && raw !== null) initial = String(raw);
      controls[field.fieldKey] = new FormControl<string>(initial, { nonNullable: true, validators: this.validatorsFor(field) });
    });

    PLACEMENT_KEYS.forEach((key) => {
      controls[key] = new FormControl<string>((placement && placement[key]) || '', { nonNullable: true });
    });

    this.form = new FormGroup(controls);
    this.clientErrors = {};
    this.photoFile = null;
    this.photoPreview = null;
  }

  private validatorsFor(field: FieldConfigField): ValidatorFn[] {
    const validators: ValidatorFn[] = [];
    if (field.required) validators.push(Validators.required);
    if (field.validationRule?.pattern) validators.push(Validators.pattern(field.validationRule.pattern));
    return validators;
  }

  private buildStaticOptions(): void {
    const options = this.fieldConfig?.options || {};
    const toDd = (list: string[] | undefined): DdOption[] => (list || []).map((item) => ({ value: item, label: item }));
    this.enumOptions = {
      medium: toDd(options['medium']),
      gender: toDd(options['gender']),
      category: toDd(options['category']),
      religion: toDd(options['religion']),
      nationality: toDd(options['nationality']),
      qualification: toDd(options['qualification']),
      occupation: toDd(options['occupation'])
    };
    this.admissionClassOptions = (this.filterOptions?.classes || [])
      .map((item) => ({ value: String(item.class), label: item.label }));
  }

  /**
   * Validate against the config-derived rules and return the multipart body, or null (with
   * the messages shown inline) when something is missing. The server validates again.
   */
  buildPayload(): FormData | null {
    const errors: Record<string, string> = {};

    this.fields.forEach((field, key) => {
      if (!this.show(key)) return;
      if (key === 'admissionNo' && this.admissionNoLocked) return;
      const control = this.form.controls[key];
      if (!control || control.valid) return;
      errors[key] = control.hasError('required')
        ? `${field.label} is required`
        : field.validationRule?.patternMessage || 'Invalid format';
    });

    if (!this.isEdit) {
      if (!this.value('classId')) errors['classId'] = 'Class is required';
      else if (this.selectedClass?.hasStreams && !this.value('streamId')) errors['streamId'] = 'Stream is required';
    }

    this.clientErrors = errors;
    this.cdr.markForCheck();
    if (Object.keys(errors).length) return null;

    const body = new FormData();
    body.append('adminId', this.adminId);
    body.append('session', this.detail?.placement?.session || this.session);

    this.fields.forEach((_field, key) => {
      if (!this.show(key)) return;
      // An issued Admission No. is never re-sent: it can't change, and sending it would
      // only ask the server to reject a no-op.
      if (key === 'admissionNo' && this.admissionNoLocked) return;
      // Admission Fee comes from the Fee Structure, not from this form.
      if (key === 'admissionFee') return;
      body.append(key, this.value(key).trim());
    });

    if (!this.isEdit) {
      PLACEMENT_KEYS.forEach((key) => body.append(key, this.value(key)));
    } else {
      body.append('sectionId', this.value('sectionId'));
      if (this.placementUnlocked) {
        body.append('streamId', this.value('streamId'));
        body.append('groupId', this.value('groupId'));
      }
    }

    if (this.photoFile) body.append('photo', this.photoFile, this.photoFile.name);
    return body;
  }
}
