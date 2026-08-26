// Mirrors backend/modules/models/salary-payment.js.
//
// The reserved payout fields (payoutMode / payoutGatewayId / payoutStatus) are deliberately
// NOT declared here. Nothing in this phase reads or writes them, and the backend validator
// strips them from any request — declaring them would suggest a payout integration exists.
export interface SalaryPayment {
  _id?: String;
  adminId?: String;
  payrollId: String;
  staffId: String;
  amountPaid: number;
  paymentDate: Date | String;
  paymentMode: String;
  referenceNumber?: String;
  paidBy: String;
  remarks?: String;
  createdAt?: Date;
}

// One row of the Payment History table. It is a LOCKED PAYROLL with its payments attached,
// not a payment row — an unpaid locked payroll has to appear, and that is exactly the row the
// tab exists to act on.
export interface PaymentHistoryRow {
  payrollId: String;
  staffId: String;
  staffName: String;
  empCode: String;
  month: number;
  year: number;
  netSalary: number;
  amountPaid: number;
  remainingAmount: number;
  paymentStatus: String;
  paymentMode: String;
  paymentDate: Date | null;
  paidBy: String;
  referenceNumber: String;
  payments: SalaryPayment[];
}
