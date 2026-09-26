/**
 * Class Promotion page types — mirrors controllers/student/class-promotion.controller.js.
 */

export type ExamResult = 'pass' | 'fail' | 'not-set';
export type PromotionDecision = 'promote' | 'detain';

/** One selectable Promote To placement ("9th - A", "11th - Science - A"). */
export interface PromotionTargetOption {
  key: string;
  label: string;
  classId: string;
  class: number;
  classLabel: string;
  streamId: string | null;
  sectionId: string | null;
  streamed: boolean;
}

export interface PromotionRosterRow {
  enrollmentId: string;
  studentId: string;
  rollNumber: number | null;
  name: string;
  admissionNo: number | null;
  photoUrl: string | null;
  examResult: ExamResult;
  /** Already has a next-session placement — confirm will skip them. */
  alreadyPlaced: boolean;
}

export interface PromotionRoster {
  session: string;
  nextSession: string;
  currentClass: { classId: string; label: string };
  defaultTargetKey: string | null;
  targetOptions: PromotionTargetOption[];
  rows: PromotionRosterRow[];
}

export interface PromotionDecisionPayload {
  enrollmentId: string;
  decision: PromotionDecision;
  /** Only for Promote — a Detain repeats the student's own placement server-side. */
  target?: { classId: string; streamId: string | null; groupId: string | null; sectionId: string | null };
}

export interface PromotionRequest {
  adminId: string;
  session: string;
  classId: string;
  streamId?: string;
  groupId?: string;
  sectionId?: string;
  decisions: PromotionDecisionPayload[];
}

export interface PromotionSummary {
  promoting: number;
  detaining: number;
  notDecided: number;
  total: number;
}

export interface PromotionWarning {
  type: 'stream-missing' | 'fee-structure-missing' | 'already-placed';
  message: string;
}

export interface PromotionPreview {
  nextSession: string;
  summary: PromotionSummary;
  warnings: PromotionWarning[];
}

export interface PromotionConfirmResponse extends PromotionPreview {
  message: string;
  jobId: string;
}

/** returnvalue of a promotion job. */
export interface PromotionResult {
  promoted: number;
  detained: number;
  skipped: number;
  incomplete: number;
  toSession: string;
}
