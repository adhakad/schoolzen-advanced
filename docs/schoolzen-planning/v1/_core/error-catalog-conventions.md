# Error Catalog — conventions for every module's `errors.md`

Status: **FINAL**
Depends on: `error-handling/README.md` (the category/code/response-shape
contract this file assumes and extends — read that one first).

---

## Why a per-module `errors.md` exists at all

`error-handling/README.md` defines the MACHINERY (8 categories, one
response shape, one interceptor, one `fields[]` convention) — it
deliberately never lists concrete error cases, because that would mix
architecture with content. Each module's `errors.md` is the CONTENT:
the actual list of things that can go wrong for that module's data and
actions, each mapped onto the existing machinery. No module invents a
9th category or a new response shape — every row below resolves to one
of the 8 categories already defined.

This catalog exists because the legacy codebase's validation (see the
old `student.js` controller reviewed for this) was real and fairly
thorough, but ad hoc — scattered inline checks, no catalog, easy for a
new page to forget a check an old one had. Writing it down per module,
once, in one place, is what makes it checkable and reusable instead of
tribal knowledge.

## The 9 error shapes every module's `errors.md` checks against

Each maps to one of the 8 backend categories and one frontend
treatment (already defined in `error-handling/README.md`) — restated
here per-shape for quick reference while writing/reviewing a module's
list:

| # | Shape | Backend category | Frontend treatment |
|---|---|---|---|
| 1 | Field-level (required/format/range/enum) | `ValidationError`, `fields[]` set | Inline, under the field |
| 2 | Uniqueness / duplicate | `ConflictError` (409) | Toast (or inline if traced to one field on a form, e.g. duplicate Admission No. while typing) |
| 3 | Cross-field / business bound (e.g. concession > total fee) | `ValidationError`, `fields[]` naming the offending field(s) | Inline |
| 4 | Dependency / referenced record missing | `NotFoundError` (404) | Toast |
| 5 | State-transition guard (wrong status for this action) | `ValidationError` if a specific control caused it (inline), else `ConflictError` (toast) | Depends — see rule below |
| 6 | Cascade / in-use delete block | `ConflictError`, `context` carries the blocking count | Toast, message names the count (e.g. "12 students") |
| 7 | Bulk-operation row-level | `ValidationError` with a `rows[]` array (see below) instead of/alongside `fields[]` | A results panel listing failed rows, never a single toast for a multi-row failure |
| 8 | External-service failure | `ExternalServiceError` (502) | Toast, always safe-worded ("couldn't reach the biometric device"), never the raw provider error |
| 9 | Concurrency / race (two actors, one limited resource) | `ConflictError` if detected after the fact, or the existing rate-limit tier if it's a rapid-fire double-submit | Toast; the double-submit case is normally prevented client-side first (see below) |

**Rule for #5**: if the guard is a direct result of something visible
on the current form/row (e.g. "Detain" toggle disables Promote-To — a
UI state, not a server error at all), it's not even a backend error.
If it can only be known server-side (e.g. someone else already
approved this leave request in the second before your click landed),
it's `ConflictError`, toast, and the UI should also refresh that row's
state from the response so it doesn't stay showing the stale action.

## Bulk row-level error shape (extends the base `ApiError`)

```json
{
  "error": {
    "category": "ValidationError",
    "code": "BULK_ROWS_FAILED",
    "message": "3 of 40 rows could not be imported",
    "requestId": "...",
    "rows": [
      { "row": 3, "fields": [{ "field": "gender", "code": "GENDER_INVALID", "message": "..." }] },
      { "row": 17, "code": "ADMISSION_NO_DUPLICATE", "message": "..." }
    ]
  }
}
```
`rows` is the bulk sibling of `fields` — same idea, one level up (per
row instead of per form). A bulk endpoint's response always reports
EVERY failing row in one response, never stops at the first failure
(the legacy `student.js` bulk-import already did this correctly —
this generalizes it, doesn't change it). Rows that passed are still
committed — never "reject the whole batch" for a partial content
error, only for structural failures (empty file, one bad row *
exceeding the batch size cap*, wrong template).

## Concurrency defenses, in order of preference

1. **Prevent, don't detect** — a disabled submit button during an
   in-flight request (`isClick` guard, already in the legacy frontend
   conventions) stops most double-submits before they're even a
   network problem.
2. **Database-level guard** — a unique index or a conditional update
   (`findOneAndUpdate` with a status filter, e.g. only succeed if
   `status: 'pending'`) turns a race into a clean "0 rows matched"
   rather than a corrupted double-write. This is the primary defense
   for the state-transition + limit-exceeding cases below, not a
   pre-check-then-write pattern (which still races).
3. **Report clearly** — when a race is legitimately lost (someone else
   approved it first), the error message says what actually happened
   ("This leave request was already approved by Priya a moment ago"),
   not a generic "Conflict."

## Frontend field-error visual pattern

See `design-system.md`'s **Form validation state** section for the
actual CSS/markup — this file only defines which backend shape feeds
it. In short: shape #1 and #3 (and a row's own field within shape #7)
render as a red-bordered field + a small message directly beneath it,
triggered on blur (first time) and on every change after that field
has been touched once — never only on submit, and never as a toast.

## How each module's `errors.md` is written

One table per shape that actually applies to that module (skip a shape
entirely if the module has no case for it — Dashboard, being read-only,
skips most of them). Each row: **Case** (plain description) → **Code**
(the stable `code` string, reusing an existing one from another module
where the same kind of failure recurs, e.g. any "X already exists"
duplicate reuses the `<FIELD>_DUPLICATE` pattern) → **Message**
(the safe, user-facing English string — the actual translation source
key body) → **Notes** (anything a builder needs that isn't obvious from
the case description alone — which collection to check, whether it's
transactional, etc.).
