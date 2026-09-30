/**
 * app-student-form — the long, grouped student form, built ONCE and used by Manage
 * Students (Create / Update) and Admission (New Admission).
 *
 * FieldConfig-driven: which fields show, which are required and each field's rule come
 * from GET /api/v2/student/field-config — the same config the server validator and the
 * Excel import read (settings/admission-form-fields.md). Rules are interpreted BY TYPE
 * (utils/field-rules.util.ts, the mirror of the server's buildJoiSchema), so a school's
 * custom field gets a control, validation and wording exactly like a seeded one; custom
 * fields render in their own "Additional Info" group. The server re-validates everything
 * and its field errors are bound back through `serverErrors`.
 *
 * Every categorical field is an app-dd (never a native select) and every date an app-dp
 * (never a native date input). Errors follow design-system.md's Form validation state: a
 * field shows its error once touched (blurred, or its dd/dp closed), and after that
 * re-validates as the person types — but only once they PAUSE (debounced, student/errors.md:
 * never flashing on/off per keystroke). Submit touches everything, shows a summary banner
 * ("N fields need your attention") and moves focus to the first invalid field. Every
 * invalid control carries aria-invalid + aria-describedby → its error's id.
 *
 * Admission-time fee (student-fix4.md E): for a new student the chosen placement's Fee
 * Structure supplies the admission fee and total — never typed — and the concession is
 * checked against that total, with a reason required above the school's threshold. Once a
 * fee record exists (edit), fee fields are read-only: they're Fees-module truth.
 *
 * The host page owns the modal (app-form-modal) and calls `buildPayload()` on Submit; this
 * component owns the fields.
 *
 * Placement follows the Student/Enrollment split:
 *   - create/admission: Class → Stream → Group → Section are chosen here.
 *   - edit: Class/Stream are read-only (Class Promotion moves students); Section and Roll
 *     Number are editable; Stream + Group unlock only while the enrollment is
 *     placementIncomplete (a promotion into 11th/12th that still needs them).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import {
  FeeQuote, FieldConfigField, FieldConfigResponse, FilterClass, StudentDetail, StudentFilterOptions
} from 'src/app/shared/models/student/student.model';
import { AdmissionService } from 'src/app/shared/services/student/admission.service';
import { buildMessage, failureOf, fieldValidator, prepareValue } from 'src/app/shared/utils/field-rules.util';

export type StudentFormMode = 'create' | 'edit' | 'admission';

/** Largest photo the server accepts (middleware/single-upload.js imageFile). */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
/** How long typing must pause before a pattern error shows (student/errors.md: 150–300ms). */
export const VALIDATION_DEBOUNCE_MS = 250;

const PLACEMENT_KEYS = ['classId', 'streamId', 'groupId', 'sectionId'] as const;
/** Not FieldConfig fields, but still keyboard-focusable controls with their own errors. */
const EXTRA_KEYS = ['concessionReason'] as const;

const titleCase = (text: string): string => (text || '').replace(/\b\w/g, (c) => c.toUpperCase());
const pad = (n: number): string => String(n).padStart(2, '0');
const rupees = (amount: number): string => '₹' + Number(amount || 0).toLocaleString('en-IN');

