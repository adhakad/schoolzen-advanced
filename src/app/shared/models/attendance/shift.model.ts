/** Manage Shifts' API shapes (/api/v2/attendance/shifts). Times are 24h "HH:mm". */

export type ShiftStatus = 'active' | 'inactive';

export interface Shift {
  _id: string;
  name: string;
  /** Short chip code for Roster ("Morning Shift" → "M"). Server-derived. */
  code: string;
  startTime: string;
  endTime: string;
  earlyInMinutes: number;
  graceMinutes: number;
  /** Staff-only; null on a class-only shift. */
  halfDayAfterMinutes: number | null;
  earlyOutMinutes: number | null;
  lateOutMinutes: number | null;
  status: ShiftStatus;
  /** Live usage — what blocks a delete (errors.md SHIFT_IN_USE). */
  people?: number;
  classes?: number;
}

export interface ShiftSummary {
  total: number;
  active: number;
  inactive: number;
}

export interface ShiftListResponse {
  rows: Shift[];
  total: number;
  page: number;
  limit: number;
  summary: ShiftSummary;
}

export interface ShiftPayload {
  adminId: string;
  name: string;
  startTime: string;
  endTime: string;
  earlyInMinutes: number;
  graceMinutes: number;
  halfDayAfterMinutes: number | null;
  earlyOutMinutes: number | null;
  lateOutMinutes: number | null;
  status: ShiftStatus;
}

export interface ShiftSaveResponse {
  message: string;
  shift: Shift;
}
