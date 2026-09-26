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
  /** Masked server-side ("•• 8821"); null = not assigned. */
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
  admissionSession: string;
  name: string;
  photoUrl: string | null;
  medium?: string;
  admissionClass?: number | null;
  doa?: string | null;
  admissionFee?: number | null;
  feesConcession?: number | null;
  lastSchool?: string;
  dob?: string | null;
  gender?: string;
  category?: string;
  religion?: string;
  nationality?: string;
  aadharNumber?: string;
  samagraId?: string;
  udiseNumber?: string;
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
  /** Masked. */
  card: string | null;
  verifyMode: number;
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

export interface StudentDetail {
  student: StudentProfile;
  placement: StudentPlacement | null;
}

/* --- FieldConfig (Settings → Admission Form Fields; defaults until that module lands) --- */

export type FieldType = 'text' | 'number' | 'date' | 'enum' | 'phone';
export type FieldGroup = 'admission' | 'student' | 'parents';

export interface FieldConfigField {
  fieldKey: string;
  label: string;
  group: FieldGroup;
  type: FieldType;
  required: boolean;
  visible: boolean;
  locked: boolean;
  validationRule: {
    options?: string[];
    pattern?: string;
    patternMessage?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
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
}

export interface MessageResponse {
  message: string;
  id?: string;
}
