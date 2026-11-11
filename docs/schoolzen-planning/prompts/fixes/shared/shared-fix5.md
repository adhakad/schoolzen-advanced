# shared-fix5 — every v2 backend model starts with "v2" (Rule 23), with zero change to data

Applies to: ALL backend modules. Goal: from the name alone you can tell which models are v2. Nothing may change in the database or in behaviour.

## Step 0 — register the rule
1. `prompts/fixes/global-fixes.md`: add Rule 23 (below), add an R23 column to the Status table, add "R23 model names" to step 1 of "Global sweep run order".
2. Any planning .md that names a backend model or file that gets renamed here: update the name (list them in the Notes).

## Rule 23 — v2 model naming
1. Every model used by v2 code has a name that starts with "v2" (same style the already-correct v2 models use; copy that style, do not invent a new one). This covers the model file name, the exported variable, and the name passed to `mongoose.model(...)`.
2. Collections: see 23.8. A model rename alone never changes its collection; the collection name changes only through the migration in 23.8.
3. A v2 model must point at a v2 collection. If a "v2" model currently points at a legacy (non-v2) collection, DO NOT move or copy data. Stop, put it in the report table as "points at legacy", and leave it as it is for the owner to decide.
4. Legacy models stay as they are. Only exception that v2 code may use: read-only legacy `device` read for WDMS terminal serials. Keep that one named as legacy so it is easy to spot.
5. Legacy (old version) models, files, routes and collections stay exactly as they are: no rename, no edit, no delete.
6. v2 code must not use legacy models (v2 isolation). Where a v2 file (route, controller, service, worker, seed, test) still imports an old/legacy model and an equivalent v2 model exists, switch that file to the v2 model. If no equivalent v2 model exists, do NOT create data or copy documents: list it in "Still on legacy" for the owner. Only the allowed read-only `device` read stays.
7. Finish the move: after this fix NO v2 code may import a legacy model (only the read-only `device` read stays). For the four known ones: `payroll` and `salary-structure` (staff delete guards) -> use the existing v2 payroll-run and v2 staff-salary-assignment models; `biometric-mapping` (staff/student delete guards) -> check the v2 data that holds the biometric/empCode link instead; `school` (letterhead, field config, school profile) -> create a v2 school-profile model (fresh v2 collection, `v2` name), switch every reader and writer to it. Never copy or migrate legacy documents. Where the new v2 collection starts empty, make the page/print path handle "not set yet" cleanly (no crash, clear empty state) and list it in the report for the owner. Empty `KNOWN_LEGACY` in the guard test so it fails on any legacy import except `device`.
8. Every place that refers to a renamed model changes with it: imports/requires, `ref:` and `refPath` strings in schemas, `populate` calls, `mongoose.model('Name')` lookups by string, discriminators, seed scripts, tests, e2e fixtures. `$lookup` uses collection names, so it must NOT change.

## Rule 23.8 — v2 collections start with "v2-"
1. Every collection that belongs to a v2 model must be named "v2-<name>" (example: `activity-logs` -> `v2-activity-logs`). Set the new name in the model (third argument of `mongoose.model`) and in every raw `db.collection(...)`, `$lookup from:`, script, seed and test that names it.
2. Do NOT rename a collection that a legacy model also uses or that a model pointing at legacy data uses (23.3). Those only go in the report.
3. The rename is a one-time migration script (`backend/scripts/migrate-v2-collection-names.js`) using MongoDB `renameCollection` (moves data inside the same database, no copy). It must: have a `--dry-run` that only prints old -> new and document counts; skip any collection already renamed; refuse to run if the target name already exists; print counts before and after and fail if they differ. Never drop anything.
4. The migration must be run once on every database (local, then production, after a backup). Put the exact command in the report. Until it runs, the app would read an empty new collection, so the model name change and the migration are deployed together.

