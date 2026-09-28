/**
 * The academic-session label format, frontend side: the full "2026-2027".
 *
 * Mirrors backend/modules/helpers/academic-session-format.js, and matches what the live
 * system already stores (the session cron writes `${year}-${year + 1}`). A session label is
 * a join key across modules, so it is only ever built through here — never re-derived with
 * a two-digit year.
 */

/** "2026-2027" for a session starting in 2026. */
export const formatSession = (startYear: number): string => `${startYear}-${startYear + 1}`;

/**
 * The session running today, for a year that starts in April — the placeholder the shell
 * shows only when the server has no academic-session document at all.
 */
export const currentSessionLabel = (now: Date = new Date()): string =>
  formatSession(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1);
