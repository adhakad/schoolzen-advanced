/**
 * Certificates (module 10) — shapes of /api/v2/certificates responses.
 */

export interface TcStructureView {
  fields: { no: number; label: string }[];
  nextSerialNumber: string;
  issuedThisSession: number;
  canEdit: boolean;
}

export type TcStatus = 'issued' | 'notissued';
export type TcStatusFilter = '' | TcStatus;
export type TcReason = 'transfer' | 'relocation' | 'admission' | 'other';
export type TcConduct = 'good' | 'satisfactory' | 'excellent';

export interface TcFilters {
  classId: string;
  streamId: string;
  sectionId: string;
  search: string;
  status: TcStatusFilter;
}

export interface TcStudentRow {
  _id: string;
  studentId: string;
  rollNumber: number | null;
  name: string;
  initials: string;
  admissionNo: number | null;
  className: string;
  status: TcStatus;
  tcId: string | null;
  dateOfLeaving: string | null;
}

export interface TcListResponse {
  rows: TcStudentRow[];
  nextCursor: string | null;
  total: number | null;
  summary: { totalStudents: number; issuedThisSession: number } | null;
  canIssue: boolean;
}

export interface TcIssueDraft {
  studentId: string;
  name: string;
  serialNumber: string;
  className: string;
  nextClassName: string | null;
  workingDays: number;
  presentDays: number;
  totalDue: number;
  canOverrideFees: boolean;
  alreadyIssued: boolean;
}

export interface TcIssuePayload {
  dateOfLeaving: string;
  reasonForLeaving: TcReason;
  qualifiedForPromotion: boolean;
  generalConduct: TcConduct;
  remarks: string;
  acknowledgeFeesPending: boolean;
}

export interface TcCertificate {
  _id: string;
  studentId: string;
  serialNumber: string;
  status: 'issued' | 'cancelled';
  header: {
    schoolName: string;
    logoUrl: string | null;
    metaLines: string[];
    schoolCode?: string | null;
    affiliationNumber?: string | null;
  };
  title: string;
  admissionNo: string | null;
  fields: { no: number; label: string; value: string }[];
}

export interface TcIssueResponse {
  message: string;
  certificate: TcCertificate;
  row: { studentId: string; status: TcStatus; tcId: string; dateOfLeaving: string | null };
}
