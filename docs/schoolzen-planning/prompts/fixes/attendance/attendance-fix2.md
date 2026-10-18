# Attendance — fix 2 (P0 bugs, then R1, R5, R9)

Round 2 for Attendance (fix1 is applied, do not edit it). Fresh Claude Code session per part below, no agents, don't commit.
Read `prompts/fixes/global-fixes.md` first. Source of truth for the UI: `v1/attendance/attendance-overview.html|md`, `roster.html|md`, `manage-shifts.html|md`.

Before you say done: re-read the reference html/.md and list one line per item what you matched and what you could not;
run the build and the tests you wrote; do not report PASS for anything you have not run.

## Part D - P0 bugs: Route not found, student marking, class-first rule (RUN THIS FIRST)
Reported live: `{"error":{"category":"NotFoundError","message":"Route not found"}}` on **Refresh** and on **Mark**; student attendance does not get applied at all.

1. **Route not found (Refresh / Sync Now and Mark).** Diagnose first, 5 lines max: list every Attendance API call the frontend makes (method + final URL incl. base path and
   `/v2` prefix) and every route the backend registers; find the mismatch (wrong path/verb, route not mounted, base-path/proxy prefix, server not restarted). Fix it at the
   source. Add one test that walks the frontend service's URL list against the real route table so a missing route can never ship again.
2. **Student attendance not applying.** Trace one student end to end and report in 5 lines: mark request -> student identity (v2 student id, roll no) -> class/section
   enrolment -> ClassShift lookup -> window check -> permission -> write -> grid read-back. Fix the broken link. Staff marking must keep working.
3. **Class-first rule for students.** When Person Type = Student, attendance can be marked only after a **Class** is chosen (Stream / Stream Group / Section narrow it
   further). One person marks classes and sections one by one, so:
   - Student view with no Class selected: no rows, empty state "Select a class to see students and mark attendance" (also keeps the grid fast).
   - Marking sends the class (and section) context; the **server verifies** the student is enrolled in that class/section for the current session and rejects otherwise.
   - Chips stay locked, with tooltip "Select a class first", if the context is missing.
   - Staff view is unchanged.
4. Both errors above must show a clear message (not the raw JSON) and a Retry, and a failed mark leaves the cell unchanged.
5. Tests: route-table cross-check, student mark (happy path, wrong class, no class, past/future, outside window, no permission), refresh/sync route, Playwright: choose Student -> empty state -> choose Class -> mark Present.

## Part A - R1 dropdown/picker audit (Attendance pages: Overview, Roster, Manage Shifts)
Every dropdown, select, date/range picker and input on the three pages must use the shared overlay components (global rule 1): opens as an overlay
directly below its trigger, same size as siblings, disabled filters show the same "All ..." text. List every control with one line:
control, page, shared component yes/no, fixed or not. Fix every "no". No native `<select>` or one-off pickers left.

## Part B - R5 speed (Attendance)
Measure first, then fix, then re-measure. Report before/after ms per action, real numbers only:
- Overview grid load (month, staff and students), filter change, month change, Sync Now response, mark popover save.
- Roster load, assign, delete.
- Manage Shifts load, create, edit, delete.
Known: the staff grid takes 1.9-3.5 s. Targets: grid load under 500 ms warm, filter/month change under 300 ms, popover save under 300 ms perceived.
Likely fixes (verify, do not assume): one aggregation for the month (no per-person/day queries), `lean()` + projection, compound indexes matching the
query (`adminId, personType, date`, class/section), pagination server-side, Redis cache for the roster/shift lookups with invalidation on write, no N+1
in student shift lookup, cancel in-flight requests on filter change (switchMap), `trackBy` on all `*ngFor`, optimistic cell update, no blocking animations,
lazy chunk per page (global rule 3). Show the explain plan for the grid query before and after.

## Part C - R9 test round (Attendance only)
Write and run, with real counts, one suite per type (essential cases, not boilerplate):
1. Unit/spec: status calc (Present/Late/Absent/Half), manual mark guards, working-day resolver precedence, time formatting AM/PM.
2. Backend API: grid, mark (today/past/future/outside window/no permission/duplicate Idempotency-Key), roster assign/delete/re-assign, shifts CRUD + delete-in-use, sync.
3. Live (real DB): same flows against the real database with cleanup of the rows created.
4. Failure/rollback: kill the DB write mid-transaction (mark + activity log, roster bulk write, shift delete) and prove nothing half-saved; queue job retry does not duplicate a punch (`punchHash`); worker down does not break the grid.
5. Browser/UI (Playwright): Overview parity with html (chips, filters 6 per row, mobile 2 per row, sticky columns, past/future styles, popover), Roster delete->re-assign, Manage Shifts validation, mobile 390px.
Report pass/fail per suite. Fix real bugs you find; list any you could not fix.

## Status
After each part, update the Attendance row in the Status table of `global-fixes.md` (R1, R5, R9) with done / partial and a one-line note.
