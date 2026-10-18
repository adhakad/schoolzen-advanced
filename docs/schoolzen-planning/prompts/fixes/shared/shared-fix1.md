# Shared / cross-module fix 1 (found during Attendance fix 2)

For bugs that live in shared code or hit several modules. Fresh Claude Code session, no agents, don't commit.
Read `prompts/fixes/global-fixes.md` first.

Before you say done: re-read the reference html/.md and list one line per item what you matched and what you could not;
run the build and the tests you wrote; do not report PASS for anything you have not run.

## S1. Auth interceptor (P0, affects every module)
- The frontend interceptor treats **every 403** as an expired login and tries to refresh the token at `/api/admin/refresh`, which does not exist (real route: `/v1/admin/refresh`).
  Attendance was patched; **find the same wrong URL and the same 403 handling everywhere else** (Staff and any other module) and fix it in ONE shared place.
- Rule: only **401** triggers a token refresh (once, then retry the request once, then logout). A **403** is a permission / business refusal and must reach the page with its
  message (e.g. "outside the marking window"). Never call a refresh URL that is not in the backend route table.
- Test: 401 -> one refresh -> retry succeeds; 401 + refresh fails -> logout; 403 -> no refresh, message shown; refresh URL exists in the route table.

## S2. Session resolution (P0)
- Mark failed for students because the header session (2026-2027, holds enrolments and class shifts) differed from the server's "active" session (2027-2028).
- Rule: every Attendance / Roster / Leave / Fees / Certificates request that depends on a session uses the **session the user selected (sent by the client)**, validated against
  the school's sessions. The server's "active" flag is only the default when the client sends nothing. Never silently fall back to a different session.
- Report which modules resolve the session from the server flag today and fix them to the rule above.
- Also report (do not change data): which session is flagged active for this school and whether that is correct for today's date. The owner will decide.

## S3. Month filter width in Holiday (and any other page)
Holiday has its own month-filter width. Make every month filter use the shared `.month-nav` with `--month-filter-w` (one filter cell wide, 3-letter month names, see global-fixes Rule 7). Grep for any other per-page width override and remove it.

## S4. Test setup
The four older Playwright parity tests pass only with `--workers=1` (shared state in parallel). Make them independent (own test data / own page state) so they pass in parallel, or set `workers: 1` in the Playwright config for these specs and say so.

## Status
Add a short "Notes - Shared" line under the Status table in `global-fixes.md` for what was done / not done.
