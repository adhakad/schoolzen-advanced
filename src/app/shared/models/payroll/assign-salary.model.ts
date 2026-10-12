/** Assign Salary API shapes (/api/v2/payroll/assign). */
import { SalaryComponent, SalaryMode } from './salary-group.model';

/** null = "use the group's value"; 0 / [] = "none". */
export interface SalaryOverrides {
  basic: number | null;
  hra: number | null;
  allowances: SalaryComponent[] | null;
  deductions: SalaryComponent[] | null;
}

export interface SalaryAssignmentCell {
  salaryGroupId: string;
  groupName: string | null;
  groupMissing: boolean;
  mode: SalaryMode | null;
  effectiveFrom: string;
  overrides: SalaryOverrides | null;
  hasOverride: boolean;
}

export interface AssignGridRow {
  _id: string;
  name: string;
  code: string | null;
  department: string | null;
  designation: string | null;
  assignment: SalaryAssignmentCell | null;
}

export interface AssignGridResponse {
  rows: AssignGridRow[];
  total: number;
  page: number;
  limit: number;
  truncated: boolean;
  summary: { staff: number; assigned: number; withOverride: number };
  canEdit: boolean;
}

export interface SkippedRow {
  staffId: string;
  name?: string | null;
  code?: string | null;
  errorCode: string;
  reason: string;
}

export interface BulkAssignResponse {
  message: string;
  assigned: number;
  skipped: SkippedRow[];
}
