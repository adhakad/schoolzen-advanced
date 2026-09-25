/**
 * The Academic Setup module's subject types.
 *
 * Lives under shared/models/<module>/, not inside the academic-setup component folder:
 * models sit in a top-level LAYER folder with a module subfolder inside, mirroring the
 * backend's models/academic-setup/subject.js exactly
 * (docs/schoolzen-planning/v1/_core/frontend-backend-folder-structure.md).
 *
 * These mirror the /api/v2/academic-setup payloads field-for-field, so a page binds server
 * data directly rather than re-shaping it.
 */

export type SubjectType = 'core' | 'elective';
export type SubjectStatus = 'active' | 'inactive';

/** One table row. The list endpoint projects to exactly these fields. */
export interface Subject {
  _id: string;
  name: string;
  type: SubjectType;
  status: SubjectStatus;
}

/** The side card's counts, school-wide — not narrowed by the search box. */
export interface SubjectSummary {
  total: number;
  core: number;
  elective: number;
  inactive: number;
}

/** One page of rows plus everything around the table, from the page's single read. */
export interface SubjectListResponse {
  rows: Subject[];
  total: number;
  page: number;
  limit: number;
  summary: SubjectSummary;
}

/** Everything the Add/Edit modal edits, as a draft the component owns and Submit sends. */
export interface SubjectFormValue {
  /** null while adding; the document id while editing. */
  id: string | null;
  name: string;
  type: SubjectType;
  status: SubjectStatus;
}

/** The request body both create and update send. */
export interface SubjectPayload {
  adminId: string;
  name: string;
  type: SubjectType;
  status: SubjectStatus;
}
