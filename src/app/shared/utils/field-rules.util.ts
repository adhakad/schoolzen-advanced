/**
 * The FieldConfig rule interpreter, client side — the mirror of the backend's
 * buildJoiSchema()/buildMessage() in validators/student/field-config.validator.js.
 *
 * Keyed off `validationRule.type`, never a field name, so a school's custom field (a
 * "Blood Group" dropdown) is checked and worded exactly like a seeded one
 * (student/errors.md, "Dynamic (school-created custom) fields"). Same normalization, same
 * rule keys, same messages as the server — the server still re-validates everything.
 */
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { FieldConfigField, FieldRule } from 'src/app/shared/models/student/student.model';

/** Why a value failed — the same keys the backend's MESSAGE_KEY map produces. */
export type RuleFailure =
  | 'required' | 'pattern' | 'minLength' | 'maxLength' | 'min' | 'max'
  | 'notFuture' | 'options' | 'checksum' | 'invalid';

// --- Verhoeff (Aadhaar checksum) -------------------------------------------------------

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

export const verhoeffValid = (digits: string): boolean => {
  if (!/^\d+$/.test(digits)) return false;
  let check = 0;
  digits.split('').reverse().map(Number).forEach((digit, i) => { check = D[check][P[i % 8][digit]]; });
  return check === 0;
};

/**
 * 12 digits + a passing Verhoeff checksum (student/errors.md) — nothing more. A "first digit
 * 2–9" rule rejected ~1 in 5 checksum-valid numbers (student-fix5.md #1).
 */
export const isValidAadhaar = (value: string): boolean => /^\d{12}$/.test(value) && verhoeffValid(value);

const CHECKSUMS: Record<string, (value: string) => boolean> = { verhoeff: isValidAadhaar };

// --- normalization -----------------------------------------------------------------------

/** The value a person MEANT, before any rule runs ("1234 5678 9012" → "123456789012"). */
export const prepareValue = (rule: FieldRule, raw: string): string => {
  const text = (raw ?? '').toString().trim();
  if (rule.normalize === 'digits') return text.replace(/[\s-]/g, '');
  if (rule.normalize === 'upper') return text.toUpperCase();
  if (rule.type === 'number') return text.replace(/[,\s₹]/g, '');
  if (rule.type === 'phone') return text.replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
  return text;
};

const pad = (n: number): string => String(n).padStart(2, '0');
const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * The first rule a value breaks, or null. `value` is the control's raw string (dates are the
 * 'YYYY-MM-DD' app-dp works in).
 */
export const checkField = (field: FieldConfigField, raw: string): RuleFailure | null => {
  const rule = field.validationRule || ({ type: 'text' } as FieldRule);
  const value = prepareValue(rule, raw);
  if (!value) return field.required ? 'required' : null;

  switch (rule.type) {
    case 'number': {
      const num = Number(value);
      if (!Number.isFinite(num) || (rule.integer && !Number.isInteger(num))) return 'invalid';
      if (rule.min != null && num < rule.min) return 'min';
      if (rule.max != null && num > rule.max) return 'max';
      return null;
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'invalid';
      if (rule.notFuture && value > todayIso()) return 'notFuture';
      if (rule.minAgeYears) {
        const bound = new Date();
        bound.setFullYear(bound.getFullYear() - rule.minAgeYears);
        if (value > `${bound.getFullYear()}-${pad(bound.getMonth() + 1)}-${pad(bound.getDate())}`) return 'invalid';
      }
      return null;
    }
    case 'dropdown':
      return (rule.options || []).some((option) => option.toLowerCase() === value.toLowerCase()) ? null : 'options';
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'pattern';
    case 'phone':
      return /^[6-9]\d{9}$/.test(value) ? null : 'invalid';
    case 'boolean':
      return /^(true|false|yes|no)$/i.test(value) ? null : 'invalid';
    case 'classRef':
      return /^[a-f0-9]{24}$/i.test(value) ? null : 'invalid';
    default: {
      if (rule.minLength != null && value.length < rule.minLength) return 'minLength';
      if (rule.maxLength != null && value.length > rule.maxLength) return 'maxLength';
      // 'u': the name pattern uses \p{L} (Unicode letters) — without it, regional names fail.
      if (rule.pattern && !new RegExp(rule.pattern, 'u').test(value)) return 'pattern';
      if (rule.checksum && CHECKSUMS[rule.checksum] && !CHECKSUMS[rule.checksum](value)) return 'checksum';
      return null;
    }
  }
};

/**
 * The message for a failure: the field's own `errorMessages[key]` when the config carries
 * one, else a template by type — worded exactly like the server's buildMessage().
 */
export const buildMessage = (field: FieldConfigField, key: RuleFailure): string => {
  const rule = field.validationRule || ({ type: 'text' } as FieldRule);
  const custom = rule.errorMessages?.[key];
  if (custom) return custom;
  const label = field.label;
  switch (key) {
    case 'required': return `${label} is required.`;
    case 'minLength': return `${label} must be at least ${rule.minLength} characters.`;
    case 'maxLength': return `${label} must be at most ${rule.maxLength} characters.`;
    case 'min': return `${label} must be at least ${rule.min}.`;
    case 'max': return `${label} must be at most ${rule.max}.`;
    case 'notFuture': return `${label} can't be in the future.`;
    case 'options': return `${label} must be one of: ${(rule.options || []).join(', ')}.`;
    case 'checksum': return `Enter a valid ${label}.`;
    default:
      if (rule.type === 'date') return `Enter a valid ${label} (dd/mm/yyyy).`;
      if (rule.type === 'phone') return `${label} must be a 10-digit mobile number.`;
      if (rule.type === 'number') return `Enter a valid ${label} (numbers only).`;
      return `Enter a valid ${label}.`;
  }
};

/** One ValidatorFn per field, carrying the failure key as its error name. */
export const fieldValidator = (field: FieldConfigField): ValidatorFn =>
  (control: AbstractControl): ValidationErrors | null => {
    const failure = checkField(field, control.value || '');
    return failure ? { [failure]: true } : null;
  };

/** The failure key a control currently carries (the first, there is only ever one). */
export const failureOf = (errors: ValidationErrors | null): RuleFailure | null =>
  errors ? (Object.keys(errors)[0] as RuleFailure) : null;
