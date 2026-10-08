/** The Designations page's API shapes (/api/v2/staff/designations). */
import { LookupSummary, StaffRecordStatus } from 'src/app/shared/models/staff/department.model';

export interface Designation {
  _id: string;
  title: string;
  /** Genuinely optional — null is a standalone designation (designations.md). */
  departmentId: string | null;
  department: string | null;
  status: StaffRecordStatus;
  /** Staff currently holding it — drives the type-to-confirm delete. */
  staffCount?: number;
}

export interface DesignationListResponse {
  rows: Designation[];
  total: number;
  page: number;
  limit: number;
  summary: LookupSummary;
}

export interface DesignationPayload {
  adminId: string;
  title: string;
  departmentId: string | null;
  status: StaffRecordStatus;
}
