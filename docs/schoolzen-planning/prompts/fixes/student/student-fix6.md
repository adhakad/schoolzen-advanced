# Fix: Student module — round 6 (Phase 1 audit follow-ups)

From the Phase 1 optimization audit's findings, three real gaps to fix.

## 1. Idempotency-Key TTL mismatch — use 24h everywhere

`student/errors.md` said 30s, `_core/module-optimization-guide.md` §3
says ~24h. Both now say 24h (already corrected in the docs) — update
the actual Redis TTL used by the Idempotency-Key implementation
(Student create, Admission, card assignment) to 24 hours, not 30
seconds.

## 2. Missing `trackBy` on 4 small result/warning lists

Main tables already have `trackBy` correctly. Find the 4 small
result/warning lists (e.g. Bulk Import's per-row error list, and
similar) that render with `*ngFor` but no `trackBy`, and add one keyed
on a stable identifier for each row (e.g. row number, or `_id` where
the row represents a saved record) — same reasoning as the main
tables, just currently missed on these smaller lists.

## 3. HTTP compression — not implemented at all

Add the `compression` (or `shrink-ray-current`) middleware to the
backend per `_core/module-optimization-guide.md`'s existing
"Compression" section — Brotli primary (quality 4–6 for dynamic API
responses), gzip fallback via `Accept-Encoding` negotiation, one
middleware line in `app.js`, no per-route branching. This applies
app-wide, not just to Student's own endpoints — wire it once at the
top level.

---

Confirm build/lint clean after each fix.
