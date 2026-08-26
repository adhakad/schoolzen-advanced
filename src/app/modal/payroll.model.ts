import { SalaryComponent } from './salary-group.model';

// Mirrors backend/modules/models/payroll.js, plus the three fields the list and detail
// endpoints join on: staffName, amountPaid and paymentStatus.
//
// paymentStatus is DERIVED on the backend by summing salary-payment rows against netSalary —
// it is not a stored field, so it arrives on the response and never goes back in a request.
export interface Payroll {
  _id?: String;
  adminId?: String;
  staffId: String;
  month: number;
  year: number;
  salaryGroupId: String;
  calculationMode: String;

  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  unpaidLeaveDays: number;
  holidayDays: number;
  totalWorkingDays: number;

  basic: number;
  hra: number;
  allowances: SalaryComponent[];
  grossSalary: number;
  deductions: SalaryComponent[];
  attendanceDeduction: number;
  totalDeductions: number;
  netSalary: number;

  status: String;
  generatedAt?: Date;
  lockedAt?: Date | null;
  lockedBy?: String | null;
  unlockedAt?: Date | null;
  unlockedBy?: String | null;

  // Joined by the backend, not stored.
  staffName?: String;
  empCode?: String;
  amountPaid?: number;
  paymentStatus?: String;
}

// What POST /bulk-generate returns. A staff member who could not be generated is reported
// here rather than aborting the batch, so the toast can name what was skipped and why.
export interface BulkGenerateResult {
  generated: number;
  skipped: { staffId: String, name: String, reason: String }[];
}
