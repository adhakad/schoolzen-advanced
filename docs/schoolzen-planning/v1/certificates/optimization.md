# Certificates — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

| Read | Cache key | Tier (§2) | TTL |
|---|---|---|---|
| `TcStructure`'s 19-field checklist (fixed constant in code per `tc-structure.md`, not actually stored per-school) | N/A — not a DB read at all, served from a code constant; nothing to cache | — | — |
| Generate TC's student table (Roll No./Student/Class/Date of Leaving/Status) | **Not cached** — reflects live issue/not-issued status per student and is filtered/paginated per request | — | — |

This module has almost nothing near-static to cache. Its one structure document (`TcStructure`) exists specifically to hold a live counter (`nextSerialNumber`), not config, so — unlike every other module's Structure doc — it is deliberately excluded from the near-static tier. See Module-specific notes.

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Issue TC (Generate TC's "Issue TC" confirm) | No structure cache to invalidate (see above); the issuing student's row must reflect Status=Issued on the very next read — this list is never cached, so there is nothing to invalidate, only to read fresh |
| Delete Issued TC (issued-list "Ok" on delete confirmation) | Same — no cache layer sits in front of the issued-list read |

## Pagination

| List | Field |
|---|---|
| Generate TC's student table | Keyset/cursor — every student in the school, same volume class as Manage Students |
| Issued TC list (referenced by `errors.md`'s `GetIssuedTransferCertificatePagination`) | Offset — bounded by "TCs issued so far," a much smaller, slower-growing set than the student roster itself |

## Idempotency-Key required on

**Yes — `POST` Issue TC is this module's one §3-qualifying endpoint.** Issuing a TC is synchronous, and per `errors.md`'s Shape 9 finding it is also the module's most consequential double-click case: today a duplicate submit races two `findByIdAndRemove` calls against the same student and the second one hangs instead of failing cleanly. An `Idempotency-Key` sent by the client on the Issue-TC action (one UUID per click, reused on retry) lets the server return the first request's stored response (the already-created `TransferCertificate` + serial number) on a repeat, instead of attempting a second delete/issue against a student that no longer exists. This is in addition to, not instead of, the `isClick`-style button guard `errors.md` also requires client-side, and in addition to the atomic `$inc` fix for `nextSerialNumber` below — the idempotency key prevents the duplicate *request*, the atomic increment prevents a duplicate *serial number* even if two genuinely different issue actions race.

No other endpoint in this module (Delete Issued TC, TC Structure save) is both synchronous and financial/critical enough to need it — Delete is guarded by `LAST_TC_LOCKED` and is not a create, and TC Structure's save only edits the serial-number correction field, not an issuance.

## Real-time / precomputed aggregates

Not applicable in the §6 sense (no dashboard-style panel here), but the TC Structure side panel's **"TCs Issued This Session" stat** is exactly the kind of count that should never run a live `count()` aggregation on every page view of a settings form — treat it as a small precomputed counter (incremented in the same transaction as each TC issue, decremented on a delete) rather than a `TransferCertificate.countDocuments({adminId, sessionId})` query on every load of the TC Structure page.

## Module-specific notes

- **`TcStructure.nextSerialNumber` must NEVER be cached.** This is the one explicit exception `_core/module-optimization-guide.md`'s original §8 matrix calls out by name: it is a live counter, not configuration, and must be read via an atomic `findOneAndUpdate` with `$inc` **inside the same transaction that creates the `TransferCertificate` document** — read-modify-write, every single issue, no exceptions, no cache-aside wrapper around it at all. Caching it (even with write-through invalidation) reintroduces exactly the race `errors.md`'s Shape 9 already flags: the legacy code's client-supplied `serialNo` bug is the cautionary example of what happens when this number isn't re-derived server-side, atomically, on every read.
- **Everything else this module could cache is either a fixed code constant (the 19 fields) or must-be-live student/issue state** — this is the leanest optimization surface of the five modules covered here; most of the work is the Idempotency-Key and the atomic counter, not a caching strategy.
- **Generated TC PDFs still follow §7's CDN pattern** once issued (same letterhead print template as Admission Letter/Admit Card) — a printed/reprinted TC is served from Cloudinary, not re-rendered server-side per print click, even though the underlying serial-number read that created it is never cached.
