# Settings — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

| Read | Cache key | Tier (§2) | TTL |
|---|---|---|---|
| Active `AcademicSession` (read by nearly every other module on almost every request — Attendance, Fees, Payroll, Admission, Dashboard, ...) | `{adminId}:settings:academic-session:active` | Near-static | 30–60 min |
| Academic Sessions table (all sessions, for this page's own list) | `{adminId}:settings:academic-sessions:list` | Near-static | 30–60 min |
| `FieldConfig` (full field list — read by the Admission form, Manage Students' Excel Import validator, and this page's own grouped-list editor) | `{adminId}:settings:field-config` | Near-static | 30–60 min |
| `Role` list + `RoleAssignment`-derived permission set for a given staff member (read on every authenticated request via `requirePermission(module, 'view'\|'edit')` middleware) | `{adminId}:settings:role:{staffId}:permissions` | Near-static | 30–60 min |
| Marksheet Templates seeded catalog (fixed, admin-created-never; read by this page's gallery and by Examination's structure-assignment flow) | `{adminId}:settings:marksheet-templates` (or a global, non-`adminId`-scoped key, since the catalog is seeded identically for every school — confirm scope decision against `settings-marksheet-templates.md`'s "seeded, fixed catalog, not admin-created" line) | Near-static | 30–60 min (or effectively indefinite for the global-catalog case, invalidated only on a code/seed deploy) |

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Create Session / Set as Active / Close (Academic Sessions) | `{adminId}:settings:academic-session:active` **and** `{adminId}:settings:academic-sessions:list` — Set-as-Active's atomic old→closed/new→active transaction must invalidate both keys in the same request that commits the DB write, per §2's same-request rule; a stale `active` key here is the single highest-blast-radius cache bug in the whole app, since every other module's writes key off it |
| Save FieldConfig row / Add Custom Field / Add State-Specific Field / toggle Required/Visible (Admission Form Fields) | `{adminId}:settings:field-config*` |
| Create/Edit/Delete Role, assign/remove a `RoleAssignment` chip (Roles & Permissions, both steps) | `{adminId}:settings:role*` — an assignment change invalidates that specific staff's `{staffId}:permissions` key; a role's own permission-checklist edit invalidates every staff holding that role, so this fires a `delPattern` on `{adminId}:settings:role:*:permissions` rather than trying to enumerate affected staff IDs inline |
| Assign/reassign a Marksheet Template to a class ("Use This Template") | Does not invalidate the catalog itself (the template definitions didn't change) — invalidates the affected `MarksheetStructure`'s cache key in `examination/optimization.md`, cross-module, since that's the document whose `templateId` actually changed |

## Pagination

| List | Field |
|---|---|
| Academic Sessions table | Offset — small, bounded (a school has a handful of sessions ever) |
| Admission Form Fields' grouped list | Offset — bounded, fixed groups (Always Required/Student Info/Parents Info/...), not a growing collection |
| Roles & Permissions Step 2 staff×role matrix | Keyset/cursor for the staff rows (same volume class as Manage Staff), offset for the Role pills themselves (bounded, few roles per school) |
| Marksheet Templates gallery | Offset — small, fixed seeded catalog |

## Idempotency-Key required on

**None of this module's endpoints meet §3's bar.** Session creation/activation, FieldConfig saves, Role/RoleAssignment writes, and template assignment are all synchronous but none are financial — a duplicate double-click on "Set as Active" is caught by `SESSION_ALREADY_ACTIVE` (a real state check, not a request-dedup problem), and RoleAssignment's uniqueness is enforced by its own unique index, not by idempotency. **No endpoint here needs an `Idempotency-Key` header.**

## Real-time / precomputed aggregates

Not applicable — this module has no counts/stats panel of its own. The closest thing, "N staff member(s) hold this role" (shown before a Role delete) and "N student record(s) have data in this field" (`FIELD_HAS_DATA`), are point-in-time counts computed at the moment a destructive action is attempted, not a standing aggregate that needs precomputing or a refresh cadence.

## Module-specific notes

- **Settings backs nearly every other module's near-static cache tier — its own invalidation correctness matters far more than its own read volume.** Academic Sessions' active-session key and FieldConfig are both read by other modules on the hot path of ordinary requests (every Admission, every Attendance mark, every Fee record needs the active session; every Admission form render and every bulk-import validation needs FieldConfig). A missed invalidation here doesn't just show this page stale data — it shows every other module in the app stale data simultaneously. Treat Settings' write-through invalidation as the one piece of this whole package that most deserves a second look before shipping, ahead of this module's own comparatively low read/write volume.
- **The active-session key is the highest-value single cache entry in the entire app** — it's read on nearly every write path across every other module (to stamp `sessionId`) and every read path that needs "current" data. Its TTL should lean toward the long end of the near-static range specifically because Set-as-Active already write-invalidates it immediately — a long TTL here is safe precisely because the invalidation path is exercised on the one event that would make it wrong.
- **`RoleAssignment`'s permission cache must be keyed per-staff (`{staffId}`), not per-role** — because `requirePermission` resolves a specific staff member's effective permissions (via their `RoleAssignment` rows), caching only at the `Role` level would require joining role→assignment→staff on every request anyway, defeating the cache's purpose. Invalidating "every staff holding this role" via `delPattern` on edit is the correct trade — a rare event (editing a role's own permission checklist) paying a broader invalidation cost, versus a common event (every authenticated request) paying a cheap per-staff key lookup.
- **The Marksheet Templates catalog is a candidate for a genuinely indefinite TTL** (or app-level in-memory cache instead of Redis) since `settings-marksheet-templates.md` describes it as seeded and not admin-editable at all — it only changes on a deploy that adds a new template, not on any admin action, unlike every other near-static item in this table which is invalidated by an in-app write.
- **Settings has no writes that are itself in the "never cached" category** (unlike Attendance/Fees/Payroll) — every one of its four pages' underlying data is exactly the kind of slow-changing config §2's near-static tier describes, which is why every read in this file sits in that one tier.
