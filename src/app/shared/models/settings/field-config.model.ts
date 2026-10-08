/** Settings → Admission Form Fields — the shapes of /api/v2/settings/admission-form-fields. */

export type FieldDisplayGroup = 'always' | 'student' | 'state' | 'parents' | 'parentsContact' | 'admission';
export type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'email' | 'phone' | 'boolean' | 'file' | 'classRef';

export interface FieldRule {
  type: FieldType;
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
  min?: number | null;
  max?: number | null;
  integer?: boolean | null;
  notFuture?: boolean | null;
  options?: string[] | null;
  [key: string]: unknown;
}

export interface FieldConfigRow {
  fieldKey: string;
  label: string;
  group: string;
  displayGroup: FieldDisplayGroup;
  required: boolean;
  visible: boolean;
  /** Name/DOB/Gender — always shown, always required. */
  locked: boolean;
  /** Admission No./Roll No. — shown with a disabled toggle. */
  fixed: boolean;
  isCustom: boolean;
  stateSpecific: string | null;
  validationRule: FieldRule;
  editableRuleKeys: string[];
  /** Students holding a value under this field — what FIELD_HAS_DATA reports. */
  dataCount: number;
  version: number;
}

export interface FieldConfigResponse {
  fields: FieldConfigRow[];
  schoolState: string | null;
  states: string[];
  groups: FieldDisplayGroup[];
  customGroups: string[];
  customTypes: FieldType[];
  summary: { total: number; custom: number };
}

export interface FieldChange {
  fieldKey: string;
  version: number;
  label?: string;
  required?: boolean;
  visible?: boolean;
  type?: string;
  validationRule?: Partial<FieldRule>;
  acknowledgeTypeChange?: boolean;
  acknowledgeOptionRemoval?: boolean;
}

export interface CreateFieldPayload {
  adminId: string;
  label: string;
  type: string;
  group: string;
  stateSpecific: string | null;
  required: boolean;
  visible: boolean;
  validationRule: Partial<FieldRule>;
}

export interface FieldImpact {
  dataCount: number;
  typeChange: { blocked: boolean; count: number; message: string } | null;
  optionRemoval: { removed: string[]; count: number; message: string } | null;
}