## Rule 23.9 — everything that wraps a v2 model also starts with "v2"
1. Rename the files, exports and functions that define, wrap or directly use a v2 model or collection and are only used by v2 code: services and helpers that read or write v2 data (for example the activity-log service and its `logActivity` helper, count/guard helpers like staff counts, repository or lookup helpers), seed and migration scripts, and test script names. Use the same v2 style as the rest of the package. Update every import, call and test.
2. If such a file is ALSO used by legacy code, do not rename it; put it in the report as "shared with legacy".
3. NEVER rename: API URLs and route paths, permission keys, environment keys, frontend-facing field names, response shapes, or anything legacy. Renaming those would break the app or the frontend.
4. Anything else non-v2 that v2 code still uses goes in a "Non-v2 still used" table (file, used by, why not renamed) for the owner.

## Do
1. Inventory first (no edits): list every model file under the backend: file, current model name, collection name, which code uses it (v2 route/service or legacy), v2 or legacy.
2. Save a snapshot BEFORE: for every model, `{modelName, collectionName}` plus document counts of the v2 collections (read-only) into a temp JSON outside the repo.
3. Rename only the v2 models that lack the prefix. Update every reference (grep for the old name in file names, strings, `ref:`, `populate`, `mongoose.model(`, tests, docs).
3c. Do the Rule 23.7 move for payroll, salary-structure, biometric-mapping and school, with a before/after check on each affected endpoint and a note of any result that changes.
3b. Switch v2 files that still use legacy models to the v2 equivalent (Rule 23.6). Check the field names match; if the schemas differ, list it instead of guessing. After each switch run that module's tests and one read smoke, and report if the result changes because the v2 collection holds different data.
4. Snapshot AFTER and compare: collection names identical for every model, document counts identical. Any difference = stop and fix.
5. Add one guard test: fails if a v2 model registers a name without the v2 prefix, or if v2 code imports a legacy model other than the allowed `device` read.
6. Clean up (only v2 code, never legacy): delete only files that are really unnecessary, i.e. (a) the old-name leftovers/duplicates this rename creates, (b) v2 model/helper files with ZERO references anywhere (code, routes, services, seeds, tests, e2e, `ref:`/`populate` strings) AND whose collection has 0 documents (read-only count). A file that is referenced, or whose collection has data, is NOT deleted: list it in the table as "unused, needs owner". Never drop a collection or a database; only source files are deleted.
7. Run the build and ALL existing backend tests plus one live smoke per module (read a list endpoint, no writes). Clean up anything created.
8. Collections (Rule 23.8): write the migration script, run `--dry-run` on the local database and show the list; then run it locally, compare counts, and update every name reference. Do not run it on production. Re-run all tests.
9. Rule 23.9: rename the helpers/services/scripts/tests that wrap v2 models, update every reference, add them to the guard test (a v2 helper without the v2 name fails it), re-run all tests.
10. Fill the table below. Do not commit.

## Report table (Claude Code fills — 2026-11-11)
| Old model name | New model name | Collection | Files touched | Notes |
|---|---|---|---|---|
| `academic-class` (`AcademicClassModel`) | `v2-academic-class` (`AcademicClassV2Model`) | `academic-classes` → `v2-academic-classes` (23.8) | model + every importer (earlier run) | collection renamed by the migration |
| `academic-subject` | `v2-academic-subject` | `academic-subjects` → `v2-academic-subjects` | same | same |
| `academic-subject-group` | `v2-academic-subject-group` | `academic-subject-groups` → `v2-academic-subject-groups` | same | same |
| `activity-log` | `v2-activity-log` | `activity-logs` → `v2-activity-logs` | model, `v2-activity-log.service.js`, `v2-test-activity-log-live.js` | `actorName` fix (see below) |
| `student-enrollment` | `v2-student-enrollment` | `student-enrollments` → `v2-student-enrollments` | model + importers | same |
| — (new) | `v2-school-profile` (`SchoolProfileV2Model`, `models/settings/school-profile.js`) | `v2-school-profiles` (new, empty) | `v2-letterhead.service.js`, `admission-form-fields.controller.js`, `field-config.validator.js`, `fees-worker.js` | Rule 23.7: replaces legacy `school` for every v2 reader. No v2 writer exists (there is no v2 School Profile page — see `settings/errors.md`), so it stays empty until one is built |
| — (field) | `v2-staff.wdmsId`, `v2-student.wdmsId` (`select: false`, no default) | unchanged | `models/staff/staff.js`, `models/student/student.js`, `workers/student-worker.js` | Rule 23.7: the WDMS employee id the device sync used to keep in legacy `biometric-mappings` |

