/** Holiday Assign — `holidayTemplateId` on Staff / StudentEnrollment. */
export type HolidayPersonType = 'staff' | 'student';
export type HolidayAssignMode = 'assign' | 'edit';
/** What a selection allows: Assign (none set), Edit (all set), or neither (mixed). */
export type SelectionKind = 'empty' | 'assign' | 'edit' | 'mixed';

export interface HolidayAssignRow {
  _id: string;
  name: string;
  code: string | null;
  department: string | null;
  sub: string;
  /** null = not assigned → the Default template applies. */
  templateId: string | null;
  templateName: string | null;
}

export interface HolidayAssignGridResponse {
  rows: HolidayAssignRow[];
  total: number;
  page: number;
  limit: number;
  truncated: boolean;
  canAssign: boolean;
  defaultTemplate: { _id: string; name: string } | null;
}

export interface HolidayAssignPayload {
  adminId: string;
  session: string;
  personType: HolidayPersonType;
  personIds: string[];
  templateId: string;
  mode: HolidayAssignMode;
}

export interface HolidayCoverage {
  unassignedStaff: number;
  unassignedStudents: number;
}

/** Mirrors the backend's classifySelection — the UI warning and the server check agree. */
export const classifySelection = (rows: { templateId: string | null }[]): SelectionKind => {
  if (!rows.length) return 'empty';
  const assigned = rows.filter((row) => Boolean(row.templateId)).length;
  if (assigned === 0) return 'assign';
  if (assigned === rows.length) return 'edit';
  return 'mixed';
};
