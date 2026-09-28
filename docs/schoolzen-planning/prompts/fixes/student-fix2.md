# Fix: Student module — date picker, Create button width, checkbox styling

## 1. Date picker
Native `<input type="date">` was used on Student's DOB/DOA fields —
wrong, breaks the design system's look (browser's own calendar chrome).
Replace with the shared `.dp` popover component exactly as now defined
in `_core/design-system.md` ("Date picker component — `.dp`") — same
positioning rule as `.dd`, same close/touch-handler requirement, no
native calendar anywhere.

## 2. Create button width
The page's main "Create"/"Save" button was sized to match the other
toolbar buttons (or vice versa) instead of following the real rule.
Correct rule (now in `_core/design-system.md` under "Buttons — Width
rule"): the ONE main/primary button auto-widths to its own label only;
every OTHER (secondary/utility) button on the same toolbar — Export,
Import, Filter, Assign Card, etc. — shares one common fixed width with
each other, regardless of their own label lengths. Only the main
button is the exception.

## 3. Checkbox styling
Checkboxes (row-select column, standalone) were using the browser's
default appearance instead of the shared theme. Fixed per
`_core/design-system.md`'s new "Checkboxes" section: one fixed size,
hairline border when unchecked, filled `var(--brand)` purple with a
white check glyph when checked — same size across a table's whole
row-select column and any standalone checkbox elsewhere on the page.

---

**Permanent rule promoted**: all three issues were design-system-level
gaps, not Student-specific bugs — they were folded into
`_core/design-system.md` directly (new `.dp` section, new Checkboxes
section, corrected Buttons width rule) rather than fixed only on
Student's pages, so no other module needs its own fix round for the
same three mistakes. Any module already built before this fix should
still be checked against the corrected `design-system.md` rules above.

---

## 4. Student module's already-built code vs. the now-FINAL `errors.md`

`docs/schoolzen-planning/v1/student/errors.md` has been rewritten to
FINAL with a full deep dive of the real legacy `student.js`,
`student.component.ts/.html`, `admission.component.ts/.html` and
`promote-fail.component.ts/.html`, cross-checked against the already-
built v2 controllers. It now has two new sections — "Backend
controller requirements" and "Frontend component requirements" — that
the already-built Student module must be checked against and patched
for, not rebuilt from scratch. Read both sections in full before
touching any code, then go file by file:

**Backend — check the already-built controllers for:**
- Tenant isolation on every single-record lookup (`findOne({_id,
  adminId})`, never bare `_id`) — including list/count/pagination
  endpoints, not just single-record ones.
- All 6 uniqueness checks (admissionNo, roll number, Aadhar, Samagra
  ID, UDISE, card number) backed by a real unique index + Mongo
  duplicate-key catch → `ConflictError`, not only a `findOne`
  pre-check.
- Create/Update/Delete each wrapped in one transaction; Delete
  requires a server-side `confirmed:true` flag.
- Bulk import validates every row first and returns one `rows:[]`
  response — never aborts on the first bad row; an unrecognized class
  name is its own `CLASS_NAME_UNRECOGNIZED` case.
- Class Promotion is the roster → preview → confirm → chunked
  background-job flow (server-revalidates on confirm, surfaces
  non-blocking `warnings[]` by type) — not a per-student immediate
  write. Prior-year AdmitCard/ExamResult must never be deleted on
  promotion.

**Frontend — check the already-built components for:**
- Manage Students: checkbox row-select with bulk Delete/Assign Card,
  each returning a per-row result (not one pass/fail toast).
- Per-row actions (resync, single delete) use a loading state keyed
  by that row's id, never one shared page-level boolean.
- Bulk CSV card-assignment rejects an in-file duplicate card number
  before submit.
- Every dropdown-feeding fetch (class, session, school info) has an
  error state, not just a happy path.
- Admission form sends the actually-selected class and a real
  date-of-admission — no hardcoded/placeholder values.
- List views distinguish a genuine empty state from a fetch-error
  state.
- Every submit action has a client-side double-submit guard, backed
  by the backend's `Idempotency-Key` support.

Read the current built code fully before patching, the same discipline
as items 1-3 above — don't guess which of these are already handled;
confirm each one against the actual file, and only change what's
actually missing or wrong.