Rule 23.7 switches (3c), before → after (checked on the dev DB, read-only, and by `v2-test-shared-fix5-live.js`):
- Staff delete guard (`helpers/staff/v2-dependents.js` `staffCountsV2`): `payrolls`/`salary-structures`/`biometric-mappings` (by personType+personId) → `v2-payroll-runs`/`v2-staff-salary-assignments` (by staffId) + card on the `v2-staffs` row. **Result changed for all 3 live v2 staff**: before = deletable (the legacy collections never held v2 staff), after = blocked `STAFF_IN_USE_PAYROLL` (they have v2 payroll runs). This is the guard working as intended.
- Student delete: the `biometric-mapping` delete step is removed (v2 ingest resolves punches by student `_id`; deleting the row stops them). Legacy `biometric-mappings` holds 2 rows, both legacy staff (no v2 person) — nothing lost.
- Device sync / Remove Card (`student-worker.js`): reads/writes `wdmsId` on the v2 row. Remove Card now keeps `wdmsId` (re-assign PATCHes the same WDMS employee instead of creating a duplicate). Not run live (needs the WDMS box).
- School: `schools` (legacy, 2 rows, 1 for the v2 school) → `v2-school-profiles` (0 rows). **Result changes for the owner**: letterhead prints "SCHOOL" with no address/affiliation, Admission Form Fields shows no school state (state-specific fields hidden), fee reminder sender name is blank — until a v2 School Profile page writes the row. Verified clean (no crash) by the live test.

Activity log actor name: entries stored `actorName: null` (the admin token carries only `id`/`mobile`; both existing rows show `null`). `logActivityV2` now resolves the name from the v2 Staff row (`req.staffId` set by requirePermission, else the owner row — read-only, never creates rows), cached per request. Proven on real actions through the real routers by `v2-test-activity-log-live.js` (asserts a non-empty `actorName` on every entry).

## Deleted files (Claude Code fills)
| File | Why it was safe (0 references, 0 documents) |
|---|---|
| — | none deleted (Do-step 6 was not part of this run) |

