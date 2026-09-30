# Examination — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

| Read | Cache key | Tier (§2) | TTL |
|---|---|---|---|
| Marksheet Structure grid (`GET /examination/marksheet-structure` — every Class(+Stream) row, template+subjects) | `{adminId}:examination:marksheet-structure` | Near-static | 30–60 min |
| Admit Card Structure list (`GET /examination/admit-card-structure`, unfiltered/search-page-1 shape) | `{adminId}:examination:admit-card-structure:list` | Near-static | 30–60 min |
| A single resolved `MarksheetStructure` for a Class+Stream (read by Generate Marksheet's Enter/Bulk-Enter Marks modal to build the per-subject grid and its max-marks bounds) | `{adminId}:examination:marksheet-structure:{classId}:{streamId}` | Near-static | 30–60 min |
| A single resolved `AdmitCardStructure` for a Class(+Stream/Group/Section) (read by Generate Admit Card's preview/print) | `{adminId}:examination:admit-card-structure:{classId}:{streamId}:{groupId}:{sectionId}` | Near-static | 30–60 min |
| Marksheet Templates catalog reference used by the structure setup view (seeded, rarely changes — see `settings/optimization.md`) | `{adminId}:settings:marksheet-templates` | Near-static | 30–60 min |

**Not cached**: Generate Marksheet's and Generate Admit Card's own student-list tables (`Marks Status` per student, `AdmitCard` rows) — these reflect Enter Marks/generation state that must be correct the instant a mark is saved or a card is (re)generated, and they're filtered/paginated per class rather than being a single reusable key. Individual `AdmitCard`/`ExamResult` documents are also never cached for the same reason `errors.md`'s snapshot fix exists — a cache hit must never outlive a schedule-edit's invalidation.

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Save Marksheet Structure setup (subjects/maxes/template) — Marksheet Structure's setup view | `{adminId}:examination:marksheet-structure*` (list + the specific `{classId}:{streamId}` key) |
| Create / Edit / Delete on Admit Card Structure's Create/Edit modal or row delete | `{adminId}:examination:admit-card-structure*` (list + the specific scoped key) — same request that triggers the BullMQ (re)generation/removal job, per `admit-card-structure.md` |
| Assigning a Marksheet Template to a class (Settings › Marksheet Templates "Use This Template") | `{adminId}:examination:marksheet-structure:{classId}:{streamId}` (the structure's `templateId` changed) — invalidation fires from Settings' controller, cross-module, since that's where the write happens |

Generate Marksheet's Enter/Bulk-Enter Marks and Generate Admit Card's per-student generation never write to the cached structure documents themselves, so they trigger no structure-cache invalidation — only the structure pages above do.

## Pagination

| List | Field |
|---|---|
| Admit Card Structure table | Offset — bounded per school (one exam-structure row per configured exam/class combination, not per student) |
| Marksheet Structure grid | Offset — bounded, one row per Class(+Stream), matching §8's original "small, bounded" call |
| Generate Marksheet's student table | Keyset/cursor — same shape as Manage Students, since it lists every student in a class and can reach the same volume |
| Generate Admit Card's student table | Keyset/cursor — same reasoning, one row per matching student |

## Idempotency-Key required on

None of this module's synchronous endpoints meet §3's bar (synchronous **and** financial/critical). Structure create/update/delete are synchronous but trigger an async BullMQ job rather than doing the risky work inline, and a duplicate structure-create attempt is already caught by Shape 2's `EXAM_STRUCTURE_DUPLICATE`/unique-index guard, not by idempotency-key deduplication. Enter Marks/Bulk Enter Marks are double-submit-guarded client-side (`isClick`) and overwrite-safe via `MARKS_ALREADY_ENTERED` (errors.md Shape 5), not a case where a retried request causes duplicate financial/data-integrity harm the way a payment or admission would. **No endpoint in this module needs an `Idempotency-Key` header.**

## Real-time / precomputed aggregates

Not applicable. This module has no dashboard-style counts/aggregates panel — its tables are per-record lists (structures, students), not summary numbers. The "N subjects scheduled" sub-line on Admit Card Structure's list and the "Subjects Set" count on Marksheet Structure's grid are cheap per-row counts already returned by the same list query's own aggregation stage (§ no-N+1-queries in `database-design-principles.md`), not a separate precomputed document.

## Module-specific notes

- **Generated PDFs use §7's CDN pattern once issued**, per `admit-card-structure.md`/`generate-marksheet.md`: a finalized `AdmitCard`/marksheet PDF is uploaded to Cloudinary once at generation time and served from there on every subsequent "Preview"/"Download"/"Print Selected" click, never re-rendered server-side per click.
- **Bulk structure generation is a BullMQ job, not a cache concern, but it interacts with caching at its boundary**: the job's completion is exactly the point at which `{adminId}:examination:admit-card-structure*` must be invalidated — invalidate when the job finishes (and the structure is genuinely usable), not when the synchronous create request first returns "generating."
- **The schedule-snapshot fix `errors.md`'s Critical section requires (freezing `examDate`/`examStartTime`/`examEndTime` onto each generated `AdmitCard` at generation time) is what makes caching an individual `AdmitCard` safe in the first place** — until that snapshot lands, a cached `AdmitCard` read could still be invalidated by an unrelated structure edit that this file's invalidation-trigger table doesn't (and shouldn't have to) track per-document; this file assumes the snapshot fix is in place.
- **"Print Selected" scoped to a whole class/section reuses the same BullMQ bulk-PDF-generation queue** `generate-admit-card.md` describes — that queue's own job-dedup key (per `database-design-principles.md`'s job-queue rule) is the correct place to prevent a double-print job, not an HTTP-layer `Idempotency-Key`.
