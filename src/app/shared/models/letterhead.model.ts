/**
 * The shared letterhead document — what backend/modules/services/pdf/letterhead.service.js
 * returns and <app-letterhead-document> renders. One shape for every printable document in
 * the app (Admission Letter today; Fee Receipt, Admit Card, Marksheet and TC reuse it), so
 * no module builds its own print template.
 */

export interface LetterheadField {
  label: string;
  value: string;
}

export interface LetterheadDocument {
  header: {
    schoolName: string;
    logoUrl: string | null;
    metaLines: string[];
  };
  title: string;
  subtitle: string | null;
  sectionLabel: string | null;
  fields: LetterheadField[];
  note: string | null;
  generatedAt: string;
}
