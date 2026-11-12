# shared-fix6 — School Profile page + public holidays seed (production blockers)

Reference: `v1/settings/school-profile.html` and `school-profile.md` (UI must match the html; do not invent components). Rules 21-23 in `prompts/fixes/global-fixes.md` apply. Read `settings/errors.md` (update at the end) for why this page exists.

## A. School Profile backend
1. New v2 model `v2-school-profile` (file and export start with v2), collection `v2-school-profiles`, one document per `adminId` (unique index). Fields exactly as in `school-profile.md`. Never read or copy the legacy school collection.
2. `GET /api/v2/settings/school-profile` (returns the profile or `null`) and `PUT /api/v2/settings/school-profile` (upsert, server-side validation of every rule in the md: lengths, 4-digit year starting 19/20, 6-digit pin, 10-digit phones, email, logo up to 100 KB PNG/JPG, board and state must be in the lists).
3. Permission key `settings-school-profile`: seed it, show it in Roles & Permissions, enforce it on both routes. Every save writes an activity log (`settings.school-profile.save`, changed field names only, with the actor name) via the v2 logger.
4. Sender name defaults to the School Name the first time it is saved.

## B. Lists (constants in v2 code)
1. Board list: groups National (CBSE, CISCE, NIOS, IB), District affiliated up to Class 8 (District Education Office, DEO), and the 35 state boards listed in `school-profile.html`. One-time at build time, read the existing legacy board list (`boardsName`, `boardsShortName`, `boardNameByState`) and merge anything missing into the constants file. No runtime read from legacy.
2. State list: the 36 states and UTs in the html.
3. Both lists live in one shared constants file used by the backend validation and the frontend dropdown.

## C. School Profile page (match school-profile.html)
1. Settings sidebar: "School Profile" as the 5th item on every Settings page.
2. The form, letterhead preview (live while typing, name and the line under it centred, logo left and never touching the divider), empty-state note, Save button rules, toast, "Last saved" line, mobile layout at 390px (one column, Save 44px). Skeleton while loading, error with Retry (Rule 22). Double-submit guard.
3. No table, no Create/Delete.

## D. Wire the readers
1. Letterhead print template (certificates, admit card, marksheet, receipts) and the fee-reminder sender read the profile. When no profile exists keep the current fallback without crashing.
2. Prove it with one real print preview (or the print data endpoint) before and after saving a profile.

## E. Public holidays seed
1. Look at the v2 system-holiday model (`v2-system-holidays`) and the "public holidays" reader. Today there is no writer or seed, so it always returns nothing.
2. Write an idempotent seed script `scripts/v2-seed-system-holidays.js` (dry-run first, re-run safe, no legacy copy) that inserts the fixed-date national holidays: Republic Day (26 Jan), Independence Day (15 Aug), Gandhi Jayanti (2 Oct) for the current year and the next two.
3. Do NOT guess festival dates that change every year (Holi, Diwali, Eid, Good Friday and so on). List them in the report as "owner must supply dates"; leave the script ready to accept a JSON file of dates.
4. Show the "public holidays" reader returning the seeded rows.

## F. Tests (essential)
- Backend: save, update, validation failures (each rule), permission 403, activity log row in v2-activity-logs with actor name, one document per adminId, other tenant cannot read it.
- Add School Profile to `scripts/v2-test-write-paths-live.js` (create, update, read back, log row, cleanup).
- Playwright at 390 / 1366 / 1920: page opens, empty state, fill and save, preview updates and stays centred, logo does not overlap the divider, no overflow.
- Guard test (v2 naming, collection `v2-school-profiles`) still passes; run the build and all backend tests.

## G. Not in this run
Limiting classes to 8 when the board is "District Education Office"; WDMS; device punches.

## H. Follow-up round (after the first run of A to F)
Read this round after A to F. It replaces E.3 and adds proof for the logo and the seed.
1. Logo upload and update must really work and be proven through the REAL route with a multipart upload, not only the failure paths: (a) first save with a PNG up to 100 KB, (b) update that replaces the logo, (c) update that keeps the old logo when no file is sent, (d) remove logo, (e) reload the page and see the logo in the form and in the letterhead preview, (f) too big (over 100 KB) and wrong type (not PNG/JPG) are refused with a clear message. Add (a) to (f) to `v2-test-school-profile.js` and one Playwright test that uploads a small PNG at 1366 and 390 widths. Store the file the way the app already stores other v2 uploads; do not invent a new storage.
2. Public holidays seed: use the data file `prompts/fixes/shared/data/system-holidays-2026-2027.json` (copy it next to the seed script). Each row has `date`, `name`, `category` (national, hindu, other). Default seed inserts only `national` and `hindu` rows (Republic Day, Independence Day, Gandhi Jayanti, Holi, Ram Navami, Janmashtami, Dussehra, Diwali for 2026 and 2027). A flag `--include-other` adds the rest (Eid, Good Friday, Christmas and so on). Idempotent (same date + name never twice), `--dry-run` first, then run it for real on the dev database and show the "public holidays" reader returning the rows. The 2027 dates come from a secondary source and moon-dependent dates can shift by a day; say so in the report, and keep every row editable by date in the data file.
3. Do not add other Hindu festivals (Maha Shivratri, Makar Sankranti, Raksha Bandhan, Ganesh Chaturthi, Navratri and so on): they are not in the gazetted list and no verified dates were given. Leave a one-line note in the report that the owner can send dates to add them.
4. Run the one backend test that was skipped last time (the `v2-test-attendance-*` that did not run) and report its result.
5. Run the full backend test suite once on the final code and give the test table with rc and PASS/FAIL.
6. Same standing rules: no commit, no legacy copy, v2 names, collection names unchanged.

