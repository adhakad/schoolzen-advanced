# Settings — Roles & Permissions (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md` (R3:
permission system redesign)
Reference: `roles-permissions.html`

Implements R3's permission model as an actual admin-facing UI — a role
tab strip plus a module×action matrix, rather than permissions only
existing as backend logic no one can inspect or change.

---

## Role tabs

One tab per role (Super Admin, Admin, Accountant, Class Teacher,
Subject Teacher, ...). **Super Admin is locked** — its tab shows a
"(locked)" label and its matrix below is entirely disabled checkboxes,
all checked. A school must always retain one role that can never be
misconfigured into locking everyone out of their own system — this is
the same principle as Admission Form Fields' "Always Required" group,
applied to permissions instead of form fields.

**Scoped roles** (Class Teacher) show a "(scoped)" label on their tab
— a visual signal before even opening the matrix that this role's
grants aren't school-wide.

## The matrix

Module (rows) × Action (columns: View/Create/Edit/Delete/Approve) —
a plain checkbox per cell. "Approve" only applies to modules with an
approval flow (Leave); other modules show a dash instead of a
disabled/unchecked checkbox, so it's visually clear the action doesn't
exist there rather than looking like a permission someone forgot to
grant.

## Scoped permissions — the Class Teacher case

For a scoped role, each granted permission's cell shows a small
clickable **"Scoped" tag** beneath the checkbox — clicking it opens a
compact picker (Class + Section) defining exactly which class(es) this
grant applies to. This directly implements R3's specific rule: "Class
Teacher = permission scoped to a Class+Section, not the whole school
— one teacher can hold multiple Class Teacher scopes." A scoped role
can hold several Class+Section scopes simultaneously (e.g. Class
Teacher for both 8th-A and 9th-B); the tag opens the same picker each
time, additively.

## Create Role modal

Role Name + a Scope choice up front (Whole school vs. Scoped to a
Class+Section) — deciding this at creation determines whether the new
role's matrix behaves like Admin's (plain checkboxes) or Class
Teacher's (checkboxes with Scoped tags), rather than needing to
migrate a role from one mode to the other later.

## Save behavior

Changes to a role's matrix apply immediately to every staff member
currently assigned that role — there's no "save as draft" for a
permission set, since an admin adjusting Accountant's permissions
expects it to take effect for every accountant right away, matching
how the rest of the app's settings pages behave (no separate publish
step).
