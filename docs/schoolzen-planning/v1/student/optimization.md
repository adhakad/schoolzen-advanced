# Student — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

Student is the app's single largest collection (~2M students target, per `manage-students.md`'s own scale note) — the load-bearing constraint here is field-projection discipline and keyset pagination on the list itself, not caching the list (which is explicitly **not cached**, per §8's old matrix — large and too frequently filtered to cache usefully).

## Cached reads

| Query / endpoint | Cache key | Tier (§2) | TTL |
|---|---|---|---|
| Admission form's `FieldConfig` (field list, `required`/`visible`/`validationRule` per field, incl. custom/state-specific fields) | `{adminId}:student:field-config` | Near-static | 30 min |
| Admission/Manage Students' Class→Stream→Group→Section dependency-filter dropdown data | reuses `{adminId}:academic-setup:classes` / `:subject-groups` (see `academic-setup/optimization.md`) — never a second, Student-module-local copy of the same underlying data | Near-static | 30–45 min (matches Academic Setup's) |
| `Manage Students` list itself | **not cached** | — | — |
| `Admission` table (pending/admitted list) | **not cached** — same reasoning as Manage Students, and additionally this data changes per-admission during active enrollment windows | — | — |
| Per-student profile fetch (View Profile modal) | **not cached** — single-document reads by `_id` are already fast off the primary key index; caching a rarely-repeated single-record read adds invalidation surface for no real benefit here | — | — |

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| `FieldConfig` edit (Settings' Admission Form Fields page, not a Student-module page itself, but the key this module reads) | `{adminId}:student:field-config` |
| Create/Update/Delete Student, Bulk Import completing (Manage Students, Admission) | Nothing in THIS module's own cache — the list is never cached, so there's no key to bust. The mutation response still returns the fresh document per §2's write-back rule, so the frontend never needs a follow-up GET. |
| Assign Card / Resync (Manage Students) | Nothing cached-side — card data lives on the Student document itself, read live on every list/profile fetch, same as the rest of the row |
| Class Promotion confirming a batch | Academic Setup's `{adminId}:academic-setup:class-stats` (Students Enrolled count) — see `academic-setup/optimization.md`. Nothing in Student's own cache, since Student has none to invalidate for this event. |

## Pagination

- **Manage Students list**: keyset/cursor (`adminId, _id`), never `.skip(N)` — explicitly named in `manage-students.md`'s own scale note as needing it, given the ~2M-student target. Every cascade filter combination (Class/Stream/Group/Section) is backed by the compound index `(adminId, classId, streamId, groupId, sectionId)` so a filtered query is never a full scan.
- **Admission table**: keyset/cursor, same reasoning — it's the same underlying `Student` collection filtered by `status`, not a smaller dataset.
- **Class Promotion's roster table**: offset is acceptable here — it's scoped to one Class(+Stream) at a time via the toolbar filters, which bounds it to a single class's roster size (tens to low hundreds), not the full 2M-student collection.

**Field projection is hard-required on every list call** (§4) — the Student document is 20+ fields; Manage Students' table shows ~10 (photo, admissionNo, name, class tag, father, mother, roll, contact, card status), Admission's table shows a similar subset. The service method passes `?fields=...` matching exactly those columns, and the controller's `.select()` mirrors it — never the full profile document to paint a table row.

## Idempotency-Key required on

- **`POST` Admission create (`CreateStudent`)** — a synchronous, critical write per §3: a network-retry or impatient double-tap on a slow connection must not create two Student documents (and two `FeesCollection` records, since Create is a single transaction across both per `errors.md`'s backend-controller-requirements section). Client generates the UUID once per form-open, reused across a retry of the same submit.
- **`POST`/`PUT` Assign Card (single or bulk)** — a duplicate submit here doesn't just double-write locally; it can also double-push to the biometric device layer, and `CARD_ALREADY_ASSIGNED`'s uniqueness guard means a naive retry after a slow-network first attempt could otherwise present a confusing conflict error for what was actually a successful first request. Idempotency-Key lets the retry return the stored response instead of re-attempting a device push that already happened.
- Manage Students' bulk Delete and Bulk Import do **not** need this header themselves — bulk Delete is idempotent by nature (deleting an already-deleted id is a no-op `NOT_FOUND`, not a duplicate side effect) and Bulk Import already has its own job-level dedup key per `database-design-principles.md`'s "Idempotency keys for queued/bulk operations" section, which is the async/BullMQ mechanism, not the synchronous §3 one.

## Real-time / precomputed aggregates

Not applicable. Student has no dashboard-style aggregate panel of its own — Manage Students' and Admission's tables are row-level lists, not counts/summaries. (Dashboard's own overview, which likely shows a total-student count, is that module's concern and precomputed there per §6 — Student itself owns no aggregate.)

## Module-specific notes

- **The 20+ field document is the module's central caching-adjacent risk, and the fix is projection discipline, not caching.** Every list/table endpoint in this module must hard-enforce `.select()` to exactly the columns rendered — a single accidental full-document fetch on a 2M-row collection (e.g. a lazy `.find({adminId})` with no `.select()` during a debugging session left in) is a far bigger performance problem here than anywhere else in the app, since it's multiplied by the largest row count of any collection.
- **`FieldConfig` is the only genuinely cacheable read in this module**, and it is shared infrastructure — Settings owns the write path, Student (and its Bulk Import validator) is a pure reader. Cache invalidation for this key belongs to whichever module writes it (Settings), but Student's read path must key off the exact same `{adminId}:student:field-config` pattern so an edit in Settings is immediately visible to the next Admission form load, not delayed by a second, independently-TTL'd copy.
- **Bulk Import's per-row validation reuses the cached `FieldConfig`**, not a per-row re-fetch — the whole point of caching this key is that a 500-row import validates every row against ONE cached read of the field rules, not 500 round-trips to the same document.
- **Card-status display (masked "•• 8821" / "Not assigned") is read live off the Student document on every list fetch** — it is small enough per-row that it doesn't need its own cache entry, and it changes on Assign Card/Resync actions that themselves aren't cached, so introducing a cache here would only add invalidation surface without a real read-volume justification.
