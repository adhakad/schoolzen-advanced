/** Leave Assign (backend: models/leave/leave-limit.js + class-leave-default.js). */
import { LeaveType } from './leave-type.model';

export interface StaffLimitCell {
  allocated: number;
  used: number;
}

export interface StaffGridRow {
  _id: string;
  name: string;
  code: string | null;
  department: string | null;
  sub: string;
  /** One key per active leave type — the dynamic columns. null = "Not set". */
  limits: Record<string, StaffLimitCell | null>;
}

export interface StaffGridResponse {
  leaveTypes: LeaveType[];
  rows: StaffGridRow[];
  total: number;
  page: number;
  limit: number;
  truncated: boolean;
  summary: { people: number; fullySet: number; types: number };
  /** The caller holds 'leave-limit' edit — otherwise the Assign UI stays hidden. */
  canAssign: boolean;
}

export interface ClassLimitCell {
  allocated: number | null;
  overrides: number;
}

export interface ClassGridRow {
  key: string;
  level: number;
  label: string;
  classId: string;
  streamId: string | null;
  sectionId: string | null;
  /** Only leaf rows (class / stream / section with no children) carry a limit. */
  selectable: boolean;
  students: number | null;
  limits: Record<string, ClassLimitCell>;
}

export interface ClassGridResponse {
  leaveTypes: LeaveType[];
  rows: ClassGridRow[];
  summary: { classes: number; fullySet: number; types: number };
  canAssign: boolean;
}

export interface StudentLimitCell {
  allocated: number;
  used: number;
  source: 'class' | 'override' | 'staff';
  inherited: boolean;
}

export interface ClassStudentRow {
  _id: string;
  name: string;
  code: string | null;
  limits: Record<string, StudentLimitCell | null>;
}

export interface ClassTargetRef {
  classId: string;
  streamId: string | null;
  sectionId: string | null;
}

export interface AssignItem {
  leaveTypeId: string;
  days: number;
}

export interface AssignResponse {
  message: string;
}
