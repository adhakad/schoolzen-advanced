/**
 * Manage Students page types — mirrors controllers/student/manage-students.controller.js.
 * The list/profile types every Student page shares live in ./student.model.ts.
 */

export interface ManageStudentsOverview {
  totalStudents: number;
  cardsAssigned: number;
}

/** Terminal verify-mode codes (see helpers/student/student.utils.js VERIFY_MODES). */
export const VERIFY_MODE_OPTIONS = [
  { value: '4', label: 'Card only' },
  { value: '10', label: 'Card + Fingerprint' }
] as const;

export interface AssignCardItem {
  studentId: string;
  cardNumber: string;
}

export interface AssignCardsPayload {
  adminId: string;
  verifyMode: number;
  items: AssignCardItem[];
}

export interface ListQuery {
  session: string;
  classId?: string;
  streamId?: string;
  groupId?: string;
  sectionId?: string;
  search?: string;
  cursor?: string | null;
  limit: number;
}

/** returnvalue of an Excel import job. */
export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  failedCount: number;
  failed: { row: number; messages: string[] }[];
}

/** returnvalue of a device-sync job. */
export interface DeviceSyncResult {
  requested: number;
  synced: number;
  pushedToDevices: boolean;
  failed: { studentId: string; name: string; reason: string }[];
}
