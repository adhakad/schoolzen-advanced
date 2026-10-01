/**
 * Turns an Academic Setup bulk-delete response into what the page shows: which ids really
 * went (to drop from the selection), a summary line, and one line per row that did NOT go —
 * never a single pass/fail toast for the whole selection (academic-setup/errors.md).
 *
 * The server sends a stable `code` per refused row; the page supplies the wording for its
 * own blocking code (it knows what the count means), the shared codes are worded here.
 */
import {
  BulkDeleteResponse, BulkDeleteResult, BulkOutcomeLine
} from 'src/app/shared/models/academic-setup/bulk-delete.model';

export interface BulkDeleteOutcome {
  deletedIds: string[];
  summary: string;
  /** Empty when every requested row was deleted. */
  lines: BulkOutcomeLine[];
  /** Whether there is anything beyond "all deleted" worth showing in the outcome panel. */
  hasDetails: boolean;
}

/** "3 students", "1 subject group" — the plural every blocking message needs. */
export const countOf = (count: number, noun: string, plural = noun + 's'): string =>
  count + ' ' + (count === 1 ? noun : plural);

const sharedCodeMessage = (result: BulkDeleteResult): string | null => {
  switch (result.code) {
    case 'NOT_FOUND': return 'This record no longer exists.';
    case 'SYSTEM_GROUP_LOCKED': return 'Automatic group — removed only with its class.';
    default: return null;
  }
};

export const bulkDeleteOutcome = (
  ids: string[],
  res: BulkDeleteResponse | null | undefined,
  labelOf: (id: string) => string,
  blockedMessage: (result: BulkDeleteResult) => string
): BulkDeleteOutcome => {
  // A response without per-row results is the old all-or-nothing shape: a 2xx meant every
  // requested row was deleted.
  const results: BulkDeleteResult[] = res && Array.isArray(res.results)
    ? res.results
    : ids.map((id) => ({ id, status: 'deleted' as const }));

  const deletedIds = results.filter((result) => result.status === 'deleted').map((result) => result.id);
  const lines: BulkOutcomeLine[] = results
    .filter((result) => result.status !== 'deleted')
    .map((result) => ({
      id: result.id,
      label: labelOf(result.id),
      message: sharedCodeMessage(result)
        || (result.status === 'blocked'
          ? blockedMessage(result)
          : result.status === 'not_found'
            ? 'This record no longer exists.'
            : result.message || "Couldn't be deleted — try again.")
    }));

  const warnings = (res && res.warnings) || [];
  const summary = [deletedIds.length + ' of ' + results.length + ' deleted.']
    .concat(warnings.map((warning) => warning.message))
    .join(' ');

  return { deletedIds, summary, lines, hasDetails: lines.length > 0 || warnings.length > 0 };
};
