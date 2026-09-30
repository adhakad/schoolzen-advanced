# Holiday — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
`holiday.js`/`holiday-assignment.js`/`holiday-template.js` controllers and
the legacy Angular `holiday.component.ts`/`.html` (Holidays/Templates/
Assign tabs). The previous version of this file was written from
`assign.md`/`holidays.md` alone, before the controllers existed, and got
the module's actual shape wrong in two places: there is no Assign/Edit
distinction in code (every assignment is a `$set`-replace, so the old
`USE_EDIT_NOT_ASSIGN`/`MIXED_ASSIGNMENT_SELECTION` cases below are
removed, not just renamed), and "Generate from Public Holidays" does
**not** dedupe against existing holidays the way `holidays.md` describes.
The real gap this module has instead is quieter and more serious: a
Holiday or Template edit almost never tells attendance it needs to
recompute. Organized by the 9 shapes, one case-table per shape actually
used — same precedent as Leave/Academic Setup.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Holiday name blank | `HOLIDAY_NAME_REQUIRED` | "Name is required." | `CreateHoliday`/`UpdateHoliday` check this |
| Date range missing or End before Start | `HOLIDAY_DATE_RANGE_INVALID` | "The last day cannot be before the first day." | `parseRange` already enforces this correctly on both create and update |
| Template name blank | `TEMPLATE_NAME_REQUIRED` | "Template name is required." | |
| "Generate from Public Holidays": no state, no year, or no template name | `VALIDATION_FAILED` | "Choose a state and year, and name the template." | `GenerateTemplateFromPublic` reads `state`/`year`/`templateName` with **no guard at all** if any is missing/blank — a blank `templateName.toString()` throws before the 400 branch, a 500 instead of a field error |

## Shape 2 — Uniqueness / overlap

| Case | Code | Message | Notes |
|---|---|---|---|
| A holiday with the same (trimmed, case-insensitive) name already exists starting on the same date | `HOLIDAY_DUPLICATE` | "This holiday is already declared for that date." | Scoped to same `startDate`, not any overlap — two differently-named or differently-dated holidays are allowed to overlap by design (a state holiday alongside a school-specific one) |
| Template name already exists | `TEMPLATE_DUPLICATE` | "A template with this name already exists." | |
| **"Generate from Public Holidays" re-run for a state/year already generated** | (currently: silent full duplicate, not deduped) | — | `holidays.md` documents this as "existing entries by date range are skipped on insert" — **the real `GenerateTemplateFromPublic` does no such check**; it `insertMany`s every preset entry unconditionally into a *new* template. Re-running it (even under a different template name, which is all the uniqueness guard checks) creates a second full set of duplicate `Holiday` documents for the same dates. Must add a per-entry `(adminId, name, startDate)` dedupe against existing holidays before insert, and report the skipped count in the success message, matching the spec this module was actually supposed to ship |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| Editing/deleting a Holiday by an ID that doesn't exist, **or belongs to another school** | `NOT_FOUND` | "This record no longer exists." | See Critical section below |
| Editing/deleting a Template, or adding/removing a holiday from one, by an ID that doesn't exist or belongs to another school | `NOT_FOUND` | "This record no longer exists." | Same gap, in `holiday-template.js` |
| Assigning a Template ID that doesn't exist (or belongs to another school) | `TEMPLATE_NOT_FOUND` | "The selected template no longer exists — refresh and try again." | `BulkAssignHoliday`/`BulkAssignClassHoliday` already scope this correctly (`findOne({_id, adminId})`) — the one lookup in this module that does |
| `AddHolidayToTemplate` given a holiday ID belonging to another school | `HOLIDAY_NOT_FOUND` | "That holiday was not found." | Already correctly scoped (`HolidayModel.findOne({_id, adminId: template.adminId})`) — the exception, not the rule, in this file |
| "Generate from Public Holidays": no `SystemHoliday` data for the selected state+year | `SYSTEM_HOLIDAY_DATA_MISSING` | "No official holiday data is available yet for this state — add holidays manually for now." | |

Wrong-tenant is always reported identically to genuinely missing — never a 403.

## Shape 6 — Cascade / in-use delete block