## Report (Claude Code fills)
| Item | Done | Proof | Notes |
|---|---|---|---|
| A backend | Yes | `v2-test-school-profile.js` 24/24 (save, update, 1 doc/adminId, 23 validation refusals, 403 without `settings-school-profile`, log row with field names + actor name, other tenant 403) | Existing model `models/settings/school-profile.js` (`v2-school-profile` / `v2-school-profiles`) kept, fields added; collection unchanged. |
| B lists | Yes | test "A. lists": 40 boards, 36 states | `helpers/settings/v2-school-profile-lists.js`; legacy `boards` read once (6 rows, all already in the list). |
| C page | Yes | Playwright `e2e/school-profile.spec.ts` 5/5; Karma 8/8; `npm run build` OK | Deviations: empty form (no sample values); "Select board/state" placeholders; a "Remove" logo button (needed for H.1d, not in the html). |
| D readers | Yes | test D: letterhead before = `SCHOOL`, after = full lines; logo URL in letterhead (H.1e) | Print layout of `app-letterhead-document` unchanged (left-aligned); text matches the preview. |
| E holidays seed | Yes | see H.2 | E.3 replaced by H.2 (data file). |
| F tests | Yes | see H.5 | |
| H.1 logo | Yes | `v2-test-school-profile.js` H.1a–f over the REAL multipart route + Cloudinary (the existing v2 upload service): (a) 237-byte PNG saved, URL serves 200; (b) replace → new public id, old returns 404 on Cloudinary; (c) no file → logo kept; (d) `removeLogo` → null in profile + letterhead, file destroyed; (e) GET + letterhead return the logo; (f) 101 KB → "Logo must be 100 KB or smaller.", GIF / renamed PDF → "Only JPG/PNG images are allowed.". Playwright upload → save (multipart with `logo.png`) → reload shows logo in form + preview, at 1366 and 390: 2/2 | Test logos destroyed on Cloudinary after the run. Playwright is hermetic (API mocked); the real-route proof is the backend test. |
| H.2 holidays seed | Yes | Data copied to `backend/scripts/v2-system-holidays-2026-2027.json`. Dev DB (`schoolzen-advanced`): `--dry-run` → 72 docs / 576 rows, 0 written; `--apply` → 576 rows / 72 docs; re-run → 0 added, 576 already present. Reader (`GetSystemStates` / `GetSystemHolidays`) on dev DB: 36 states, years [2027, 2026]; MP 2026: Republic Day, Holi 03-04, Ram Navami 03-26, Independence Day, Janmashtami 09-04, Mahatma Gandhi's Birthday, Dussehra 10-20, Diwali 11-08; MP 2027: Republic Day, Holi 03-23, Ram Navami 04-15, Independence Day, Janmashtami 08-25, Mahatma Gandhi's Birthday, Dussehra 10-09, Diwali 10-29 | Each row goes to all 36 states/UTs (central gazetted list). `--include-other` adds the 18 `other` rows (tested, not applied on dev). 2027 dates come from a secondary source (DoPT OM cited, not verified against the official OM); moon-dependent dates can shift by a day — edit the date in the data file and re-run. |
| H.3 other festivals | Not added | — | Maha Shivratri, Makar Sankranti, Raksha Bandhan, Ganesh Chaturthi, Navratri etc. are not in the gazetted list: owner can send dates to add them to the data file. |
| H.4 skipped test | Yes | `v2-test-attendance-grid-hint.js 69bad56591922be08347d4d9 6abe7dc839728a75cdd55319` rc=0: staff PASS (3 rows), student PASS (53 rows) | Needs a real school id + class id; read-only except one cache key. |
| H.5 full backend suite | Yes | 25/25 rc=0: activity-log-live 11, approvals 10, attendance 18, attendance-api 10, attendance-failure 6, attendance-fix4 9, attendance-fix5 15, attendance-fix5-live 8, attendance-grid-hint 2, attendance-mark 18, attendance-routes 19/19, certificates 7, dashboard 15, examination 11, fees 10, holiday 5, leave 9, model-names (guard) 10, payroll 12, school-profile 24, session-resolution all, session-switch 4, shared-fix5-live 26, working-day 6, write-paths-live 21 — all PASS | |
| H.6 rules | Yes | guard test 10/10 | No commit, no legacy copy, new files v2-named, collection names unchanged. |