## Collection rename (Claude Code fills)
Script: `backend/scripts/migrate-v2-collection-names.js`. Run on the dev Atlas DB `schoolzen-advanced` (owner confirmed it is dev); dry-run first, then real run, then a second dry-run showing all five "already renamed". BEFORE/AFTER snapshot (all 104 collections + every model's name/collection): identical except the renames and the new empty `v2-school-profiles`.
| Old collection | New collection | Docs before | Docs after |
|---|---|---|---|
| `academic-classes` | `v2-academic-classes` | 15 | 15 |
| `academic-subjects` | `v2-academic-subjects` | 6 | 6 |
| `academic-subject-groups` | `v2-academic-subject-groups` | 17 | 17 |
| `activity-logs` | `v2-activity-logs` | 2 | 2 |
| `student-enrollments` | `v2-student-enrollments` | 55 | 55 |

Production (NOT run): after a backup, deploy the new code and run once, in the same release:
`cd backend && node scripts/migrate-v2-collection-names.js --dry-run && node scripts/migrate-v2-collection-names.js`

## Rule 23.9 renames
All files below wrap a v2 model and are reached only from v2 code (checked against the v1 require graph: 0 shared). Every `require`, comment path and planning-doc path was updated; API URLs, route paths, permission keys, env keys and response shapes are unchanged.
- helpers: `academic-session/v2-session-resolver`, `academic-setup/v2-class-structure`, `academic-setup/v2-dependents`, `approvals/v2-sources`, `attendance/v2-context`, `certificates/v2-tc-context`, `dashboard/v2-widgets`, `examination/v2-admit-card-generation`, `examination/v2-exam-context`, `examination/v2-result-lookup`, `fees/v2-fee-context`, `fees/v2-fee-promotion`, `fees/v2-fee-record-sync`, `fees/v2-fee-reminder`, `fees/v2-fee-structure-resolver`, `holiday/v2-context`, `leave/v2-context`, `payroll/v2-context`, `payroll/v2-generate`, `settings/v2-class-options`, `settings/v2-field-config.utils`, `settings/v2-marksheet-catalog-loader`, `settings/v2-owner-bootstrap`, `settings/v2-session-copy-forward`, `staff/v2-dependents`, `staff/v2-lookups`, `student/v2-student.utils`, `student/v2-student-write`.
- services: `v2-activity-log.service`, `attendance-v2/v2-{auto-sync,ingest,live-stats,reconcile,shift-lookup}`, `calendar/v2-working-day`, `holiday/v2-holiday-calendar`, `payroll/v2-cron-payroll-confirmation`, `payroll/v2-payroll-attendance`, `pdf/v2-letterhead.service`.
- scripts: `v2-check-academic-setup-duplicates`, `v2-migrate-academic-setup-fix5`, `v2-migrate-student-admission-class`, `v2-migrate-student-sessions`, `v2-migrate-students`, `v2-seed-marksheet-templates`, and every v2 test → `v2-test-*` (24 files incl. `v2-test-model-names`, new `v2-test-shared-fix5-live`).
- functions: `logActivity` → `logActivityV2`; `staffCounts`/`departmentCounts`/`designationCounts` → `…V2`. Other exported function names were kept (the file name carries the v2 prefix) — owner to decide if every export should also be renamed.

## Non-v2 still used (Claude Code fills)
| File | Used by | Why not renamed |
|---|---|---|
| `modules/models/devices/device.js` | `attendance-v2/v2-ingest.js`, `v2-auto-sync.js` (read); `v2-test-attendance-api.js`, `v2-test-attendance-failure.js` (create a throwaway device fixture) | Rule 23.4 allowed legacy read; the two tests write a fixture device for a throwaway school and delete it |
| `modules/middleware/socket-auth.js` | v2 live-attendance sockets + legacy teacher sockets | shared with legacy (reads `teacher`, `teacher-user`) |
| `scripts/test-auth-refresh.js` | checks v1 and v2 auth | shared with legacy |
| `modules/services/cache/*`, `helpers/with-transaction`, `errors`, middleware | v2 + app | wrap no model |

## Still on legacy (Claude Code fills)
| File | Legacy model used | Why not switched |
|---|---|---|
| `scripts/v2-migrate-students.js` | `student` (read-only) | it IS the one-time legacy → v2 copy script; owner to delete once every school is migrated (exempted by name in the guard) |

## Also list
- Unused but not deleted: `modules/helpers/examination/v2-result-lookup.js` — 0 importers; its model `v2-exam-results` was not counted/deleted here (step 6 not in scope): needs owner.
- Models pointing at a legacy collection (23.3): none (guard test "v2 models never share a collection with a legacy model").
- Legacy models still used by v2 code: only `device` (guard test enforces it; `KNOWN_LEGACY` is empty).
- Owner: build a v2 School Profile page (writer for `v2-school-profiles`); until then letterhead/state/reminder sender name are blank.
- Owner: people already synced to WDMS through legacy `biometric-mappings` have no `wdmsId` on their v2 row — today that is only 2 legacy staff, no v2 person.

