// Mirrors what services/attendance-calendar.js returns, not the DailyAttendance schema —
// the calendar derives two statuses that are never stored:
//   'Off' — the person wasn't expected that day (no rostered shift; Sunday otherwise)
//   ''    — a future date, nothing to say yet
export type AttendanceStatus =
  | 'Present' | 'Late' | 'HalfDay' | 'Absent' | 'Leave' | 'Holiday' | 'Off' | '';

export interface AttendanceDay {
  dateKey: string;            // "YYYY-MM-DD"
  day: number;
  weekday: number;            // 0-6, Sun-Sat
  status: AttendanceStatus;
  firstIn: string | null;
  lastOut: string | null;
  punchCount: number;
  lateByMinutes: number | null;
  expectedStart: string | null;
  isOverridden: boolean;
  source: string | null;
}

export interface AttendanceCalendar {
  person: { _id: String, name: String, code: String } | null;
  personType: string;
  personId: string;
  year: number;
  month: number;              // 1-12, matching the backend — NOT JS's 0-11
  days: AttendanceDay[];
  summary: { [status: string]: number };
}

export interface AttendancePerson {
  _id: String;
  name: String;
  code: String;
}

// The grid: one row per person, each carrying the same AttendanceDay[] the per-person
// calendar returns — so the day-detail modal reads an identical shape either way.
export interface AttendanceGridRow {
  person: AttendancePerson;
  // The person's current shift, resolved once per row by the backend. It belongs in the
  // Name column, NOT in every cell: 31 columns times one shift name is 31 copies of the
  // same string per row.
  // Times arrive as raw "HH:mm" and are rendered through the timeAmPm pipe — the backend
  // deliberately does not pre-format them into a display string.
  shiftName: string;
  shiftStart: string;         // "08:00"
  shiftEnd: string;           // "14:00"
  days: AttendanceDay[];
  summary: { [status: string]: number };
}

export interface AttendanceMonthGrid {
  personType: string;
  year: number;
  month: number;              // 1-12, matching the backend — NOT JS's 0-11
  // Column headers: the month's date skeleton, with no person attached.
  days: { dateKey: string, day: number, weekday: number }[];
  rows: AttendanceGridRow[];
  summary: { [status: string]: number };
}

export interface PunchLogEntry {
  punchTime: string;
  punchState: string | null;
  terminalSn: string | null;
  source: string;
}
