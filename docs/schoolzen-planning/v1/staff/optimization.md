# Staff — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

Staff's collection stays in the hundreds even at large-school scale (`manage-staff.md`'s own scale note — one of `performance-principles.md`'s named exceptions to keyset pagination), so this module's optimization story is smaller and lower-stakes than Student's: near-static caching on the two small lookup lists, offset pagination everywhere, and the same field-projection discipline applied at a much smaller scale.

## Cached reads

| Query / endpoint | Cache key | Tier (§2) | TTL |
|---|---|---|---|
| Department list (`GET /departments`) | `{adminId}:staff:departments` | Near-static | 45 min |
| Designation list (`GET /designations`), including the Department-filtered variant | `{adminId}:staff:designations` / `{adminId}:staff:designations:{departmentId}` | Near-static | 45 min |
| Manage Staff's Department→Designation dependent dropdown | reuses the two keys above — this dropdown is already specified (`errors.md`'s frontend requirements) to filter client-side against an already-fetched full Designation list, so it must be backed by the SAME cached `designations` key the Designations page itself uses, not a separate copy | Near-static | 45 min |
| Manage Staff list itself | **not cached** | — | — |

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Add/Edit/Delete Department (Departments) | `{adminId}:staff:departments*` and `{adminId}:staff:designations*` (a Department rename/deactivate changes what Designations' own list displays as its Department column, and what Manage Staff's dependent dropdown groups by) |
| Add/Edit/Delete Designation (Designations) | `{adminId}:staff:designations*` |
| Create/Update/Delete Staff, `ChangeStatus`, Assign/Resync Card (Manage Staff) | Nothing in this module's own cache — Manage Staff's list is never cached, so there's no key to bust; the mutation response returns the fresh document per §2 |

Department/Designation deletes are blocked (not just invalidated) when in use, per `errors.md` shape 6 — the cascade-guard counts (`DEPARTMENT_IN_USE`, `DESIGNATION_IN_USE`) are always a live read against `Staff`/`Designation`, never served from the cached list, same principle as Academic Setup's cascade counts.

## Pagination

- **Manage Staff list**: offset (page-number UI) — explicitly named in `manage-staff.md`'s own scale note as one of `performance-principles.md`'s bounded-list exceptions, not a case requiring keyset. Backed by compound index `(adminId, departmentId, designationId, status)` matching the toolbar's own filter chain.
- **Department list**: offset — small, bounded (a school has a handful of departments).
- **Designation list**: offset, optionally scoped by the Department filter — same bounded reasoning.

Field projection (§4) still applies at this smaller scale: Manage Staff's `.select()` mirrors the table's rendered columns (name, empCode, department, designation, joiningDate, status, card status) — the same discipline as Student, just against a collection two to three orders of magnitude smaller.

## Idempotency-Key required on

**None among Staff's own writes.** Create/Update/Delete Staff, Department, and Designation are configuration/HR writes, not financial or otherwise §3-critical — a double-submit here is caught cleanly by the unique-index + `11000`→`ConflictError` path (`EMP_CODE_DUPLICATE`/`DEPARTMENT_DUPLICATE`/`DESIGNATION_DUPLICATE`, shape 9), same as Academic Setup. `errors.md`'s frontend requirements separately call for adding a client-side double-submit guard to Teacher's Add/Edit/Delete flows (currently missing there, present on the other three) — that closes a UX gap, not a financial-integrity one.

Assign Card (single/bulk) is the one write in this module that pushes to an external device layer, but — unlike Student's Assign Card, which this file's sibling `student/optimization.md` flags for Idempotency-Key — Staff's own `errors.md` doesn't identify a duplicate-assignment consequence beyond the ordinary `CARD_ALREADY_ASSIGNED`/`EMP_CODE_DUPLICATE` uniqueness guards already in place; treat it the same way (uniqueness-guarded, not Idempotency-Key-guarded) unless a bulk-CSV device-push failure mode specific to Staff is found during build, matching Attendance's own noted gap in that area.

## Real-time / precomputed aggregates

Not applicable. Staff has no dashboard-style aggregate panel of its own — none of its four pages show a cross-collection count/summary that would warrant §6's precompute treatment.

## Module-specific notes

- **Same projection discipline as Student, at Staff's own scale** — the module's own `errors.md`/`manage-staff.md` deliberately draw this parallel; a `Staff` document carries enough fields (name, empCode, department/designation refs, joiningDate, status, card/biometric fields) that a table-painting query should still `.select()` only what's rendered, even though the collection is small enough that the cost of NOT doing so is far lower than on Student.
- **Department/Designation are the two genuinely near-static reads here** — they change rarely (an admin restructuring departments is an infrequent event) and are read on every Manage Staff page load via the dependent dropdown, making them a clear win for the near-static tier; Manage Staff's own list is the opposite case (frequently filtered, not worth caching) for the same reason Student's list isn't cached, just at a smaller scale where the "not cached" call is less about raw size and more about filter churn.
- **`errors.md`'s pending soft-delete fix (`status:'terminated'`) changes what "the Staff list" means for caching purposes** — once terminated staff are excluded from active lists but remain resolvable by ID for historic payroll/attendance views, any future caching added to Manage Staff's list (if the school's staff count ever grows enough to justify it) must key its cache on the active-only filter, not accidentally cache a terminated staff member into an "active staff" result that then needs its own invalidation path when termination happens.
