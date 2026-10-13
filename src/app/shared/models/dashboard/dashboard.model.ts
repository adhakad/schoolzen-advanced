/**
 * Dashboard API shapes — GET /api/v2/dashboard and GET /api/v2/dashboard/widgets/:key.
 *
 * Every widget is its own slice. A slice the viewer's Roles & Permissions don't allow is
 * ABSENT from the response (the server never computes it); a slice whose aggregation failed
 * is `{ error }` while every other slice still arrives (dashboard/errors.md).
 */

export type DashboardWidgetKey =
  | 'students' | 'staff' | 'attendance' | 'fees' | 'calendar' | 'approvals' | 'holidays' | 'quickActions';

export interface DashboardSliceError {
  error: { code: string; message: string };
}

/** When the slice's numbers were computed (a cached slice keeps its original time). */
interface Generated { generatedAt: string }

export interface CountSlice extends Generated { total: number }

export type AttendanceReason = 'holiday' | 'weekly-off' | 'not-marked' | null;

export interface AttendanceBar {
  dateKey: string;
  label: string;
  /** null = no working records that day (holiday / weekly off / not marked yet). */
  pct: number | null;
  reason: AttendanceReason;
  isToday: boolean;
}

export interface AttendanceSlice extends Generated {
  todayPct: number | null;
  todayReason: AttendanceReason;
  bars: AttendanceBar[];
}

export interface FeesSlice extends Generated {
  collected: number;
  due: number;
  /** null when nothing has been billed yet. */
  collectedPct: number | null;
}

export interface CalendarSlice extends Generated {
  month: string;
  holidayDays: number[];
}

export interface PendingApprovalRow {
  _id: string;
  type: string;
  typeLabel: string;
  name: string;
  days: number | null;
  details: string;
  /** Approve/Reject allowed for THIS viewer (approvals-action + the source's own grant). */
  canAct: boolean;
}

export interface ApprovalsSlice extends Generated {
  total: number;
  rows: PendingApprovalRow[];
}

export interface UpcomingHoliday {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface HolidaysSlice extends Generated { rows: UpcomingHoliday[] }

export type QuickActionKey = 'new-admission' | 'collect-fee' | 'apply-leave' | 'issue-tc' | 'generate-marksheet';

export interface QuickActionsSlice extends Generated {
  tiles: { key: QuickActionKey; allowed: boolean }[];
}

export interface DashboardSlices {
  students: CountSlice;
  staff: CountSlice;
  attendance: AttendanceSlice;
  fees: FeesSlice;
  calendar: CalendarSlice;
  approvals: ApprovalsSlice;
  holidays: HolidaysSlice;
  quickActions: QuickActionsSlice;
}

export type DashboardSlice<K extends DashboardWidgetKey> = DashboardSlices[K] | DashboardSliceError;

export interface DashboardResponse {
  todayKey: string;
  widgets: { [K in DashboardWidgetKey]?: DashboardSlice<K> };
}

export interface DashboardWidgetResponse<K extends DashboardWidgetKey = DashboardWidgetKey> {
  todayKey: string;
  key: K;
  widget: DashboardSlice<K>;
}

/** The live-hint socket event — never carries data, only which widget to refetch. */
export const DASHBOARD_HINT_EVENT = 'dashboard:widget-changed';
export interface DashboardHint { widget: DashboardWidgetKey }
