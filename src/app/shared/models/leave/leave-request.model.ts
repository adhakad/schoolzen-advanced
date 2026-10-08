/** Leave Requests (backend: models/leave/leave-request.js). */
export type LeavePersonType = 'staff' | 'student';
export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
/** The ONE action set a row's status allows — computed by the server. */
export type LeaveRowAction = 'approve' | 'reject' | 'cancel' | 'delete';

export interface LeaveBalance {
  allocated: number;
  used: number;
  remaining: number;
}

export interface LeaveRequestRow {
  _id: string;
  personType: LeavePersonType;
  personId: string;
  name: string;
  code: string | null;
  sub: string | null;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeMissing: boolean;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: LeaveRequestStatus;
  cancelReason: string | null;
  balance: LeaveBalance | null;
  actions: LeaveRowAction[];
}

export interface LeaveRequestFilters {
  session: string;
  personType: LeavePersonType;
  departmentId: string;
  designationId: string;
  classId: string;
  streamId: string;
  groupId: string;
  sectionId: string;
  search: string;
  leaveTypeId: string;
  status: string;
  month: string;
  page: number;
  limit: number;
}

export interface LeaveRequestListResponse {
  rows: LeaveRequestRow[];
  total: number;
  page: number;
  limit: number;
  summary: Record<LeaveRequestStatus, number>;
  truncated: boolean;
}

export interface LeavePersonOption {
  _id: string;
  name: string;
  code: string | null;
  sub: string | null;
}

export interface LeaveBalanceResponse extends LeaveBalance {
  assigned: boolean;
}

export interface ApplyLeavePayload {
  adminId: string;
  session: string;
  personType: LeavePersonType;
  personId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}

export interface LeaveActionResponse {
  message: string;
  request: LeaveRequestRow;
}
