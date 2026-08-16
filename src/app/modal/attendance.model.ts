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

export interface PunchLogEntry {
  punchTime: string;
  punchState: string | null;
  terminalSn: string | null;
  source: string;
}
