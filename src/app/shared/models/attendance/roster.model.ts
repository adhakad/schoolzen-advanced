/** Roster's API shapes (/api/v2/attendance/roster/*). */
import { Shift } from './shift.model';

/** A cell value: a shiftId, or 'WO' for a rostered weekly off. */
export const WEEK_OFF = 'WO';

export interface MonthColumn {
  dateKey: string;
  day: number;
  dow: string;
  isToday: boolean;
  isFuture: boolean;
}

export interface RosterLegend {
  /** Only the shifts actually in use (roster.md). */
  shifts: Shift[];
  weekOff: boolean;
}

export interface RosterStats {
  byShift: { shiftId: string; name: string; count: number }[];
  unassigned: number;
}

export interface StaffRosterRow {
  _id: string;
  name: string;
  empCode: string | null;
  designation: string | null;
  days: Record<string, string>;
}

export interface StaffRosterResponse {
  month: string;
  days: MonthColumn[];
  rows: StaffRosterRow[];
  truncated: boolean;
  legend: RosterLegend;
  stats: RosterStats;
}

/** One line of the Class → Stream → Section hierarchy. Headings are not selectable. */
export interface ClassShiftRow {
  key: string;
  level: 0 | 1 | 2;
  label: string;
  classId: string;
  streamId: string | null;
  sectionId: string | null;
  selectable: boolean;
  shiftId: string | null;
}

export interface ClassShiftResponse {
  rows: ClassShiftRow[];
  legend: RosterLegend;
  stats: RosterStats;
}

export interface ClassTarget {
  classId: string;
  streamId: string | null;
  sectionId: string | null;
}

export interface RowFailure {
  row: number;
  id?: string;
  code: string;
  message: string;
}

export interface BulkWriteResponse {
  message: string;
  updated: number;
  failed: RowFailure[];
  warning: { code: string; message: string } | null;
}
