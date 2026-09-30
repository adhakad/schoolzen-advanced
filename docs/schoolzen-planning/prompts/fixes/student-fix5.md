# Fix: Student module — round 5 (Verhoeff, card masking, IFSC, filters, modal speed, Stream/Group flow)

Read `v1/_core/module-optimization-guide.md`, `v1/student/optimization.md`,
`v1/student/errors.md`, `v1/student/manage-students.md`,
`v1/academic-setup/classes-sections.md`, and
`v1/academic-setup/subject-groups.md` before starting — several items below
touch Academic Setup as well as Student.

## 1. Aadhaar Verhoeff checksum is rejecting valid numbers

The Aadhaar Verhoeff checksum validation currently rejects Aadhaar numbers
that ARE checksum-valid (confirmed against a batch of correctly-generated
test numbers). Verify the implementation against these known test vectors
before touching anything else:
- `'1428570'` must be **VALID**
- `'1428571'` must be **INVALID**
(standard Verhoeff reference example.)

Common bugs to check for:
- Processing digits left-to-right instead of right-to-left.
- Wrong permutation table index — it should be position `i % 8`, counted
  starting from the **rightmost** digit as position 0.
- Checking/computing the wrong digit as the check digit (should be the
  last digit of the 12-digit number).

Fix the implementation so it passes both test vectors above, then
re-verify against a batch of real UIDAI-format (12-digit) Aadhaar test
numbers before considering this done.

## 2. Phase 1 optimization audit (audit only, no code changes for this part)

Audit the Student module (Admission + Manage Students) against
`module-optimization-guide.md` and `student/optimization.md`. For each
Phase 1 item below, report **implemented / partially / not done**, with a
one-line reason if partial or not done:

- Redis caching with write-invalidation (cache-aside, tiered TTL, no
  stale response after add/update/delete)
- `Idempotency-Key` header on synchronous critical writes
- Field-projection (`.select()`) on list queries — never fetching full
  documents just to paint a few table columns
- Keyset/cursor pagination on the Manage Students list (never `.skip(N)`)
- `@for` + `track` keyed on `_id` (never index) in list rendering
- `ChangeDetectionStrategy.OnPush`
- Route-level lazy loading (`loadChildren`/`loadComponent`)
- HTTP compression (Brotli primary, gzip fallback)
- `bulkWrite`/`insertMany` pattern for Bulk Import (preload-once,
  write-once — no N+1 per-row queries)

## 3. Card number masking (reversed from "always full")

Manage Students table's Card column is masked by default ("•• 8821"),
with its own small reveal-toggle icon (`bi-eye`/`bi-eye-slash`, same
pattern as Aadhar/Bank/PEN in View Profile) — not shown in full by
default. Clicking the icon reveals the full number for that one row.
No `ActivityLog` logging needed for this one (unlike Aadhar/Bank/PEN) —
this is a UI-consistency choice, not a masking-law one.

## 4. IFSC validation bug — rejects genuinely valid codes

`bankIfscCode` validation is case-sensitive and rejects a correct IFSC
code typed in lowercase/mixed case. Fix: uppercase the value BEFORE
running the `^[A-Z]{4}0[A-Z0-9]{6}$` pattern check, on both frontend (as
typed/on blur) and backend (defense in depth). Confirm a real valid IFSC
code (e.g. `SBIN0001234`) passes regardless of the case it's typed in.

## 5. Class filter/dropdown ordering

