Read every .md file in docs/schoolzen-planning/v1/staff/ in full — this task builds ONLY the "Manage Staff" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Manage Staff" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/staff/manage-staff.html pixel-for-pixel.

Specific rules for this page: Bulk Cards CSV upload with per-row success/failure reporting; the Department+Designation mutual-dependency filter pattern; cascade delete.

Dependency check before starting: Part of the R1 Staff+Teacher unification — build the new Staff schema already reflecting the unified model (single collection, roles array), but do NOT migrate legacy Staff/Teacher data in this task; that migration is its own separate, explicitly-reviewed step.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/staff/manage-staff; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