/** A stored date (ISO timestamp at UTC midnight) → the 'YYYY-MM-DD' app-dp works in. */
const toIsoDate = (value: unknown): string => {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ''
    : `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

@Component({
  selector: 'app-student-form',
  templateUrl: './student-form.component.html',
  styleUrls: ['./student-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudentFormComponent implements OnChanges, OnDestroy {
  @Input() mode: StudentFormMode = 'create';
  @Input() adminId = '';
  @Input() session = '';
  @Input() detail: StudentDetail | null = null;
  @Input() filterOptions: StudentFilterOptions | null = null;
  @Input() fieldConfig: FieldConfigResponse | null = null;
  /** Field → message, straight from a ValidationError's `fields`. */
  @Input() serverErrors: Record<string, string> = {};

  form = new FormGroup<Record<string, FormControl<string>>>({});
  /**
   * Messages for things that are not a config field's own control: the photo, the
   * placement pickers' required checks, and the fee checks.
   */
  clientErrors: Record<string, string> = {};
  /** Set by a Submit that found problems: how many fields need attention. */
  submitErrorCount = 0;
  /** Dates can't be in the future (DOB) — the dp greys out later days. */
  readonly today = localToday();

  photoFile: File | null = null;
  photoPreview: string | null = null;

  /** The school's own custom fields, in config order — the "Additional Info" group. */
  customFields: FieldConfigField[] = [];
  /** Fee panel for the chosen placement (create/admission). null = nothing chosen yet. */
  feeQuote: FeeQuote | null = null;
  feeQuoteLoading = false;
  feeQuoteError = '';

  /** Field config by key — O(1) per template lookup. */
  private fields = new Map<string, FieldConfigField>();
  private classById = new Map<string, FilterClass>();
  /** Keys still being typed in — their error waits until the pause. */
  private typing = new Set<string>();
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private feeQuoteSub?: Subscription;
  private feeQuoteKey = '';

  classOptions: DdOption[] = [];
  streamOptions: DdOption[] = [];
  groupOptions: DdOption[] = [];
  sectionOptions: DdOption[] = [];
  admissionClassOptions: DdOption[] = [];
  enumOptions: Record<string, DdOption[]> = {};
  /** Dropdown options per custom field (dropdown and boolean types). */
  customOptions: Record<string, DdOption[]> = {};

  constructor(
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
    private admissionApi: AdmissionService
  ) {}

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

  /** Once a fee record exists, admission fee and concession are Fees-module truth. */
  get feesLocked(): boolean {
    return this.isEdit && Boolean(this.detail?.feeRecord);
  }

  /** The concession needs a written reason (only knowable once a fee structure is found). */
  get concessionNeedsReason(): boolean {
    const quote = this.feeQuote;
    if (this.isEdit || !quote || !quote.found) return false;
    return this.concessionAmount() > quote.reasonRequiredAbove;
  }

  get feeTotalLabel(): string {
    return this.feeQuote && this.feeQuote.found ? rupees(this.feeQuote.totalFee) : '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fieldConfig'] || changes['filterOptions'] || changes['detail'] || changes['mode']) {
      const all = this.fieldConfig?.fields || [];
      this.fields = new Map(all.map((field) => [field.fieldKey, field]));
      this.customFields = all.filter((field) => field.isCustom && (field.visible || field.locked));
      this.classById = new Map((this.filterOptions?.classes || []).map((item) => [item._id, item]));
      this.buildForm();
      this.buildStaticOptions();
      this.rebuildPlacementOptions();
      this.refreshFeeQuote();
    }
  }

  ngOnDestroy(): void {
    this.typingTimers.forEach((timer) => clearTimeout(timer));
    this.feeQuoteSub?.unsubscribe();
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

  /**
   * The one message a field shows, in priority order: a server error for it, a client-only
   * check (photo/placement/fee), then — once the control is touched and typing has paused —
   * its own rule result, worded like the server's. Never shown for an untouched field.
   */
  error(key: string): string {
    if (this.serverErrors[key]) return this.serverErrors[key];
    if (this.clientErrors[key]) return this.clientErrors[key];
    const control = this.form.controls[key];
    if (!control || !control.touched || control.valid || this.typing.has(key)) return '';
    const field = this.fields.get(key);
    const failure = failureOf(control.errors);
    if (!field || !failure) return '';
    return buildMessage(field, failure);
  }

  /** `aria-describedby` for a control: its error's id, only while there is an error. */
  describedBy(key: string): string | null {
    return this.error(key) ? 'err-' + key : null;
  }

  trackByField = (_index: number, field: FieldConfigField): string => field.fieldKey;

  /** Marks a control touched — bound to inputs' blur and to every dd/dp `closed`. */
  touch(key: string): void {
    // Leaving the field ends "still typing": its result shows now, not after the debounce.
    this.settle(key);
    this.form.controls[key]?.markAsTouched();
    this.cdr.markForCheck();
  }

  value(key: string): string {
    return this.form.controls[key]?.value || '';
  }

  set(key: string, value: string): void {
    this.form.controls[key]?.setValue(value);
    delete this.clientErrors[key];
    // Editing a field the server rejected clears that rejection — its new value hasn't been
    // judged yet, and a stale red message would contradict what the person just typed.
    if (this.serverErrors[key]) this.serverErrors = { ...this.serverErrors, [key]: '' };
    if (this.submitErrorCount) this.submitErrorCount = this.countErrors();
  }

  /** Typing: the value updates at once, its error waits for a pause in typing. */
  onInput(key: string, event: Event): void {
    this.set(key, (event.target as HTMLInputElement).value);
    this.typing.add(key);
    const pending = this.typingTimers.get(key);
    if (pending) clearTimeout(pending);
    this.typingTimers.set(key, setTimeout(() => {
      this.settle(key);
      this.cdr.markForCheck();
    }, VALIDATION_DEBOUNCE_MS));
    if (key === 'feesConcession') this.checkConcession();
  }

  private settle(key: string): void {
    this.typing.delete(key);
    const pending = this.typingTimers.get(key);
    if (pending) clearTimeout(pending);
    this.typingTimers.delete(key);
  }

  // --- placement ------------------------------------------------------------------------

  onClassChange(classId: string): void {
    this.set('classId', classId);
    ['streamId', 'groupId', 'sectionId'].forEach((key) => this.set(key, ''));
    this.rebuildPlacementOptions();
    this.refreshFeeQuote();
  }

  onStreamChange(streamId: string): void {
    this.set('streamId', streamId);
    this.set('groupId', '');
    // A stream change in edit mode keeps no section of the old stream.
    this.set('sectionId', '');
    this.rebuildPlacementOptions();
    this.refreshFeeQuote();
  }

  onGroupChange(groupId: string): void {
    this.set('groupId', groupId);
    this.refreshFeeQuote();
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

  // --- admission-time fee -------------------------------------------------------------

  /**
   * Re-read the Fee Structure for the current placement (new students only). Skipped until
   * a class — and, for a streamed class, its stream — is chosen, and when nothing changed.
   */
  private refreshFeeQuote(): void {
    if (this.isEdit || !this.adminId || !this.session) return;
    const chosen = this.selectedClass;
    const classId = this.value('classId');
    const streamId = this.value('streamId');
    const groupId = this.value('groupId');
    const ready = Boolean(chosen) && (!chosen?.hasStreams || Boolean(streamId));
    const key = ready ? [classId, streamId, groupId].join('|') : '';
    if (key === this.feeQuoteKey) return;
    this.feeQuoteKey = key;
    this.feeQuoteSub?.unsubscribe();
    this.feeQuote = null;
    this.feeQuoteError = '';
    if (!ready) return;

    this.feeQuoteLoading = true;
    this.feeQuoteSub = this.admissionApi.getFeeQuote(this.adminId, {
      session: this.session, classId, streamId: streamId || undefined, groupId: groupId || undefined
    }).subscribe((quote) => {
      this.feeQuote = quote;
      this.feeQuoteLoading = false;
      if (quote.found) this.form.controls['admissionFee']?.setValue(String(quote.admissionFee));
      this.checkConcession();
      this.cdr.markForCheck();
    }, () => {
      // Its own error state — a failed fetch is never shown as "no fee structure".
      this.feeQuoteLoading = false;
      this.feeQuoteError = "Couldn't load this class's fee. The server still checks the concession on save.";
      this.cdr.markForCheck();
    });
  }

  retryFeeQuote(): void {
    this.feeQuoteKey = '';
    this.refreshFeeQuote();
  }

  private concessionAmount(): number {
    const field = this.fields.get('feesConcession');
    const text = field ? prepareValue(field.validationRule, this.value('feesConcession')) : this.value('feesConcession');
    return Number(text) || 0;
  }

  /** Cross-field, live: concession ≤ the fee structure's total (CONCESSION_EXCEEDS_FEE). */
  private checkConcession(): void {
    const quote = this.feeQuote;
    if (quote && quote.found && this.concessionAmount() > quote.totalFee) {
      this.clientErrors['feesConcession'] = `Concession can't be greater than the total fee (${rupees(quote.totalFee)}).`;
    } else if (this.clientErrors['feesConcession']?.startsWith("Concession can't")) {
      delete this.clientErrors['feesConcession'];
    }
  }

  // --- photo ----------------------------------------------------------------------------

  onPhotoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      this.clientErrors['photo'] = 'Only JPG/PNG images are allowed.';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.clientErrors['photo'] = 'Image must be under 2MB.';
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
    const extra = (student?.extraFields || {}) as Record<string, unknown>;

    (this.fieldConfig?.fields || []).forEach((field) => {
      let initial = '';
      const raw = student ? (field.isCustom ? extra[field.fieldKey] : student[field.fieldKey]) : undefined;
      if (field.fieldKey === 'rollNumber') initial = placement?.rollNumber != null ? String(placement.rollNumber) : '';
      else if (field.validationRule?.type === 'date') initial = toIsoDate(raw);
      else if (raw !== undefined && raw !== null) initial = String(raw);
      controls[field.fieldKey] = new FormControl<string>(initial, { nonNullable: true, validators: [fieldValidator(field)] });
    });
    if (this.feesLocked && this.detail?.feeRecord) {
      controls['admissionFee']?.setValue(String(this.detail.feeRecord.admissionFee));
      controls['feesConcession']?.setValue(String(this.detail.feeRecord.concession));
    }

    PLACEMENT_KEYS.forEach((key) => {
      controls[key] = new FormControl<string>((placement && placement[key]) || '', { nonNullable: true });
    });
    EXTRA_KEYS.forEach((key) => { controls[key] = new FormControl<string>('', { nonNullable: true }); });

    this.form = new FormGroup(controls);
    this.clientErrors = {};
    this.submitErrorCount = 0;
    this.typing.clear();
    this.photoFile = null;
    this.photoPreview = null;
    this.feeQuote = null;
    this.feeQuoteKey = '';
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
    // First Enrolled Class is a class REFERENCE — the same id placement uses.
    this.admissionClassOptions = (this.filterOptions?.classes || [])
      .map((item) => ({ value: item._id, label: item.label }));
    this.customOptions = {};
    this.customFields.forEach((field) => {
      if (field.validationRule.type === 'dropdown') this.customOptions[field.fieldKey] = toDd(field.validationRule.options);
      if (field.validationRule.type === 'boolean') this.customOptions[field.fieldKey] = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
    });
  }

  /** Every field currently showing an error — the summary banner's N. */
  private countErrors(): number {
    const keys = [...this.fields.keys(), ...PLACEMENT_KEYS, ...EXTRA_KEYS, 'photo'];
    return keys.filter((key) => this.isCollected(key) && this.error(key)).length;
  }

  /** Whether Submit checks/sends this key at all (hidden, locked or not-applicable don't). */
  private isCollected(key: string): boolean {
    if (!this.show(key)) return false;
    if (key === 'admissionNo' && this.admissionNoLocked) return false;
    if (key === 'admissionFee') return false;
    if (key === 'feesConcession' && this.feesLocked) return false;
    if (key === 'admissionClass' && this.mode === 'admission') return false;
    if (key === 'concessionReason') return this.concessionNeedsReason;
    return true;
  }

  /** After a failed Submit: the first invalid control gets focus (errors.md, accessibility). */
  private focusFirstInvalid(): void {
    setTimeout(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>(
        '[aria-invalid="true"], .is-invalid input, .is-invalid [tabindex]'
      );
      target?.focus();
    });
  }

  /**
   * Validate against the config-derived rules and return the multipart body, or null (with
   * the messages shown inline, the summary banner up and focus on the first problem) when
   * something needs fixing. The server validates again.
   */
  buildPayload(): FormData | null {
    const errors: Record<string, string> = {};
    // Submit touches every field at once, so one never visited still shows its error.
    this.typing.clear();
    this.form.markAllAsTouched();

    let invalid = false;
    this.fields.forEach((_field, key) => {
      if (!this.isCollected(key)) return;
      const control = this.form.controls[key];
      if (control && control.invalid) invalid = true;
    });

    if (!this.isEdit) {
      if (!this.value('classId')) errors['classId'] = 'Class is required.';
      else if (this.selectedClass?.hasStreams && !this.value('streamId')) errors['streamId'] = 'Stream is required.';
    }
    const quote = this.feeQuote;
    if (!this.isEdit && quote && quote.found && this.concessionAmount() > quote.totalFee) {
      errors['feesConcession'] = `Concession can't be greater than the total fee (${rupees(quote.totalFee)}).`;
    }
    if (this.concessionNeedsReason && this.value('concessionReason').trim().length < 3) {
      errors['concessionReason'] = `A concession above ${quote && quote.found ? quote.reasonThresholdPercent : 50}% of the total fee needs a reason.`;
    }
    if (this.clientErrors['photo']) errors['photo'] = this.clientErrors['photo'];

    this.clientErrors = errors;
    this.submitErrorCount = this.countErrors();
    this.cdr.markForCheck();
    if (invalid || Object.keys(errors).length) {
      this.focusFirstInvalid();
      return null;
    }

    const body = new FormData();
    body.append('adminId', this.adminId);
    body.append('session', this.detail?.placement?.session || this.session);

    this.fields.forEach((_field, key) => {
      // An issued Admission No. is never re-sent (it can't change); Admission Fee comes from
      // the Fee Structure; a locked concession is the Fees module's to change.
      if (!this.isCollected(key)) return;
      body.append(key, this.value(key).trim());
    });
    if (this.concessionNeedsReason) body.append('concessionReason', this.value('concessionReason').trim());

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
