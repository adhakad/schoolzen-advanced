/** Salary Payouts API shapes (/api/v2/payroll/payouts). Only LOCKED runs exist here. */
import { SalaryMode } from './salary-group.model';

export type PaymentMode = 'bank' | 'cash' | 'upi';
export type PayoutStatus = 'full' | 'partial' | 'unpaid';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'disputed' | 'expired';

export interface PayrollPaymentRow {
  _id: string;
  amountPaid: number;
  mode: PaymentMode;
  reference: string | null;
  date: string;
  paidBy: string | null;
  confirmationStatus: ConfirmationStatus;
  confirmationExpiresAt: string;
  confirmedAt: string | null;
  disputeReason: string | null;
}

export interface PayoutRow {
  /** The locked PayrollRun's id. */
  _id: string;
  staffId: string;
  name: string | null;
  code: string | null;
  designation: string | null;
  department: string | null;
  year: number;
  month: number;
  net: number;
  /** Confirmed only — derived, never stored. */
  paid: number;
  /** Recorded, awaiting confirmation. */
  pending: number;
  /** What may still be recorded (net − confirmed − pending). */
  due: number;
  /** net − confirmed: the "still due" note. */
  stillDue: number;
  status: PayoutStatus;
  latestPayment: PayrollPaymentRow | null;
  payments: PayrollPaymentRow[];
  actions: ('slip' | 'record')[];
}

export interface PayoutListResponse {
  rows: PayoutRow[];
  nextCursor: string | null;
  total: number;
  summary: { disbursed: number; full: number; partial: number; unpaid: number };
  canEdit: boolean;
}

export interface RecordPaymentPayload {
  adminId: string;
  amountPaid: number;
  mode: PaymentMode;
  reference: string;
  date: string;
}

export interface SalarySlip {
  school: { schoolName: string; logoUrl: string | null; metaLines: string[] };
  slipNumber: string;
  generatedAt: string;
  period: { year: number; month: number };
  employee: { name: string | null; code: string | null; designation: string | null; department: string | null; mode: SalaryMode };
  attendance: { present: number; leave: number; absent: number; holiday: number; workingDays: number };
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  gross: number;
  deductionTotal: number;
  net: number;
  payment: { date: string; mode: PaymentMode; reference: string | null } | null;
}

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = { bank: 'Bank Transfer', cash: 'Cash', upi: 'UPI' };
