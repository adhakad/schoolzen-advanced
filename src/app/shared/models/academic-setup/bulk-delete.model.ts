/**
 * The bulk-delete contract shared by all three Academic Setup pages (Classes & Sections,
 * Subject Groups, Subjects).
 *
 * The server answers with one outcome PER requested id — never a single pass/fail for the
 * whole selection — so the page can say exactly which rows went and which were refused.
 */
export type BulkDeleteStatus = 'deleted' | 'blocked' | 'not_found' | 'error';

export interface BulkDeleteResult {
  id: string;
  status: BulkDeleteStatus;
  /** Stable error code (CLASS_HAS_STUDENTS, SUBJECT_IN_USE, SUBJECT_GROUP_IN_USE, ...). */
  code?: string;
  /** How many dependent records blocked this row. */
  blockingCount?: number;
  message?: string;
}

/** Non-blocking after-effects (the delete already happened), e.g. SUBJECT_GROUP_EMPTIED. */
export interface BulkDeleteWarning {
  code: string;
  count?: number;
  message: string;
}

export interface BulkDeleteResponse {
  message?: string;
  deletedCount?: number;
  blockedCount?: number;
  notFoundCount?: number;
  results?: BulkDeleteResult[];
  warnings?: BulkDeleteWarning[];
}

/** One line of the per-row outcome panel shown after a bulk delete. */
export interface BulkOutcomeLine {
  id: string;
  label: string;
  message: string;
}