Every Class-driven `.dd`/filter/list anywhere in the app (Manage
Students' Class filter, Admission's Class field, Subject Groups' Class
filter, Classes & Sections' own table, etc.) must sort by a new
`Class.order` field (Nursery=0, LKG=1, UKG=2, 1st=3, ... 12th=14),
never by insertion order or alphabetically (alphabetical sort puts
"10th" before "2nd", which is wrong). Add `order` to the `Class` schema
and seed the standard ladder.

## 6. Manage Students' Class/Stream/Group/Section filters don't filter

Confirmed real bug: with no filter, the full list shows correctly. But
selecting a Class (e.g. "1st") returns an EMPTY list instead of that
class's students — Group and Section filters have the same problem.
Find where the selected filter's value fails to reach the actual Mongo
query (wrong param name, filter object built but never merged in,
etc.) and fix it for every filter, alone and in combination. Test each
one, don't just confirm the endpoint accepts the param.

## 7. Modal forms slow to open

See `student/optimization.md`'s new "Confirmed real bug — modal forms
are slow to open" section — check in order: (1) is `FieldConfig`
actually being read from cache, or re-fetched every open; (2) are
Class/Stream/Group/Section dropdown options reused from Academic
Setup's cache or re-fetched fresh every open; (3) is the dynamic
FieldConfig-driven form being rebuilt from scratch on every open
instead of once per FieldConfig cache version; (4) is the modal
lazy-loaded or eagerly initialized. Fix whichever of these is the
actual cause — check, don't guess.

## 8. Stream → Group → Section flow — mandatory group, no more silent gap

This is a real workflow gap: a Stream (11th/12th) plus Sections could be
created with ZERO Subject Groups, surfacing only much later as
`SUBJECT_GROUP_MISSING` at Admission time. Per the now-updated
`academic-setup/classes-sections.md` and `academic-setup/subject-groups.md`:

- **Add/Edit Class modal, for a class with streams ON**: each stream now
  has an inline, mandatory (minimum 1) **Groups sub-block** — Group Name
  + live Subject checklist, the SAME fields/data as the Subject Groups
  page's own Add/Edit modal — alongside the existing, independent
  Sections sub-block (Sections stay unrelated to Groups — a seating
  division, not a subject choice). **Submit is blocked, frontend AND
  backend, if any stream ends up with zero groups.**
- **Add/Edit Class modal, for a class with streams OFF**: no group UI
  at all. On save, the backend auto-creates exactly one `SubjectGroup`
  named "General" for that class (`streamId: null`, `isSystemGroup:
  true`).
- **Subject Groups page**: an `isSystemGroup:true` ("General") row has
  no edit/delete actions at all and can't be bulk-selected — it is only
  ever removed by deleting its Class (cascade, from Classes & Sections,
  never from this page).
- **Cascade**: deleting a Class deletes all its `SubjectGroup`s
  (streamed or the auto "General" one) in the same transaction.
- **Backfill**: any existing stream with zero groups shows a warning
  badge on its row in BOTH Classes & Sections and Subject Groups
  ("No group — Admission blocked until one is added") until fixed.
- **`SubjectGroup` schema gets a new `isSystemGroup` (Boolean, default
  false) field** — true only for an auto "General" group; both frontend
  (hide the buttons) and backend (reject a direct edit/delete request
  on it even if attempted directly) check this flag.

## 9. `group` is a real Admission/Bulk-Import field, currently missing from the field table

Add `group` to the Admission form's field table (per the updated
`student/errors.md`): required and shown only when the chosen Class has
streams (hidden entirely, auto-resolved to "General" server-side, for a
non-streamed class); must be a `SubjectGroup._id` that resolves for that
exact `(classId, streamId)`.

**Bulk Import's Group column validates dynamically, per row, against
that row's own Class+Stream's actually-existing groups** — never a
fixed/global list. A group name valid for one stream is not valid for
another; an unrecognized group name for that row's class+stream is
`GROUP_NAME_UNRECOGNIZED`. For a non-streamed class row, the Group
column (if present) is ignored, never validated or reported as an
error.

## 10. Group/Section filters also broken on Admission page (same bug as #6, second location)

Admission's toolbar has the same Class→Stream→Group→Section filters as
Manage Students, reading from the same `Student` collection — the #6
fix must be applied/verified on BOTH pages, not just Manage Students.

## 11. `admissionType` ('new'/'old') — missing field, universal-module fee handling

Manage Students/Admission is a universal module — a school adopting
this ERP mid-session needs to add BOTH freshly-admitted students AND
students already studying there before the ERP existed. Per the new
sections in `errors.md`:
- Add `admissionType` (`.dd`, required, default `'new'`, enum
  `new|old`) to the Admission form — this field is currently missing
  from the build even though the DOA business rule already referenced
  it.
- `'new'`: `doa` set to today server-side, standard Fee flow starting
  from zero paid (per item E's FeeStructure/StudentFeeRecord decision).
- `'old'`: `doa` becomes a real required form field (validated `≥
  dob`), and the Fee step gets one more optional field — "Amount
  already paid till date" (default 0) — which seeds the first
  `FeesCollection` ledger record's running-paid balance instead of
  starting it at zero. Same `FeesCollection` shape either way, just a
  different starting point.
- Also fix `admission.md`'s stale "UDISE Number" label → "PEN" (leftover
  from the earlier udiseNumber→penNumber decision that wasn't updated
  on this page).

## 12. `.dd` dropdown must render above modal headers/footers too, not just the body

Per the updated `design-system.md`: the portal/top-layer requirement
must beat a modal's sticky header AND footer, not just its scrollable
body — a sticky header/footer creates its own stacking context, so a
naive in-flow-rendered `.dd` menu can end up visually under either one
even after the earlier body-overflow-clipping fix. Check every form
modal in this module (Admission, Assign Card, Excel Import/Export) for
a dropdown near the top edge (right below the header) or bottom edge
(right above the footer's action buttons) specifically, since that's
exactly where this shows up.

---

Confirm build/lint clean after every fix above. Part 2 (the Phase 1
optimization audit near the top of this file) is report-only — do not
change code based on it, just list the findings.
