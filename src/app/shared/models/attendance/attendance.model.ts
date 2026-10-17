/** Attendance Overview's API shapes (/api/v2/attendance/*). */
import { MonthColumn } from './roster.model';

export type PersonType = 'staff' | 'student';

/** Chip status code: Present, Late, Half Day, Absent, Leave, Holiday, Weekly Off (the person's Roster WO). */
export type ChipStatus = 'P' | 'L' | 'HD' | 'A' | 'LV' | 'H' | 'WO';

/**
 * One day's cell (attendance-fix1.md §3c):
 *   real status    { s: 'P', t: '8:23 AM', src }  — `src` 'manual' (marked by hand) | 'device'
 *   future day     { s: 'M' | 'WO' | 'H' | 'LV', f: 1 } — what the roster expects
 *   no roster      { s: '—', n: 1 }
 */
export interface GridCell {
  /** A ChipStatus, a shift code on a future day, or '—'. */
  s: ChipStatus | string;
  /** "8:23 AM" — arrival / marked time; null for Absent/Holiday/Leave/Weekly Off. */
  t?: string | null;
  src?: 'manual' | 'device';
  /** Today's first device punch, "8:23 AM" — the mark popover's read-only note. */
  p?: string;
  f?: 1;
  n?: 1;
}

/** Today's marking window for a row, from its shift: Early Punch before start → end. */
export interface MarkWindow {
  from: string;
  to: string;
  /** The server's clock is inside the window right now. */
  open: boolean;
}

export interface GridRow {
  _id: string;
  name: string;
  /** Identity line: "EMP ID 014" (staff) or "Roll 12" (student). */
  idLine: string;
  /** Line under it: today's shift (staff) or Class-Section (student). */
  sub: string;
  code: string | null;
  /** Today's expected shift name. */
  shift: string | null;
  /** Today's marking window — absent when the person has no shift today. */
  mark?: MarkWindow;
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
  /** The caller holds 'attendance-mark' (edit). */
  canMark: boolean;
  /** Student view with no class chosen — the server sends no rows (class-first rule). */
  needsClass?: boolean;
}

export interface MarkRequest {
  personType: PersonType;
  personId: string;
  status: MarkStatus;
  session?: string;
  classId?: string;
  streamId?: string;
  groupId?: string;
  sectionId?: string;
}

export interface GridQuery {
  personType: PersonType;
  month: string;
  session?: string;
  departmentId?: string;
  designationId?: string;
  classId?: string;
  streamId?: string;
  groupId?: string;
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
  WeeklyOff: number;
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
  record: { status: string; inTime: string | null; outTime: string | null; source: 'device' | 'manual' | 'system'; markedAt: string | null; remark: string | null } | null;
}

export type MarkStatus = 'Present' | 'Late' | 'Absent';

export interface MarkResponse {
  message: string;
  cell: GridCell;
  markedAt: string | null;
}

export interface SyncStatus {
  dateKey: string;
  /** "9:05 AM", or null when no sync has finished yet. */
  lastSyncAt: string | null;
  lastSyncDate: string | null;
  lastFetched: number;
  lastInserted: number;
  /** Punches whose device ID belongs to nobody in this school (not enrolled under a v2 id). */
  lastUnmatched: number;
  punchesToday: number;
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
