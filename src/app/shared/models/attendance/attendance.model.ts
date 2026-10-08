/** Attendance Overview's API shapes (/api/v2/attendance/*). */
import { MonthColumn } from './roster.model';

export type PersonType = 'staff' | 'student';

/** Chip status code: Present, Late, Half Day, Absent, Leave, Holiday. */
export type ChipStatus = 'P' | 'L' | 'HD' | 'A' | 'LV' | 'H';

export interface GridCell {
  s: ChipStatus;
  /** "8:23" — arrival time; null for Absent/Holiday. */
  t: string | null;
}

export interface GridRow {
  _id: string;
  name: string;
  sub: string;
  code: string | null;
  /** Expected shift name (today, or the month's first day) — the reference's sub-line. */
  shift: string | null;
  type: PersonType;
  cells: Record<string, GridCell>;
  /** Punched in today, not yet reconciled / no punch-out → the pulsing ring. */
  live: boolean;
  presentCount: number;
}

export interface GridResponse {
  month: string;
  personType: PersonType;
  today: string;
  days: MonthColumn[];
  rows: GridRow[];
  truncated: boolean;
}

export interface GridQuery {
  personType: PersonType;
  month: string;
  session?: string;
  departmentId?: string;
  designationId?: string;
  classId?: string;
  streamId?: string;
  sectionId?: string;
  search?: string;
}

export interface LiveCounts {
  Present: number;
  Late: number;
  HalfDay: number;
  Absent: number;
  Leave: number;
  Holiday: number;
  live: number;
}

export interface LiveStatus {
  dateKey: string;
  staff: LiveCounts;
  student: LiveCounts;
}

export interface ArrivalRow {
  personId: string;
  name: string;
  /** Designation, or "Class 8 · A". */
  role: string;
  /** "Staff ID" or "Roll No". */
  idLabel: string;
  code: string | null;
  shift: string | null;
  time: string;
  presentThisMonth: number;
}

export interface RecentArrivals {
  dateKey: string;
  staff: ArrivalRow[];
  student: ArrivalRow[];
}

export interface DayPunches {
  date: string;
  punches: { time: string; terminalSn: string | null }[];
  record: { status: string; inTime: string | null; outTime: string | null; isOverridden: boolean; remark: string | null } | null;
}

export interface SyncResponse {
  message: string;
  jobId: string;
  dateKey: string;
}

/** Socket deltas (minimal payloads — performance-principles.md). */
export interface PunchDelta {
  personId: string;
  personType: PersonType;
  status: 'punched-in';
  time: string;
  dateKey: string;
}

export interface PunchEventV2 {
  adminId: string;
  punches: PunchDelta[];
}

export interface ReconcileEventV2 {
  adminId: string;
  dateKey: string;
  count: number;
}
