/** Salary Groups API shapes (/api/v2/payroll/salary-groups). */

export type SalaryMode = 'monthly' | 'daily';
export type SalaryGroupStatus = 'active' | 'inactive';

export interface SalaryComponent {
  name: string;
  amount: number;
}

export interface SalaryGroup {
  _id: string;
  name: string;
  mode: SalaryMode;
  basic: number;
  hra: number;
  allowances: SalaryComponent[];
  deductions: SalaryComponent[];
  status: SalaryGroupStatus;
  /** Staff on this group / payroll generated from it — drive the delete block. */
  assigned?: number;
  payrolls?: number;
}

export interface SalaryGroupListResponse {
  rows: SalaryGroup[];
  total: number;
  page: number;
  limit: number;
  summary: { total: number; active: number };
  canEdit: boolean;
}

export interface SalaryGroupPayload {
  adminId: string;
  name: string;
  mode: SalaryMode;
  basic: number;
  hra: number;
  allowances: SalaryComponent[];
  deductions: SalaryComponent[];
  status: SalaryGroupStatus;
}

export const MODE_LABELS: Record<SalaryMode, string> = { monthly: 'Per Month', daily: 'Per Day' };
