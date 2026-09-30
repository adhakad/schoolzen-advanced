# Academic Setup — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

Academic Setup is the module every other module's near-static cache tier ultimately depends on (§8's old matrix note: "Everything downstream reads these via cache"). A cache-invalidation bug here does not stay contained to this module — a stale Class list can silently corrupt Student's admission-class dropdown, Attendance's roster grid, and Fees' structure lookups all at once. This file treats correctness here as higher-stakes than in any other module.

## Cached reads

| Query / endpoint | Cache key | Tier (§2) | TTL |
|---|---|---|---|
| `GET /classes-sections` (Classes & Sections list, incl. embedded `sections[]`/`streams[]`) | `{adminId}:academic-setup:classes` | Near-static | 45 min |
| `GET /subjects` (Subjects master list) | `{adminId}:academic-setup:subjects` | Near-static | 45 min |
| `GET /subject-groups` (Subject Groups list) | `{adminId}:academic-setup:subject-groups` | Near-static | 45 min |
| `GET /subject-groups?classId=X&streamId=Y` (Subject Groups page's Class/Stream filter query) | `{adminId}:academic-setup:subject-groups:{classId}:{streamId|none}` | Near-static | 45 min |
| Classes & Sections' side-column stats card (Total Classes / Sections Created / Streams Configured / Students Enrolled) | `{adminId}:academic-setup:class-stats` | Near-static-ish, but invalidated on Student enrollment change too (see below) — same tier length, wider invalidation set | 30 min |

Subject Groups' Details-modal payload (per-group subject names) is served from the already-cached `subject-groups` key's embedded/populated data — never a separate per-group cache entry, since the list is small and bounded (offset-paginated per §8's old matrix).

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Add/Edit/Delete Class, Bulk Delete Classes (Classes & Sections) | `{adminId}:academic-setup:classes*` and `{adminId}:academic-setup:class-stats` |
| Add/Edit Class's stream/section rows via the modal's inline `+`/`×` (still an Update Class call) | same as above — this is not a separate endpoint, it's `UpdateClass`'s existing invalidation |
| Add/Edit/Delete Subject, Bulk Delete Subjects (Subjects) | `{adminId}:academic-setup:subjects*`. A Subject delete also `$pull`s the subject out of affected groups (per `errors.md` shape 6), so it must ALSO invalidate `{adminId}:academic-setup:subject-groups*` in the same transaction — a subject-delete that only busts its own key would leave Subject Groups' cached `subjectIds` pointing at a deleted subject |
| Add/Edit/Delete Subject Group, Bulk Delete Subject Groups (Subject Groups) | `{adminId}:academic-setup:subject-groups*` (the wildcard covers every `{classId}:{streamId}` filter variant — never invalidate just the one filter combination the request happened to use, since the same group also appears in the unfiltered list) |
| Student Admission / Class Promotion creating or changing a `StudentEnrollment` | `{adminId}:academic-setup:class-stats` only (the Students Enrolled count) — Academic Setup's own Class/Subject/Group keys are untouched by this, so this is the one cross-module invalidation this module's cache needs to accept from outside |

Per §2, every one of the above is same-request write-through: the mutation's response already returns the fresh Class/Subject/Group document, and the cache key is deleted (not blindly re-populated) inside the same transaction as the DB write — the next read recomputes via `cacheService.wrap(...)`.

## Pagination

- **Classes & Sections list**: offset (bounded — a school's class count is small, per §8's old matrix; no `.dd`/table here needs cursor semantics).
- **Subjects list**: offset (same reasoning — Core/Elective master list, bounded).
- **Subject Groups list**: offset, scoped by the toolbar's Class/Stream filter (`(adminId, classId, streamId)` index per `subject-groups.md`'s schema line) — never a full unfiltered scan when a filter is active.

None of this module's three lists ever approaches keyset territory; that's a Student/Attendance-scale concern, not this module's.

## Idempotency-Key required on

**None.** None of this module's writes are financial or otherwise §3-critical — Create/Update/Delete Class, Subject, or Subject Group are configuration writes, not synchronous financial/critical actions. `errors.md`'s frontend requirements section separately calls for a client-side double-submit guard (`isClick`-style flag) on all three pages' Add/Edit forms, since none exist today — that is a UX fix, not an Idempotency-Key case; a duplicate Class/Subject create is caught cleanly by the unique index + `11000`→`ConflictError` path (shape 9), so the worst outcome of a double-submit here is an extra rejected request, not a duplicate financial record.

## Real-time / precomputed aggregates

Not applicable. This module has no live/streaming data and no dashboard-style aggregate panel of its own — the one aggregate it does show (Classes & Sections' stats card) is cheap to compute directly (small bounded counts: classes, sections, streams, plus one `StudentEnrollment` count) and does not need §6's background-job precompute treatment. It is cached at the near-static tier above purely because it's read on every page load of a page that changes rarely, not because computing it live would be expensive.

## Module-specific notes

- **This module is upstream of every other module's near-static cache**, per the reasoning at the top of this file — Student's admission-class dropdown, Attendance's per-class shift baseline, Fees' fee-structure-by-class lookup, and Examination's per-class structure all read Class/Subject/Group data that, once this module's cache is warm, they either cache themselves (referencing the same underlying data) or read live from here. A missed invalidation here doesn't just show a stale row on this module's own three pages — it can make a *different* module's cached near-static data wrong without that module's own write path ever running. Get Academic Setup's write-through invalidation right first; every other module's correctness assumption about "Class/Subject/Group data is stable and cacheable" depends on it actually being kept correct here.
- **Subject Groups' subject checklist must always reflect the live Subjects list** (per `subject-groups.md`'s own frontend spec) — this means the Add/Edit modal's subject-checklist fetch should share the SAME `subjects` cache key as the Subjects page itself (`{adminId}:academic-setup:subjects`), not a separate modal-local cache, so a Subject edit/delete on one page is immediately reflected the next time any other page's dropdown/checklist reads that key — one cached representation of "the Subjects list," read from multiple UI surfaces, never two independently-TTL'd copies that can drift apart mid-TTL.
- **Cascade-guard counts (`CLASS_HAS_STUDENTS`, `CLASS_IN_USE`, `SUBJECT_IN_USE`, `SUBJECT_GROUP_IN_USE` from `errors.md` shape 6) are always live reads, never served from the cached list** — a delete-confirmation count must reflect the current dependent-record count at the moment of the delete attempt, not a value that could be stale by up to the near-static TTL's length. This is a small, targeted exception to "everything in this module is near-static-cacheable": the cascade counts read `StudentEnrollment`/`SubjectGroup` directly, matching the "never cached" category from §2 (transactionally-sensitive-at-the-instant-it's-read), even though the Class/Subject/Group documents themselves sit comfortably in the near-static tier.
