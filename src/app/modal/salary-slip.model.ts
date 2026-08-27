import { SalaryComponent } from './salary-group.model';
import { SalaryPayment } from './salary-payment.model';

// What GET/POST on /v1/salary-slip returns — everything the printable slip renders, assembled
// by controllers/salary-slip.js buildSlipPayload.
//
// The backend returns structured JSON and the FRONTEND renders the printable HTML, exactly as
// the fee receipt works. There is no stored PDF and no PDF endpoint.
export interface SalarySlipPayload {
  slip: {
    _id: String;
    slipNumber: String;
    generatedAt: Date;
    generatedBy: String;
    salaryPaymentIds: String[];
  };
  // Straight off the School profile the fee receipt already reads — the admin never re-enters
  // a school detail for a slip.
  school: any;
  person: {
    personType: String;
    personId: String;
    name: String;
    code: String;
    // Staff only. models/teacher.js carries neither, and CLAUDE.md forbids adding them, so a
    // teacher's slip shows `education` instead and the template omits the empty rows.
    designation: String;
    department: String;
    education: String;
  };
  payroll: {
    _id: String;
    month: number;
    year: number;
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
  };
  payment: {
    amountPaid: number;
    remainingAmount: number;
    paymentDate: Date | null;
    paymentMode: String;
    referenceNumber: String;
    paidBy: String;
    payments: SalaryPayment[];
  };
}
