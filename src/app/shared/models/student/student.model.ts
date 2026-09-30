/**
 * Student module types shared by its three pages and its shared components (the cascade
 * filter, the student form, the profile view). Mirrors backend/modules/models/student/
 * and the shapes helpers/student/student.utils.js returns.
 *
 * Profile and placement are separate on purpose, exactly like the backend: a student's
 * class/stream/section/roll live on a session-scoped enrollment, never on the profile.
 */

export type AdmissionStatus = 'pending' | 'admitted';

/** One row of Manage Students / Admission — exactly the columns those tables render. */
export interface StudentListRow {
  enrollmentId: string;
  studentId: string;
  name: string;
  /** null = "Not yet issued" (a Pending admission), not a display quirk. */
  admissionNo: number | null;
  status: AdmissionStatus;
  photoUrl: string | null;
  fatherName: string | null;
  motherName: string | null;
  contact: string | null;
  /** The card number IN FULL — an operational identifier, not masked; null = not assigned. */
  card: string | null;
  rollNumber: number | null;
  session: string;
  classId: string;
  streamId: string | null;
  groupId: string | null;
  sectionId: string | null;
  className: string;
  streamName: string | null;
  sectionName: string | null;
  /** "8th · A" / "11th · Science · A" */
  classTag: string;
  placementIncomplete: boolean;
}

/** Keyset page: `nextCursor` is the last row's enrollment id, null on the last page. */
export interface StudentListResponse {
  rows: StudentListRow[];
  nextCursor: string | null;
  total: number;
}

