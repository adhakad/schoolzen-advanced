# Staff — Manage Staff page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `manage-staff.html` (same folder)

Top-level Staff sidebar item, sub-tab "Manage Staff" (default landing).
Add/Edit/Delete all live on this ONE page (no separate "Add Staff"
screen) — same convention as Salary Groups.

---

## Toolbar

Search → Department+Designation (adjacent pair, Designation disabled
until Department chosen) → Status filter → "Bulk Cards" (secondary,
neutral-tint) → "Create" (primary) — both action buttons inside the
toolbar row.

## Table

Name(+avatar) → Emp Code → Department → Designation → Joining Date →
Status chip → Card (a tag showing the card's last 4 digits, or muted
"Not assigned") → Action.

## Action column — four distinct icon-buttons

Card (opens Assign Card modal) → Resync (pushes this person's data to
the biometric device again) → Edit (opens the same Create/Edit modal)
→ Delete. Four separate icons, never merged, since each does something
meaningfully different.

## Create/Edit Staff modal (sticky header+footer)

Name → Employee Code (optional, hint: used to match this person in
bulk card-upload CSVs) → Department → Designation (options filtered to
the chosen Department, disabled until one is picked — the form's own
version of the toolbar's Department→Designation dependency) → Joining
Date → Status.

## Assign Card modal

Separate from the staff edit form — assigning a biometric/access card
is its own action, not a field buried in a general edit. Card Number +
Verify Mode (hint: how the device is allowed to identify this person).
Footer has two distinct actions: "Resync to Device" (re-push existing
data, destructive-styled since it's a real device operation) and
"Submit" (save the new card assignment).

## Bulk Assign Cards modal

Explains the expected CSV format up front (two columns: empCode,
cardNo, header row required) before showing the upload control. After
upload, shows a result summary (N mapped successfully, N failed) with
a table of failures (code, card number, reason) so a partial success
is clearly diagnosable — not just a generic "some rows failed."

## Delete confirmation

Per the global cascade-delete rule: deleting a staff member with
attendance/payroll/leave history already recorded triggers the
soft-delete-with-grace-period + type-to-confirm flow (this is
"already-happened" data, per that rule) rather than a simple confirm.
