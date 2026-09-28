import { BulkRowResult } from './student.model';

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

/** One failed sheet row, in the catalog's bulk shape: its row number + field errors. */
export interface ImportRowError {
  row: number;
  fields: { field: string; code?: string; message: string }[];
}

/** returnvalue of an Excel import job. Rows that passed are counts; only failures are listed. */
export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  failedCount: number;
  code: string | null;
  message: string | null;
  rows: ImportRowError[];
}

/** "Delete Selected" — per-row outcome, never one pass/fail for the selection. */
export interface BulkDeleteResponse {
  message: string;
  deleted: number;
  rows: BulkRowResult[];
}

/** Assign Card — the cards that were saved (and are syncing) plus any row that wasn't. */
export interface AssignCardsResponse {
  message: string;
  jobId: string;
  assigned: number;
  rows: BulkRowResult[];
}

/** returnvalue of a device-sync job. */
export interface DeviceSyncResult {
  requested: number;
  synced: number;
  pushedToDevices: boolean;
  failed: { studentId: string; name: string; reason: string }[];
}