/** The full profile, as GET /students/:id returns it. */
export interface StudentProfile {
  _id: string;
  admissionNo: number | null;
  status: AdmissionStatus;
  name: string;
  photoUrl: string | null;
  medium?: string;
  /** First Enrolled Class — an Academic Setup class id. */
  admissionClass?: string | null;
  /** That class's label ("8th"), resolved server-side for display. */
  admissionClassLabel?: string | null;
  doa?: string | null;
  admissionFee?: number | null;
  feesConcession?: number | null;
  lastSchool?: string;
  dob?: string | null;
  gender?: string;
  category?: string;
  religion?: string;
  nationality?: string;
  /** Masked ("XXXX-XXXX-9067") unless read with purpose=edit or revealed. */
  aadharNumber?: string;
  samagraId?: string;
  /** PEN — Permanent Education Number (UDISE+), per student. */
  penNumber?: string;
  bankAccountNo?: string;
  bankIfscCode?: string;
  address?: string;
  fatherName?: string;
  fatherQualification?: string;
  fatherOccupation?: string;
  motherName?: string;
  motherQualification?: string;
  motherOccupation?: string;
  familyAnnualIncome?: number | null;
  parentsContact?: string;
  /** In full. */
  card: string | null;
  verifyMode: number;
  /** Values of the school's custom FieldConfig fields, by fieldKey. */
  extraFields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StudentPlacement {
  enrollmentId: string;
  session: string;
  classId: string;
  class: number;
  streamId: string | null;
  groupId: string | null;
  sectionId: string | null;
  rollNumber: number | null;
  entryType: string;
  placementIncomplete: boolean;
  className: string;
  streamName: string | null;
  sectionName: string | null;
  groupName: string | null;
}

/** The student's fee ledger entry (Fees module truth once it exists). */
export interface StudentFeeRecord {
  totalFee: number;
  concession: number;
  admissionFee: number;
  payable: number;
  concessionReason: string | null;
}

export interface StudentDetail {
  student: StudentProfile;
  placement: StudentPlacement | null;
  feeRecord?: StudentFeeRecord | null;
}

/** The identifiers View Profile shows masked, each with its own logged reveal. */
export type SensitiveField = 'aadharNumber' | 'bankAccountNo' | 'bankIfscCode' | 'penNumber';

export interface RevealResponse {
  field: SensitiveField;
  value: string | null;
}

/** GET /admissions/fee-quote — the fee panel for a chosen placement. */
export type FeeQuote =
  | { found: true; admissionFee: number; totalFee: number; reasonThresholdPercent: number; reasonRequiredAbove: number }
  | { found: false; code: 'FEE_STRUCTURE_MISSING'; message: string };

/* --- FieldConfig (Settings → Admission Form Fields; defaults until that module lands) --- */

/**
 * A FieldConfig rule's type. The first eight are what a school's custom field may use;
 * `classRef` is platform-only (First Enrolled Class).
 */
export type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'email' | 'phone' | 'boolean' | 'file' | 'classRef';
export type FieldGroup = string;

/** One field's rule — interpreted by type (utils/field-rules.util.ts), never by field name. */
export interface FieldRule {
  type: FieldType;
  options?: string[];
  pattern?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  minLength?: number;
  maxLength?: number;
  notFuture?: boolean;
  minAgeYears?: number;
  /** 'digits' strips spaces/dashes before checking; 'upper' upper-cases. */
  normalize?: 'digits' | 'upper';
  checksum?: 'verhoeff';
  allowedMimeTypes?: string[];
  maxSizeMB?: number;
  /** The school's own wording for a failure key (required / pattern / min / …). */
  errorMessages?: Partial<Record<string, string>>;
  errorCodes?: Partial<Record<string, string>>;
}

export interface FieldConfigField {
  fieldKey: string;
  label: string;
  group: FieldGroup;
  required: boolean;
  visible: boolean;
  locked: boolean;
  /** A school-added field — rendered in "Additional Info", stored under extraFields. */
  isCustom?: boolean;
  stateSpecific?: string | null;
  validationRule: FieldRule;
}

export interface FieldConfigResponse {
  fields: FieldConfigField[];
  options: Record<string, string[]>;
}

/* --- Cascade filter data (GET /filter-options) --- */

export interface FilterSection {
  _id: string;
  name: string;
}

export interface FilterStream {
  _id: string;
  /** Stored lowercase ("science"). */
  name: string;
  sections: FilterSection[];
}

export interface FilterClass {
  _id: string;
  class: number;
  label: string;
  hasStreams: boolean;
  sections: FilterSection[];
  streams: FilterStream[];
}

export interface FilterGroup {
  _id: string;
  name: string;
  classId: string;
  streamId: string | null;
}

export interface StudentFilterOptions {
  classes: FilterClass[];
  groups: FilterGroup[];
}

/** What the cascade filter emits. '' means "All". */
export interface CascadeFilterValue {
  classId: string;
  streamId: string;
  groupId: string;
  sectionId: string;
}

export const EMPTY_CASCADE: CascadeFilterValue = { classId: '', streamId: '', groupId: '', sectionId: '' };

/* --- Background jobs (Excel import, card sync, promotion) --- */

export type JobState = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed' | 'unknown' | string;

export interface JobStatus<T = unknown> {
  jobId: string;
  name: string;
  state: JobState;
  progress: number;
  result: T | null;
  error: string | null;
}

/** 202 response of every endpoint that enqueues a job. */
export interface QueuedResponse {
  message: string;
  jobId: string;
  /** e.g. COLUMNS_UNRECOGNIZED on an import — said once for the file. */
  warning?: SaveWarning & { headers?: string[] } | null;
}

/** A save that succeeded with a caveat — e.g. IMAGE_UPLOAD_FAILED: record saved, photo not. */
export interface SaveWarning {
  code: string;
  message: string;
}

export interface MessageResponse {
  message: string;
  id?: string;
  /** Every save-with-a-caveat (IMAGE_UPLOAD_FAILED, FEE_STRUCTURE_MISSING). */
  warnings?: SaveWarning[];
  /** The first of `warnings` — kept for older callers. */
  warning?: SaveWarning | null;
  /** Write-back: the saved record as a list row, so the page patches its table in place. */
  student?: StudentListRow | null;
}

/** One record a bulk action could not process (error-catalog-conventions.md, shape #7). */
export interface BulkRowResult {
  id?: string;
  studentId?: string;
  code: string;
  message: string;
}
