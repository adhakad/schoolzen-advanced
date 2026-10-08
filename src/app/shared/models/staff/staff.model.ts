/** Manage Staff's API shapes (/api/v2/staff/members). */
import { StaffRecordStatus } from 'src/app/shared/models/staff/department.model';

/** Terminal verify-mode codes — Staff has three, one more than Student. */
export const STAFF_VERIFY_MODES = { CARD_ONLY: 4, CARD_AND_FINGERPRINT: 10, CARD_AND_PIN: 11 } as const;

export interface StaffRow {
  _id: string;
  name: string;
  empCode: string | null;
  departmentId: string | null;
  designationId: string | null;
  department: string | null;
  designation: string | null;
  joiningDate: string | null;
  status: StaffRecordStatus;
  /** Masked ("•• 8821") or null when no card is assigned. */
  card: string | null;
  verifyMode: number;
  isOwner: boolean;
}

export interface StaffListResponse {
  rows: StaffRow[];
  total: number;
  page: number;
  limit: number;
  summary: { total: number; cardsAssigned: number };
}

export interface StaffListQuery {
  search?: string;
  departmentId?: string;
  designationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface StaffPayload {
  adminId: string;
  name: string;
  empCode: string | null;
  departmentId: string | null;
  designationId: string | null;
  /** 'YYYY-MM-DD' or null. */
  joiningDate: string | null;
  status: StaffRecordStatus;
}

export interface StaffAssignCardsPayload {
  adminId: string;
  verifyMode: number;
  items: { staffId: string; cardNumber: string }[];
}

export interface StaffRowOutcome {
  staffId?: string;
  code?: string;
  message?: string;
}

export interface StaffAssignCardsResponse {
  message: string;
  jobId: string;
  assigned: number;
  cards: { staffId: string; card: string; verifyMode: number }[];
  rows: StaffRowOutcome[];
}

export interface StaffDeviceSyncResult {
  requested: number;
  synced: number;
  pushedToDevices: boolean;
  failed: { personId: string; name?: string; reason: string }[];
}

export interface StaffDeleteResult {
  id: string;
  status: 'deleted' | 'blocked' | 'not_found';
  code?: string;
  message?: string;
}

export interface StaffBulkDeleteResponse {
  message: string;
  deletedCount: number;
  blockedCount: number;
  notFoundCount: number;
  results: StaffDeleteResult[];
}
