// Mirrors backend/modules/models/salary-payment.js.
//
// The reserved payout fields (payoutMode / payoutGatewayId / payoutStatus) are deliberately
// NOT declared here. Nothing in this phase reads or writes them, and the backend validator
// strips them from any request — declaring them would suggest a payout integration exists.
export interface SalaryPayment {
  _id?: String;
  adminId?: String;
  payrollId: String;
  // personType/personId are set by the BACKEND from the referenced Payroll, never sent by the
  // client — the payroll is the authority on whose salary this is.
  personType?: String;
  personId?: String;
  amountPaid: number;
  paymentDate: Date | String;
  paymentMode: String;
  referenceNumber?: String;
  paidBy: String;
  remarks?: String;

  // ---- Set by the backend, never sent by the client ---------------------
  // A payment counts toward the payroll as paid only while this reads Confirmed. A row
  // written before confirmation existed carries no value at all, which is read as
  // Confirmed — it was settled money at the time.
  confirmationStatus?: 'PendingConfirmation' | 'Confirmed' | 'Disputed' | 'Expired';
  confirmationRequestedAt?: Date;
  confirmationExpiresAt?: Date | null;
  confirmedAt?: Date | null;
  confirmedByDeviceInfo?: String | null;
  disputeReason?: String | null;
  createdAt?: Date;
}

// One row of the Payment History table. It is a LOCKED PAYROLL with its payments attached,
// not a payment row — an unpaid locked payroll has to appear, and that is exactly the row the
// tab exists to act on.
export interface PaymentHistoryRow {
  payrollId: String;
  personType: String;
  personId: String;
  name: String;
  code: String;
  month: number;
  year: number;
  netSalary: number;
  // CONFIRMED money only. Recorded-but-unacknowledged money is in pendingAmount, and is
  // in neither this nor remainingAmount — which is why a row can show a payment against
  // it and still read Unpaid.
  amountPaid: number;
  pendingAmount: number;
  remainingAmount: number;
  paymentStatus: String;
  paymentMode: String;
  paymentDate: Date | null;
  paidBy: String;
  referenceNumber: String;
  payments: SalaryPayment[];
}
