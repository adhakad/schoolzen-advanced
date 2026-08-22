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

  // --- Client-side only, never sent by the backend ---
  // A raw punch arrived over the socket and the reconcile worker has not classified it yet.
  // The cell shows a pulsing dot and the punch time instead of a status chip, because the
  // fast path genuinely cannot tell whether 10:32 is Present or Late.
  livePunch?: boolean;
  // Drives the one-shot green flash when a punch lands on the cell.
  flash?: boolean;
}

// One entry in the live feed strip above the grid. Assembled from the grid's own rows, not
// from the socket payload — a PunchEvent carries no name, so the feed has to join against
// people already on screen, and the grid is exactly that set.
export interface FeedArrival {
  personId: string;
  name: string;
  punchTime: string;          // ISO, same wall-clock-as-UTC frame as everything else here
}

// Today's totals across the people on screen. The API's `summary` is MONTH-wide and so cannot
// answer "how many are present right now"; this is recomputed from each row's today cell.
export interface TodayStats {
  present: number;
  late: number;
  punched: number;            // raw punches held, reconcile pending
  absent: number;
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

// --- Phase 7: the live layer ---
//
// Mirrors the payload backend/modules/services/punch-publisher.js puts on Redis and
// sockets/punch-subscriber.js re-emits as 'attendance:punch'. Deliberately carries no name
// and no in/out flag — the fast path does zero lookups, so the page resolves names from the
// people it already loaded.
export interface PunchEventPunch {
  personType: string;
  personId: string;
  punchTime: string;          // ISO; school wall clock expressed as UTC, like every other time here
  dateKey: string;            // "YYYY-MM-DD"
  // The student's class, or null for staff/teacher. The backend routes a punch into
  // `school:<adminId>:class:<class>` by this, so a teacher panel receives only its own
  // classes — the client never has to filter on it.
  class: string | null;
}

export interface PunchEvent {
  adminId: string;
  count: number;              // the real batch size; `punches` is capped at 200, newest first
  punches: PunchEventPunch[];
}

// Emitted once the reconcile worker has finished a school+date, so a cell showing a raw punch
// can be replaced with the status that was actually decided. Deliberately carries no
// per-person detail — a school-day reconcile can touch everyone, which would be far larger
// than the refetch the page does in response.
export interface ReconcileEvent {
  adminId: string;
  dateKey: string;            // "YYYY-MM-DD"
  summary: { [key: string]: any } | null;
}

// One row of the live board. Sourced from raw PunchLog, NOT DailyAttendance — so there is no
// status here: the fast path genuinely cannot know whether 10:32 is Present or Late.
export interface LiveBoardPerson {
  _id: string;
  name: string;
  code: string;
  firstIn: string | null;     // the arrival
  lastPunch: string | null;   // most recent sighting; null when there was only one punch
  punchCount: number;
  arrived: boolean;
  // Client-side only, for the "just walked in" flash — never sent by the backend.
  justArrived?: boolean;
}

export interface LiveBoard {
  dateKey: string;
  personType: string;
  total: number;
  arrivedCount: number;
  notArrivedCount: number;
  people: LiveBoardPerson[];
}
