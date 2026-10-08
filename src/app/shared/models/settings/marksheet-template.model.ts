/** Settings → Marksheet Templates — the shapes of /api/v2/settings/marksheet-templates. */
import { ClassScopeNode } from 'src/app/shared/models/settings/roles.model';

export interface MarksheetTemplate {
  _id: string;
  code: string;
  name: string;
  terms: string[];
  gradeScale: string;
  theoryMax: number;
  theoryPass: number;
  practicalMax: number | null;
  coScholasticAreas: string[];
  supplyLimit: number;
  /** [grade, min, max] */
  gradeRows: (string | number)[][];
  /** Classes using it in the active session — counted live. */
  usedBy: number;
  usedByClasses: string[];
}

export interface MarksheetTemplatesResponse {
  templates: MarksheetTemplate[];
  classes: ClassScopeNode[];
}

export interface CodedNotice { code: string; message: string; }

export interface AssignPreview {
  usedByOthers: number;
  reassignWarning: CodedNotice | null;
  existing: (CodedNotice & { templateId: string; templateCode: string | null; sameTemplate: boolean; note: string }) | null;
  subjectGroupMissing: CodedNotice | null;
}

export interface AssignPayload {
  adminId: string;
  templateId: string;
  classId: string;
  streamId: string | null;
  replace: boolean;
}

export interface AssignResponse {
  message: string;
  unchanged?: boolean;
  warning?: CodedNotice;
  note?: string;
}
