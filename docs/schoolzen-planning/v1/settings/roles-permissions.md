# Settings — Roles & Permissions

Status: **FINAL**
Reference: `roles-permissions.html`

Two-step page: define what each role CAN DO (Step 1), then assign WHO holds each role for WHICH class (Step 2) — these are genuinely two different data shapes and two different forms on the same page, not one form.

---

## Frontend

**Step 1 — role capabilities**: role pills (select a role) → a permission checklist (per-module View/Edit toggles) → the sidebar itself live-previews what that role would see (locked items = no View access). Super Admin is a fixed, always-full-access, non-editable, non-deletable role (every school needs one that can't be locked out). Other roles may be flagged "scoped" (limited to specific classes, set in Step 2) — shown via an inline note, not a separate field. "Remove this role" is blocked while any staff still hold it.

**Co-admins are just another staff member assigned the Super Admin role** — no separate mechanism needed, this already works via Step 2's `RoleAssignment`. The one addition: the **original signup admin's own Staff record carries `isOwner: true`** (exactly one per school, set at school creation, never editable via this page). `isOwner` staff can never be removed from the Super Admin role, and their `RoleAssignment` row can't be deleted, by anyone — including another Super Admin — so a school can never accidentally lock itself out of its own root account. This is the one exception to Step 2's normal "click × to remove a role chip" behavior.

**Step 2 — per-person assignment**: a staff × role matrix table (staff rows, one column per role) — each cell is a chip (click to edit its class scope, × to remove, dotted + to add another role without disturbing existing ones). Toolbar: search + bulk-delete-selected + Department/Designation/Role-Type/Assigned-status filters. **The same class+section can't be assigned to two different people for the same role** — this is a real constraint the UI and backend both enforce, not just a tip.

## Backend

Schema — `Role`: `adminId`, `name`, `permissions:[{module, canView, canEdit}]`, `isSuperAdmin` (bool, exactly one true per school, immutable), `isScoped` (bool — whether Step 2's class-assignment applies to it).
Schema — `RoleAssignment`: `adminId`, `staffId`, `roleId`, `classId`/`sectionId` (only meaningful when the role `isScoped`). Unique `(adminId, roleId, classId, sectionId)` — this is what actually enforces "same class+role can't go to two people," at the database level, not just client-side validation.
Schema — `Staff.isOwner` (bool, default false, exactly one `true` per `adminId`): set only at school signup, never through this page's UI. `DELETE /role-assignments/:id` and the role-removal endpoint both reject the request server-side (not just a disabled button) when the target `RoleAssignment` belongs to an `isOwner` staff member's Super Admin assignment — this is a backend backstop, not just a UI restriction.

**Login is unified across every role** — Staff, Teacher, and any future role (accountant, librarian, sales user) all authenticate through the same guard/token-service; `permissions` (resolved from the staff's `RoleAssignment` rows) decides what they see, not a separate hardcoded auth type per role. A route/action checks `requirePermission(module, 'view'|'edit')` server-side — never a hardcoded `if (role === 'admin')`.

Deleting a role checks `RoleAssignment` for any reference first (blocks with the affected count, matching this app's other in-use-delete patterns).
