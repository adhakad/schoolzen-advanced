# Shared fix 2 — academic session source (header + every page)

Read `prompts/fixes/global-fixes.md` first (Rules 14-20; this file is Rule 18). Do not edit `shared-fix1.md`.

## Problem
Top header "session year" still shows data of the OLD academic session. The v2 academic-session collection is not the source: the year is not read from it, so pages show data of an older session.

## Fix (do in this order)
1. Find where the header session dropdown gets its list and its selected value. It must read ONLY the v2 academic-session collection (`name`/year, start and end date, isActive flag). Remove any legacy read (v2 isolation).
2. Default selection: the session whose dates cover today; if none, the latest by start date. Never default to a session only because an old record is flagged active. Remember the user's choice (per user) and send it with every API request (header or param, one shared way).
3. Backend: one shared helper resolves the session id for a request: sent id, validated against the school (`adminId`), else the default above. Unknown id = 404. Every session-scoped query uses this helper. No page may compute its own session.
4. Switching the header session reloads the data of the current page for that session (no stale lists, no stale Redis cache: cache keys include the session id).
5. If one school has the wrong "active" flag (earlier report: school `69ba...` has 2027-2028 active while today is in 2026-2027), do not change data. Report it in the Notes.

## Page-by-page audit (mandatory)
For EVERY page of EVERY built module (Dashboard, Student, Academic Setup, Staff, Attendance Overview/Roster/Manage Shifts, Leave, Holiday, Payroll, Fees, Examination, Certificates, Approvals, Settings) fill this table in the Notes below: page | endpoint | where the session comes from (header id / own calc / legacy / not session-scoped) | fixed?
Pages that are session-scoped must use the header session. Pages that are not session-scoped (e.g. Settings) are marked "not session-scoped" with one line why.

## Tests (essential)
- Backend: helper returns the sent session, the default (covers today), 404 for unknown/other-school id. 
- Live DB: create two sessions with different data, switch, confirm each page's list changes (Student list and Attendance grid minimum). Clean up.
- Browser: header switch changes the data on two pages, choice survives reload.

## Notes (Claude Code fills)
