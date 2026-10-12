/**
 * Examination (module 9) — request/response shapes for /api/v2/examination.
 * Mirrors backend controllers/examination/*.controller.js.
 */
import { LetterheadDocument } from 'src/app/shared/models/letterhead.model';

export type LetterheadHeader = LetterheadDocument['header'];

/* --- Marksheet Structure --- */

export interface MarksheetStructureRow {
  classId: string;
  className: string;
  streamId: string | null;
  streamName: string | null;
  templateCode: string | null;
  subjectsSet: number;
  subjectsTotal: number;
  setUp: boolean;
  version: number;
}

export interface MarksheetStructureList {
  rows: MarksheetStructureRow[];
  summary: { classesTotal: number; setUp: number };
  canEdit: boolean;
}

export interface MarksheetSetupSubject {
  subjectId: string;
  theoryMax: number | null;
  practicalMax: number | null;
}

export interface MarksheetSetup {
  classId: string;
  streamId: string | null;
  label: string;
  template: { code: string; terms: string[]; gradeScale: string; theoryMax: number; practicalMax: number | null } | null;
  notConfigured: { code: string; message: string } | null;
  candidates: { subjectId: string; name: string }[];
  subjectsMissing: { code: string; message: string } | null;
  subjects: MarksheetSetupSubject[];
  version: number;
  canEdit: boolean;
}

/* --- Generate Marksheet --- */

export type MarksStatus = 'entered' | 'pending' | 'nostructure';

export interface MarksheetRow {
  studentId: string;
  name: string;
  initials: string;
  rollNumber: number | null;
  classId: string;
  streamId: string | null;
  className: string;
  streamName: string | null;
  status: MarksStatus;
}

export interface MarksheetListResponse {
  rows: MarksheetRow[];
  nextCursor: string | null;
  total: number | null;
  summary: { entered: number; pending: number; missing: number } | null;
  terms: string[];
  term: string;
  canEdit: boolean;
}

export interface MarksSubject {
  subjectId: string;
  name: string;
  theoryMax: number | null;
  practicalMax: number | null;
}

export interface SavedResult {
  subjects: { subjectId: string; theory: number | null; practical: number | null }[];
  coScholastic: { area: string; grade: string }[];
  totals: ResultTotals;
  updatedAt: string;
}

export interface ResultTotals {
  obtained: number;
  max: number;
  percentage: number;
  grade: string | null;
  result: 'Pass' | 'Fail';
}

export interface MarksForm {
  studentId: string;
  name: string;
  term: string;
  terms: string[];
  subjects: MarksSubject[];
  coScholasticAreas: string[];
  gradeRows: [string, number, number][];
  passPercent: number;
  result: SavedResult | null;
  canEdit: boolean;
}

export interface MarksEntry {
  subjectId: string;
  theory: number | string | null;
  practical?: number | string | null;
}

export interface MarksSavePayload {
  term: string;
  marks: MarksEntry[];
  coScholastic: { area: string; grade: string }[];
  expectedUpdatedAt: string | null;
  overwrite: boolean;
}

export interface BulkForm {
  term: string;
  className: string;
  subjects: MarksSubject[];
  rows: { studentId: string; name: string; marks: { subjectId: string; theory: number | null }[]; updatedAt: string | null }[];
}

export interface BulkSavePayload {
  term: string;
  overwrite: boolean;
  rows: { studentId: string; marks: { subjectId: string; theory: number | string | null }[]; expectedUpdatedAt: string | null }[];
}

export interface MarksheetDocument {
  studentId: string;
  name: string;
  fatherName: string;
  rollNumber: number | null;
  className: string;
  subjects: {
    name: string; theory: number | null; theoryMax: number | null; practical: number | null; practicalMax: number | null; total: number; grade: string | null;
  }[];
  totals: ResultTotals;
  coScholastic: { area: string; grade: string }[];
}

export interface SkippedNotice {
  count: number;
  code: string;
  message: string;
}

export interface MarksheetPrintResponse {
  header: LetterheadHeader;
  title: string;
  documents: MarksheetDocument[];
  skipped: SkippedNotice | null;
}

/* --- Admit Card Structure --- */

export interface GenerationView {
  state: 'generating' | 'ready' | 'partial' | 'failed';
  total: number;
  generated: number;
  failed: number;
  message: string | null;
}

export interface AdmitStructureRow {
  _id: string;
  examName: string;
  subjectCount: number;
  classId: string;
  className: string;
  streamName: string | null;
  groupName: string | null;
  sectionName: string | null;
  generation: GenerationView;
}

export interface AdmitStructureList {
  rows: AdmitStructureRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { classesTotal: number; examsConfigured: number };
  canEdit: boolean;
}

export interface AdmitStructureOptions {
  subjects: { subjectId: string; name: string }[];
  examNames: string[];
  groups: { _id: string; name: string }[];
}

export interface ScheduleRow {
  subjectId: string;
  examDate: string;
  startTime: string;
  endTime: string;
}

export interface AdmitStructureDetail {
  _id: string;
  classId: string;
  streamId: string | null;
  groupId: string | null;
  sectionId: string | null;
  examName: string;
  className: string;
  streamName: string | null;
  groupName: string | null;
  sectionName: string | null;
  subjects: (ScheduleRow & { name: string; dateText: string; timing: string })[];
  staleSubjects: { code: string; message: string; subjectIds: string[] } | null;
  version: number;
  generation: GenerationView;
}

export interface AdmitStructurePayload {
  classId: string;
  streamId: string;
  groupId: string;
  sectionId: string;
  examName: string;
  subjects: ScheduleRow[];
  acknowledgeWarnings: boolean;
  version?: number;
}

export interface AdmitStructureSaveResponse {
  message: string;
  _id: string;
  jobId: string;
  students: number;
  version?: number;
}

/* --- Generate Admit Card --- */

export interface AdmitCardRow {
  rowId: string;
  cardId: string | null;
  studentId: string;
  name: string;
  initials: string;
  rollNumber: number | null;
  className: string;
  streamName: string | null;
  examName: string | null;
}

export interface AdmitCardListResponse {
  rows: AdmitCardRow[];
  nextCursor: string | null;
  total: number | null;
  summary: { withCard: number; missing: number } | null;
}

export interface AdmitCardDocument {
  cardId: string;
  studentId: string;
  examName: string;
  title: string;
  name: string;
  dob: string;
  motherName: string;
  fatherName: string;
  className: string;
  rollNumber: number | null;
  schedule: { no: number; subjectName: string; examDate: string; timing: string }[];
}

export interface AdmitCardPrintResponse {
  header: LetterheadHeader;
  documents: AdmitCardDocument[];
  skipped: SkippedNotice | null;
}

/** The shared print-mode choice: one or two documents per page. */
export type PrintMode = 1 | 2;
