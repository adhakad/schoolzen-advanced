/**
 * The Fees module's API shapes (backend: modules/controllers/fees/*). Paid / Due / Status
 * are always computed by the server's one ledger — the page never re-derives them.
 */

export type FeeStatus = 'paid' | 'has-arrears' | 'partial' | 'unpaid';
export type PaymentMode = 'cash' | 'online' | 'cheque';

export const PAYMENT_MODE_LABELS: Readonly<Record<string, string>> = {
  cash: 'Cash', online: 'Online', cheque: 'Cheque', 'opening-balance': 'Opening balance'
};

/* --- Fee Structure --- */

export interface FeeParticular {
  name: string;
  amount: number;
}

export interface FeeStructureRow {
  _id: string;
  session: string;
  sessionShort: string;
  classId: string;
  streamId: string;
  groupId: string;
  className: string;
  streamName: string | null;
  groupName: string | null;
  admissionFee: number;
  particulars: FeeParticular[];
  particularTotal: number;
}

export interface FeeStructureListResponse {
  rows: FeeStructureRow[];
  total: number;
  page: number;
  limit: number;
  summary: { structures: number; classesCovered: number };
  canEdit: boolean;
}

export interface FeeStructurePayload {
  adminId: string;
  session: string;
  classId: string;
  streamId: string;
  groupId: string;
  admissionFee: number;
  particulars: FeeParticular[];
}

/* --- Fees (collection) --- */

export interface ArrearNote {
  sessionLabel: string;
  sessionShort: string;
  className: string | null;
  due: number;
}

export interface FeeRow {
  _id: string;
  studentId: string;
  name: string;
  admissionNo: number | null;
  fatherName: string | null;
  className: string | null;
  streamName: string | null;
  groupName: string | null;
  hasRecord: boolean;
  recordId?: string;
  concession?: number;
  concessionReason?: string | null;
  gross?: number;
  admissionFee?: number;
  paid?: number;
  currentDue?: number;
  arrearsDue?: number;
  due?: number;
  total?: number;
  status?: FeeStatus;
  statusLabel?: string;
  arrears?: ArrearNote[];
  collectedBy?: string | null;
  /** Report only — paid within the chosen period. */
  collectedInPeriod?: number;
}

export interface FeesSummary {
  collectedThisMonth: number;
  fullyPaid: number;
  hasArrears: number;
  partial: number;
  unpaid: number;
}

export interface FeesListResponse {
  rows: FeeRow[];
  nextCursor: string | null;
  summary: FeesSummary | null;
  canCollect: boolean;
  canWaive: boolean;
}

export interface FeeFilters {
  classId: string;
  streamId: string;
  groupId: string;
  search: string;
}

export interface ReceiptLine {
  label: string;
  amount: number;
  kind: 'particular' | 'admission' | 'arrear';
}

export interface FeeReceipt {
  _id: string;
  school: { schoolName: string; logoUrl: string | null; metaLines: string[] };
  receiptNo: string;
  date: string;
  dateText: string;
  mode: string;
  session: string;
  student: {
    name: string;
    admissionNo: number | null;
    className: string | null;
    fatherName: string | null;
  };
  lines: ReceiptLine[];
  concession: number;
  amountReceived: number;
  totals: { totalFee: number; paid: number; due: number };
  amountInWords: string;
  note: string;
}

export interface CollectResponse {
  message: string;
  row: FeeRow;
  receipt: FeeReceipt;
}

export type ReportPeriod = 'day' | '7d' | '15d' | '1m' | '3m' | '6m' | 'session';

/* --- Fee Statement --- */

export interface StatementPayment {
  _id: string;
  receiptNo: string;
  amount: number;
  receiptAmount: number;
  date: string;
  mode: string;
  collectedBy: string | null;
  printable: boolean;
}

export interface StatementSession {
  sessionLabel: string;
  sessionShort: string;
  className: string | null;
  hasRecord: boolean;
  total: number;
  paid: number;
  due: number;
  status: FeeStatus | null;
  statusLabel: string | null;
  payments: StatementPayment[];
}

export interface FeeStatement {
  student: {
    _id: string;
    name: string;
    admissionNo: number | null;
    fatherName: string | null;
    photoUrl: string | null;
    className: string | null;
    streamName: string | null;
    groupName: string | null;
    rollNumber: number | null;
  };
  session: string;
  hasRecord: boolean;
  summary: {
    concession: number;
    paid: number;
    due: number;
    total: number;
    status: FeeStatus;
    statusLabel: string;
    arrears: { sessionShort: string; className: string | null; due: number }[];
  } | null;
  previous: StatementSession[];
  particulars: FeeParticular[];
  payments: StatementPayment[];
  lifetime: { sessionsEnrolled: number; totalPaid: number; totalOutstanding: number };
}

/* --- Fee Reminder --- */

export interface ReminderFilterFields {
  classId: string;
  paidBelowPercent: number | null;
  noPaymentSinceDays: number | null;
  gapSinceLastReminderDays: number | null;
}

export interface ReminderFilterRow extends ReminderFilterFields {
  _id: string;
  className: string;
}

export interface ReminderListResponse {
  rows: ReminderFilterRow[];
  summary: { savedFilters: number; sentThisMonth: number };
  canEdit: boolean;
}

export interface ReminderRecipient {
  studentId: string;
  name: string;
  admissionNo: number | null;
  mobile: string | null;
  paidPercent: number;
  due: number;
  total: number;
}

export interface ReminderJobResult {
  requested: number;
  sent: number;
  skipped: number;
  failed: number;
  warnings: { code: string; message: string }[];
}
