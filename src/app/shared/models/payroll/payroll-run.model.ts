/** Generate Payroll API shapes (/api/v2/payroll/runs). */
import { SalaryMode } from './salary-group.model';
import { SkippedRow } from './assign-salary.model';

/** 'pending' is never stored — it is a staff member with no run for the month. */
export type PayrollRunStatus = 'pending' | 'draft' | 'locked';
export type PayrollRunAction = 'generate' | 'regenerate' | 'lock' | 'slip' | 'unlock';

export interface AttendanceSummary {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  holiday: number;
  weeklyOff: number;
  workingDays: number;
  remainingDays: number;
  remainingCoveredByLeave: number;
}

export interface PayrollRunRow {
  _id: string | null;
  staffId: string;
  name: string;
  code: string | null;
  designation: string | null;
  department: string | null;
  status: PayrollRunStatus;
  actions: PayrollRunAction[];
  attendance: AttendanceSummary | null;
  gross: number | null;
  deductions: number | null;
  net: number | null;
  mode: SalaryMode | null;
  salaryGroupName: string | null;
  assigned?: boolean;
}

export interface PayrollRunListResponse {
  rows: PayrollRunRow[];
  nextCursor: string | null;
  total: number;
  truncated: boolean;
  summary: { totalPayroll: number; locked: number; draft: number; totalStaff: number };
  canEdit: boolean;
}

export interface RunMutationResponse {
  message: string;
  row: PayrollRunRow;
  warning?: string | null;
}

export interface BulkGenerateResponse {
  message: string;
  generated?: number;
  skipped?: SkippedRow[];
  warning?: string | null;
  /** Present when the selection was large enough to run in the background (202). */
  jobId?: string;
}

export interface BulkGenerateJobResult {
  generated: number;
  skipped: SkippedRow[];
  warning: string | null;
}
