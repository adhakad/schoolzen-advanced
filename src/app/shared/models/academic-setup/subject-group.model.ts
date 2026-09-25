/**
 * The Academic Setup module's subject-group types.
 *
 * Mirrors backend/modules/models/academic-setup/subject-group.js and the shapes
 * subject-groups.controller.js returns. A group stores IDs — classId, streamId, subjectIds
 * — and the server resolves the names in its own aggregation, so nothing here caches a
 * name that could drift from the record it came from.
 */

/** One subject chip on a row. Name resolved server-side from the referenced Subject. */
export interface SubjectGroupSubject {
  _id: string;
  name: string;
}

/** One table row, exactly as GetSubjectGroups returns it. */
export interface SubjectGroup {
  _id: string;
  name: string;
  classId: string;
  /** The class NUMBER (200/201/202 = Nursery/LKG/UKG), rendered through ClassSuffixPipe. */
  class: number;
  hasStreams: boolean;
  /** null for a class with no streams — the table's "— not applicable" cell. */
  streamId: string | null;
  /** Stored lowercase, rendered through StreamTitleCasePipe. */
  streamName: string | null;
  subjects: SubjectGroupSubject[];
}

export interface SubjectGroupSummary {
  total: number;
  classesCovered: number;
  streamsCovered: number;
}

export interface SubjectGroupListResponse {
  rows: SubjectGroup[];
  total: number;
  page: number;
  limit: number;
  summary: SubjectGroupSummary;
}

/** One entry of a class's streams[], by the sub-document id the group actually stores. */
export interface FormOptionStream {
  _id: string;
  name: string;
}

export interface FormOptionClass {
  _id: string;
  class: number;
  /** Server-rendered display name ("9th", "Nursery") — the twin of ClassSuffixPipe. */
  label: string;
  hasStreams: boolean;
  streams: FormOptionStream[];
}

/**
 * Everything both the toolbar's filters and the modal need, from ONE call — the classes
 * with their streams, and the live list of active subjects for the checklist.
 */
export interface SubjectGroupFormOptions {
  classes: FormOptionClass[];
  subjects: SubjectGroupSubject[];
}

/** Everything the Add/Edit modal edits, as a draft the component owns and Submit sends. */
export interface SubjectGroupFormValue {
  /** null while adding; the document id while editing. */
  id: string | null;
  classId: string;
  streamId: string;
  name: string;
  /** Checked subject ids, kept as a Set for O(1) toggling on a long checklist. */
  subjectIds: Set<string>;
}

/** The request body both create and update send. */
export interface SubjectGroupPayload {
  adminId: string;
  classId: string;
  streamId: string | null;
  name: string;
  subjectIds: string[];
}
