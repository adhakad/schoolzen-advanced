/**
 * The Academic Setup module's class types.
 *
 * Lives under shared/models/<module>/, not inside the academic-setup component folder:
 * models sit in a top-level LAYER folder with a module subfolder inside, mirroring the
 * backend's models/academic-setup/class.js exactly
 * (docs/schoolzen-planning/v1/_core/frontend-backend-folder-structure.md).
 * These mirror the /v2/academic-setup payloads
 * field-for-field, so a page binds server data directly rather than re-shaping it.
 *
 * No display label is stored anywhere: a class is a number (200/201/202 being the
 * Nursery/LKG/UKG sentinels every collection in this app uses) rendered through
 * ClassSuffixPipe, and a stream is stored lowercase — the same value student.stream and
 * class-subject.stream hold — rendered through StreamTitleCasePipe.
 */

export interface ClassSection {
  _id?: string;
  name: string;
}

export interface ClassStream {
  _id?: string;
  name: string;
  sections: ClassSection[];
  /** Attached by GetClasses from the page's one grouped aggregation. */
  studentCount?: number;
}

export interface AcademicClass {
  _id: string;
  adminId: string;
  class: number;
  hasStreams: boolean;
  /** Populated only when hasStreams is false; a class with streams keeps them per stream. */
  sections: ClassSection[];
  streams: ClassStream[];
  studentCount: number;
}

/** One entry of the modal's Class Name dropdown: the standard names not yet configured. */
export interface ClassNameOption {
  class: number;
  label: string;
}

/** A stream while the modal is open: names are plain strings until Submit shapes them. */
export interface StreamDraft {
  name: string;
  sections: string[];
  /**
   * How many students this stream held when the page loaded, carried into the draft so
   * removing it can warn without another round-trip. 0 for a stream added in this modal.
   */
  studentCount: number;
}

/** Everything the Add/Edit modal edits, as a draft the parent owns and Submit sends. */
export interface ClassFormValue {
  /** null while adding; the document id while editing. */
  id: string | null;
  class: number | null;
  hasStreams: boolean;
  sections: string[];
  streams: StreamDraft[];
}

/** The request body both create and update send (update omits `class`, its identity). */
export interface ClassPayload {
  adminId: string;
  class?: number;
  hasStreams: boolean;
  sections: { name: string }[];
  streams: { name: string; sections: { name: string }[] }[];
}
