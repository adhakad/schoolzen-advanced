Read every .md file in docs/schoolzen-planning/v1/leave/ in full — this task builds ONLY the "Leave Assign" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Leave Assign" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/leave/leave-assign.html pixel-for-pixel.

Specific rules for this page: per-person per-leave-type limit cells showing days/left/not-set; the bulk-assign modal noting existing days are not reset.

Dependency check before starting: Staff and Student modules must already be merged. Approving a leave request must transactionally increment the matching LeaveLimit's usedDays so concurrent approvals can never exceed an allocation.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/leave/leave-assign; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
