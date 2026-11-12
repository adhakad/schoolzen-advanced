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

## Report (Claude Code fills)
| Item | Done | Proof | Notes |
|---|---|---|---|
| A backend | Yes | `node backend/scripts/v2-test-school-profile.js` — A tests ok (save, update, 1 doc/adminId + unique index, 23 validation refusals, logo >100 KB / GIF / fake PNG → 400, 403 without key and edit-403 with view-only, log row with field names + actor name, other tenant 403) | Model already existed from shared-fix5 (`models/settings/school-profile.js`, `v2-school-profile` / `v2-school-profiles`, export `SchoolProfileV2Model`) — kept in the same file style as every other v2 model, no rename, no collection change; added `udiseNumber`, `principalName`, `website`, `senderName`, `updatedByName`. New: `controllers/settings/school-profile.controller.js`, `routes/settings/school-profile.routes.js` (mounted in `routes.js`), `validators/settings/school-profile.validator.js`, `logoFile` (100 KB) in `middleware/single-upload.js`, `actorNameV2` export in `services/v2-activity-log.service.js`. Key `settings-school-profile` added to `PERMISSION_MODULES` (Super Admin gets it automatically) + label/icon in Roles & Permissions. Logo upload goes to Cloudinary — success path not run in tests (only rejections). |
| B lists | Yes | test "A. lists": 4 + 1 + 35 boards (40 unique), 36 states | `backend/modules/helpers/settings/v2-school-profile-lists.js` — one file: backend Joi validation + sent to the page in GET (dropdown renders from it). Legacy `boards` collection read once, read-only, on 2026-11-12: 6 rows (CBSE, CISCE, MP Board, Rajasthan Board, UP Board, Chhattisgarh Board) — all already in the html list, mapping recorded in the file header, nothing added. No runtime legacy read. |
| C page | Yes | Playwright `e2e/school-profile.spec.ts` 3/3 pass (390/1366/1920); Karma `school-profile.component.spec.ts` 8/8 pass; `npm run build` OK | `src/app/settings/school-profile/*`, route + declaration in Settings module, 5th sidebar item (`shell-nav.config.ts`). Deviations: empty form instead of the html's sample values; "Select board"/"Select state" placeholder options so no board/state is saved by accident. |
| D readers | Yes | test "D. letterhead BEFORE/AFTER" prints both headers: before `SCHOOL`, `metaLines: []`; after `GREEN VALLEY PUBLIC SCHOOL` + `CBSE · Affil./Recog. No. 1030123 · School Code GV-0142` / `12, Vijay Nagar Main Road, Mhow, Indore, Madhya Pradesh - 452010` / `9876543210 · office@greenvalley.in` | `services/pdf/v2-letterhead.service.js` (used by TC, admit card, marksheet, fee receipt, payslip, admission letter) now uses the same line rules as the preview; `workers/fees-worker.js` sender = `senderName` → `schoolName` → `''`. Print LAYOUT of `app-letterhead-document` unchanged (left logo, left-aligned per admission.html) — only the text matches the preview. Proof is the shared service, not a browser print preview. |
| E holidays seed | Yes (script); app DB not seeded | test E: dry run writes 0; apply 324 rows / 108 docs; re-run adds 0; owner `--file` rows added once, owner rows kept; reader `/holiday/system-holidays` returns Republic Day, Independence Day, Gandhi Jayanti. Dry run on the app DB: 108 docs / 324 rows to add, 0 written | `backend/scripts/v2-seed-system-holidays.js` (dry run default, `--apply`, `--file=dates.json`, `state: "ALL"` allowed). Not applied to the app database — owner runs `node scripts/v2-seed-system-holidays.js --apply`. **Owner must supply dates:** Holi, Diwali, Dussehra, Eid al-Fitr, Eid al-Adha, Muharram, Good Friday, Janmashtami, Ram Navami, Mahavir Jayanti, Buddha Purnima, Guru Nanak Jayanti, Makar Sankranti/Pongal, Ganesh Chaturthi, Onam, Christmas and state days (state-dependent). |
| F tests | Yes | `v2-test-school-profile.js` 17/17; `v2-test-write-paths-live.js` 21/21 (new School Profile block: create, update, read back, log row with actor name, cleanup 0 left); guard `v2-test-model-names.js` 10/10; all other `backend/scripts/v2-test-*.js` pass; Playwright `e2e/school-profile.spec.ts` 3/3 (390/1366/1920: opens, empty state, fill + save, preview centred ±2px, logo ends ≥10px above the divider, no overflow, 1 column + Save 44px at 390); Karma spec 8/8; `npm run build` OK (only the existing legacy CSS budget warnings) | `v2-test-attendance-grid-hint.js` NOT run: it needs a real school adminId argument and stopped on its usage check. Full Karma suite and other Playwright specs not re-run. |
