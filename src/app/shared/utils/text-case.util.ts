/**
 * Display-only text case for free-text table columns (manage-students.md, "Per-column
 * text-case + sort"). It never touches the stored value, never triggers a save, and is
 * never part of an export/import — it is applied only where a cell is rendered.
 */

export type TextCase = 'title' | 'upper' | 'lower';

/** The page-load state for every case-toggleable column. */
export const DEFAULT_TEXT_CASE: TextCase = 'title';

export const TEXT_CASE_OPTIONS: readonly { value: TextCase; label: string }[] = [
  { value: 'title', label: 'Title Case' },
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'lower', label: 'lowercase' }
];

export const textCaseLabel = (mode: TextCase): string =>
  (TEXT_CASE_OPTIONS.find((option) => option.value === mode) || TEXT_CASE_OPTIONS[0]).label;

/**
 * Title Case capitalises the first letter of each word — after a space, hyphen or period
 * ("rohan kapoor-singh" → "Rohan Kapoor-Singh", "a.k. verma" → "A.K. Verma") — and lowers
 * the rest, so "ROHAN KAPOOR" displays as "Rohan Kapoor" too.
 */
export const applyTextCase = (value: string | null | undefined, mode: TextCase): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (mode === 'upper') return text.toLocaleUpperCase('en-IN');
  if (mode === 'lower') return text.toLocaleLowerCase('en-IN');
  return text.toLocaleLowerCase('en-IN').replace(/(^|[\s\-.])(\p{L})/gu, (_match, lead: string, letter: string) =>
    lead + letter.toLocaleUpperCase('en-IN'));
};

export type SortDir = 'asc' | 'desc';

/**
 * Case-insensitive, so the case a column is DISPLAYED in never changes its order. Empty
 * values go last in both directions — a "—" row is never the first thing an ascending
 * sort shows.
 */
export const compareText = (a: string | null | undefined, b: string | null | undefined, dir: SortDir): number => {
  const left = (a || '').trim();
  const right = (b || '').trim();
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  const order = left.localeCompare(right, 'en-IN', { sensitivity: 'base', numeric: true });
  return dir === 'asc' ? order : -order;
};
