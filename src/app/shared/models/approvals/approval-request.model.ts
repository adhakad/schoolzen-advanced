/**
 * Approvals inbox shapes (GET /api/v2/approvals/requests). One row per approvable request
 * from any module; `type` says which module it came from ('leave' today).
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalPersonType = '' | 'staff' | 'student';
export type ApprovalDecision = 'approve' | 'reject';

export interface ApprovalRow {
  _id: string;
  type: string;
  typeLabel: string;
  personType: 'staff' | 'student';
  personId: string;
  name: string;
  /** Staff code, or "<class> · Student". */
  code: string;
  /** One-line, type-specific summary, e.g. "Casual Leave · 05–06 Aug (2 days)". */
  details: string;
  status: ApprovalStatus;
  createdAt: string;
  info?: Record<string, unknown>;
}

export interface ApprovalSummary {
  pending: number;
  approved: number;
  rejected: number;
}

export interface ApprovalListResponse {
  rows: ApprovalRow[];
  /** Keyset token for the next page; null on the last page. */
  nextCursor: string | null;
  total: number;
  summary: ApprovalSummary;
  truncated: boolean;
}

export interface ApprovalFilters {
  session: string;
  search: string;
  personType: ApprovalPersonType;
  departmentId: string;
  designationId: string;
  classId: string;
  streamId: string;
  sectionId: string;
  type: string;
  status: '' | ApprovalStatus;
  cursor: string;
  limit: number;
}

export interface ApprovalActionResponse {
  message: string;
  /** The acted-on row, fresh, in this inbox's own shape. */
  row: ApprovalRow | null;
}
