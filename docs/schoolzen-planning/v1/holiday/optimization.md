# Holiday — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

| Query/endpoint | Cache key | Tier | TTL |
|---|---|---|---|
| `GET /holiday` (Holidays table, incl. month-nav filter) | `{adminId}:holiday:list[:month]` | §2 near-static | 30–60 min, write-invalidated |
| `GET /holiday-template` (Templates table) | `{adminId}:holiday:templates` | §2 near-static | 30–60 min |
| `GET /holiday-template/:id` (a single template's `holidayIds`, read live by the Assign page's effective-calendar computation) | `{adminId}:holiday:templates:{templateId}` | §2 near-static | 30–60 min, invalidated on that template's own edit — see Invalidation triggers |
| `GET /system-holiday?state&year` (public-holiday dataset backing "Generate from Public Holidays") | `system:holiday:{state}:{year}` (no `adminId` — this collection is not tenant-scoped, per `holidays.md`) | §2 near-static | long TTL (this dataset changes only via manual Compass edits, effectively static between years) |
| `GET /holiday-assignment/grid` (Assign page table) | **not cached** | — | small per-school list, but must reflect the mixed-selection warning state live; caching risk outweighs the modest read savings |

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Add/Edit/Delete Holiday (Holidays page) | `delPattern('{adminId}:holiday:list*')` |
| "Generate from Public Holidays" (Holidays page, once the dedupe fix from `errors.md` lands) | `delPattern('{adminId}:holiday:list*')` |
| Add/Edit Template, or add/remove a holiday from it (Templates page) | `delPattern('{adminId}:holiday:templates*')` **and** the specific `{adminId}:holiday:templates:{templateId}` key — per `templates.md`'s own stated behavior ("editing a template updates everyone already assigned to it immediately"), the per-template key must be invalidated the same request the template changes, since the Assign page's effective calendar is computed live from current template contents, never snapshotted |
| Delete Template | `delPattern('{adminId}:holiday:templates*')` |
| Assign/Edit a Template to staff or a class (Assign page) | no near-static holiday/template key changes; this only writes the `templateId` field on `Staff`/`StudentEnrollment` (or the `HolidayAssignmentModel` row — see the schema note in `errors.md`), which the ungated Assign grid re-reads live anyway |

## Pagination

| List | Field |
|---|---|
| Holidays table | Offset — small, bounded per school (`errors.md`/`holidays.md` both describe this as a short list, plus the month-nav popover already narrows it) |
| Templates table | Offset — a handful of named templates per school |
| Assign grid | Offset — bounded staff/student roster, same as Leave Assign's grid |

## Idempotency-Key required on

None. This module has no synchronous financial or otherwise time-critical write per §3's criteria — Holiday/Template CRUD and bulk-assign are all safe to retry naturally (bulk-assign is a `$set`-replace bulkWrite, already idempotent by construction per `errors.md`'s frontend/backend notes), and "Generate from Public Holidays" becomes idempotent-by-dedupe once `errors.md`'s per-entry `(adminId, name, startDate)` fix lands, so no header is needed there either.

## Real-time / precomputed aggregates

Not applicable — this module has no dashboard-style aggregate. The one cross-module real-time concern is the reverse direction: a Holiday/Template write must trigger Attendance's `enqueueReconcileToday` job (per `errors.md`'s Shape 9 finding that this is currently wired only from `holiday-assignment.js`, not `holiday.js`/`holiday-template.js`) so today's attendance recomputes — this is a correctness fix, not a caching concern, but it belongs in the same request that also fires the cache invalidations above.

## Module-specific notes

- **Holiday is the module `_core/module-optimization-guide.md` §8 already calls out as low-write-frequency and safe to cache aggressively** — a school edits its holiday list and templates only a handful of times per year, so the full 30–60 min near-static TTL is appropriate everywhere in this file, unlike Leave/Payroll/Fees where a live balance forces a never-cached tier.
- **The one place aggressive caching would be wrong is the per-template key feeding the Assign page's live calendar computation** — `templates.md` is explicit that a template is "referenced by assignment, never copied/snapshotted," so `{adminId}:holiday:templates:{templateId}` must be invalidated in the same request as any edit to that template's `holidayIds`, even though its TTL can otherwise be as long as any other near-static key. A stale cached template here would silently show the wrong effective holidays to everyone assigned to it, not just one record.
- **`SystemHoliday` is the one cache key in this app deliberately keyed without `adminId`** — it is a shared, non-tenant dataset (per `holidays.md`), so its cache key is `system:holiday:{state}:{year}`, not the `{adminId}:module:resource` convention used everywhere else; this is a one-off, not a precedent to copy into another module.
- **`GenerateTemplateFromPublic`'s dedupe fix (per `errors.md`) has no caching implication of its own** but should read the `SystemHoliday` cache key above rather than hitting that collection directly, since it's read on every generate attempt including retries.
