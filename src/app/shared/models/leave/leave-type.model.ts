/** Leave Create — the school's leave types (backend: models/leave/leave-type.js). */
export type WhoCanTake = 'everyone' | 'staff' | 'students';
export type LeaveTypeStatus = 'active' | 'inactive';

export interface LeaveType {
  _id: string;
  name: string;
  whoCanTake: WhoCanTake;
  defaultDays: number;
  /** false → Payroll deducts these days from salary. */
  isPaid: boolean;
  status: LeaveTypeStatus;
  /** Live counts behind the delete guard (list endpoint only). */
  assignments?: number;
  requests?: number;
}

export interface LeaveTypePayload {
  adminId: string;
  name: string;
  whoCanTake: WhoCanTake;
  defaultDays: number;
  isPaid: boolean;
  status: LeaveTypeStatus;
}

export interface LeaveTypeListResponse {
  rows: LeaveType[];
  total: number;
  page: number;
  limit: number;
  summary: { total: number; active: number };
}

export const WHO_CAN_TAKE_LABELS: Readonly<Record<WhoCanTake, string>> = {
  everyone: 'Everyone',
  staff: 'Staff only',
  students: 'Students only'
};