| Case | Code | Message | Notes |
|---|---|---|---|
| Delete a Holiday still referenced by one or more Templates | (not blocked — auto-detached) | — | `DeleteHoliday` `$pull`s the id out of every template first, then deletes the holiday, with **no count surfaced to the admin at all** — a holiday quietly disappears from N templates with only a bare "deleted successfully" toast, no "this was in 2 templates" warning first. Not a hard block by design (a holiday isn't a retired entity the way a Leave Type is), but the silent, uncounted detach should at minimum become a `context`-carrying success message |
| Delete a Template currently assigned to any staff/teacher/class | `TEMPLATE_IN_USE` | "N people/class(es) are still using this template. Change their template first!" | `DeleteHolidayTemplate` already blocks this correctly via `getAssignedCounts`, summing person- and class-assignments into one number |

## Shape 7 — Bulk-operation row-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Bulk-assign with an empty `persons[]`/`classes[]` | `VALIDATION_FAILED` | "Select at least one person or class." | Neither `BulkAssignHoliday` nor `BulkAssignClassHoliday` guards an empty array before calling `bulkWrite([])` — Mongoose throws on a zero-length ops array, surfacing as a raw 500 instead of a clean message (same class of gap Leave's `BulkAssignLeave` had) |
| Bulk-assign includes a `personType` other than `staff`/`teacher` | `VALIDATION_FAILED` | "Choose staff or teacher." | `BulkAssignHoliday` never validates `personType` — a bad value upserts a `HolidayAssignmentModel` row that never matches any real person and never surfaces on the grid |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two admins create the same Holiday (name+date) or Template name at once | `HOLIDAY_DUPLICATE` / `TEMPLATE_DUPLICATE` | (same as Shape 2) | Every one of these checks (`CreateHoliday`, `UpdateHoliday`, `CreateHolidayTemplate`, `UpdateHolidayTemplate`, `GenerateTemplateFromPublic`) is a `findOne` pre-check only — no unique index anywhere in the module, so this is a real TOCTOU race, not just a theoretical one |
| **A Holiday is created/edited/deleted, or a Template's `holidayIds` change, for a date that already has attendance recorded** | (today: nothing happens) | — | **This is the module's real gap.** `enqueueReconcileToday` exists and is called correctly from `holiday-assignment.js` (`BulkAssignHoliday`, `BulkAssignClassHoliday`, both delete-assignment handlers) — but it is **never called from `holiday.js` or `holiday-template.js` at all.** Declaring today a holiday after the morning's attendance is already punched, editing a holiday's date range, deleting a holiday, or adding/removing a holiday from a template someone is already assigned to, all change what today's attendance *should* say — and none of them enqueue a recompute. The day's `DailyAttendance` rows stay exactly as they were (Present/Late/Absent) until something unrelated happens to reconcile them. Must call the same `enqueueReconcileToday(adminId)` from `CreateHoliday`, `UpdateHoliday`, `DeleteHoliday`, `UpdateHolidayTemplate`, `AddHolidayToTemplate`, and `RemoveHolidayFromTemplate` — this module has the helper already, it just isn't wired to three-quarters of the writes that need it |

---

## Critical — tenant-isolation gap across nearly every single-record lookup in this module

**`holiday.js`**: `GetSingleHoliday` (`findOne({_id})`), `UpdateHoliday`'s actual write (`findByIdAndUpdate(id, ...)` — the duplicate-name pre-check above it does scope by `adminId`, but the write itself does not), and `DeleteHoliday` (`findOne({_id})` then `findByIdAndRemove(id)`) all trust a bare `_id` with no `adminId` check.
**`holiday-template.js`**: `GetSingleHolidayTemplate`, `UpdateHolidayTemplate`'s write, `AddHolidayToTemplate`'s initial template lookup, `RemoveHolidayFromTemplate`, and `DeleteHolidayTemplate`'s initial lookup are the same pattern.
A guessed or enumerated `_id` from one school lets an admin at a different school view, edit, or delete another school's holiday or template — including, via `UpdateHoliday`, silently rewriting the dates on a holiday that other school's staff/students are relying on. Same class of bug flagged for Leave and Academic Setup, closed the same way: `findOne({_id, adminId})` / `findOneAndUpdate({_id, adminId}, ...)` everywhere, wrong-tenant reported identically to genuinely missing.

---

## Backend controller requirements

- **Tenant isolation on every single-record lookup, across both files** — see the Critical section; the single largest and most repeated gap in this module.
- **Wire `enqueueReconcileToday` into `holiday.js` and `holiday-template.js`**, not just `holiday-assignment.js` — see the Shape 9 finding above. This is the module's version of "an edit that changes today's effective calendar must trigger a recompute," which the codebase already has the mechanism for.
- **`GenerateTemplateFromPublic` needs a real per-entry dedupe** against existing `(adminId, name, startDate)` holidays before `insertMany`, and must report a skipped count — currently it always creates a full duplicate set on a second run, contradicting `holidays.md`'s own spec.
- **Holiday/Template uniqueness needs a real unique index**, not a pre-check-then-write: `(adminId, name, startDate)` for Holiday, `(adminId, name)` case-insensitive for Template, with an `11000` catch converted to `ConflictError`.
- **`BulkAssignHoliday`/`BulkAssignClassHoliday` need a guard against an empty selection** before calling `bulkWrite`, and should validate `personType` is `staff`/`teacher` rather than trusting the payload.
- **`DeleteHoliday`'s template-detach should report how many templates it touched**, not just `$pull` silently — same "named consequence" pattern Leave/Academic Setup's cascade guards already use, even though this one isn't a hard block.
- **Everything already correct and must not regress in the rebuild**: `parseRange`'s start/end validation; `rejectForeignHolidayIds` correctly re-verifying every holiday id in a template belongs to the same school on both create and update; `DeleteHolidayTemplate`'s combined person+class cascade count; `GenerateTemplateFromPublic`'s transaction around the holiday-insert + template-create pair; `BulkAssignHoliday`/`BulkAssignClassHoliday`'s `ordered:false` ($set-replace, ok for a race) and correct `adminId`-scoped template lookup.
- **Data-modeling contradiction, needs reconciling**: `assign.md` says template assignment is a flat `templateId` field on `Staff`/`StudentEnrollment` ("rather than a separate join collection"), but this file's own Shape 7 finding references a real `HolidayAssignmentModel` collection used by `BulkAssignHoliday`. The two docs describe different physical schemas for the same feature — pick one and correct the other before building.

## Frontend component requirements

- **`getHoliday`/`getHolidayTemplate` (the two paginated list fetches) have no error callback at all** — only `getAllHolidays` and `getAssignGrid` do. A failed page fetch leaves the table on whatever it last held, indistinguishable from "no holidays/templates yet," and is made worse by `ngOnInit`'s loading spinner: `setTimeout(() => this.loader = false, 1000)` fires unconditionally one second after the *promise object* is created, not when it resolves — so the spinner disappears on schedule even when the fetch itself failed silently underneath it.
- **The date range picker is Angular Material's `mat-date-range-input`/`mat-date-range-picker`, not the design system's `.dp` component** (`design-system.md` is explicit: "never a native `<input type=\"date\">`", and by extension never a different third-party calendar chrome either) — this is the one date field in this module and it doesn't match the pattern every other date field in the app is supposed to converge on. Flag for the rebuild rather than porting the Material component forward.
- **The Assign tab's actual behavior does not match `assign.md`'s spec, and the rebuild should follow the code, not the doc**: there is no "Assign to Selected" vs. "Edit Selected" split and no mixed-selection warning anywhere in `holiday.component.ts` — bulk selection has one template dropdown that `$set`-replaces regardless of a row's current assignment, and a single row's template is changed through a separate per-row Edit modal gated by a `confirmChecked` checkbox. This is simpler than the doc's design and matches what `BulkAssignHoliday` actually does server-side; the planning doc is the stale artifact here, not the code.
- **Double-submit guarding is otherwise solid and consistent with Leave's precedent**: every mutating action (`holidayAddUpdate`, `holidayDelete`, `templateAddUpdate`, `templateDelete`, `generateFromPublic`, `assignSelected`, `saveEditedAssignment`, `unassignRow`) gates on `isClick`. The one gap: rapid double-clicking a row's Edit or Delete icon can open the confirmation modal state twice in quick succession before `isClick` is ever set — low severity (no network call fires until the modal's own guarded button is pressed), same as the equivalent gap already flagged in Leave.
- **`plannedDays` on the Add/Edit Holiday form is display-only**, purely a client-side preview never sent to the backend — no client-trust issue, same clean pattern as Leave's `plannedDays`.
- **No dependent-count preview before deleting a Holiday** — the backend doesn't return one today either (see the cascade note above), so the frontend has nothing to show; must land together with the backend fix.

---

**Structure and depth follow the Leave / Academic Setup modules' format** (`leave/errors.md`, `academic-setup/errors.md`).
