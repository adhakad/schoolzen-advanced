Read every .md file in docs/schoolzen-planning/v1/approvals/ in full — this task builds ONLY the "Requests" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Requests" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/approvals/requests.html pixel-for-pixel.

Specific rules for this page: this is a COMPUTED VIEW (a MongoDB aggregation using $unionWith across every approval-capable collection, filtered to status:'pending', each branch tagged with its type), NOT a duplicated collection copying LeaveRequest data. Approving/rejecting must write directly to the source collection — there is exactly one place a leave request's status lives, never a second copy to sync.

Dependency check before starting: Leave module must already be merged and have real data — this module has nothing to aggregate until Leave exists.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/approvals/requests; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
