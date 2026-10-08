/** The Departments page's API shapes (/api/v2/staff/departments). */

export type StaffRecordStatus = 'active' | 'inactive';

export interface Department {
  _id: string;
  name: string;
  status: StaffRecordStatus;
  /** Live in-use counts — drive the type-to-confirm delete (errors.md DEPARTMENT_IN_USE). */
  staffCount?: number;
  designationCount?: number;
}

export interface LookupSummary {
  total: number;
  active: number;
}

export interface DepartmentListResponse {
  rows: Department[];
  total: number;
  page: number;
  limit: number;
  summary: LookupSummary;
}

export interface DepartmentPayload {
  adminId: string;
  name: string;
  status: StaffRecordStatus;
}

export interface DepartmentSaveResponse {
  message: string;
  /** DEPARTMENT_DEACTIVATE_BLOCKED — a non-blocking warning after deactivating. */
  warnings?: { code: string; count: number; message: string }[];
}
