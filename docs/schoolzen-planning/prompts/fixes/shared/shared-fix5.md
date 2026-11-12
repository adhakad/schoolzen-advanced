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

## Report table (Claude Code fills)
| Old model name | New model name | Collection (unchanged) | Files touched | Notes |
|---|---|---|---|---|

## Deleted files (Claude Code fills)
| File | Why it was safe (0 references, 0 documents) |
|---|---|

## Collection rename (Claude Code fills)
| Old collection | New collection | Docs before | Docs after |
|---|---|---|---|

## Non-v2 still used (Claude Code fills)
| File | Used by | Why not renamed |
|---|---|---|

## Still on legacy (Claude Code fills)
| File | Legacy model used | Why not switched (no v2 equivalent / schema differs) |
|---|---|---|

## Also list
- Unused but not deleted (referenced or has data): needs owner.
- Models that point at a legacy collection (Rule 23.3), not changed.
- Legacy models still used by v2 code, if any (should be only `device`).
