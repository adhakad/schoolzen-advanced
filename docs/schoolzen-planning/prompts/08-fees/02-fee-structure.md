Read every .md file in docs/schoolzen-planning/v1/fees/ in full — this task builds ONLY the "Fee Structure" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Fee Structure" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/fees/fee-structure.html pixel-for-pixel.

Specific rules for this page: the Particulars checklist-driven editor (tick to reveal an amount field, live-computed total); cascade delete since it destroys real financial history.

Dependency check before starting: Student and Academic Setup modules must already be merged. StudentFeeRecord's arrears array supports MULTIPLE prior unpaid sessions. dueFees is current-year-due plus sum(arrears), stored and updated on every write, never recomputed by summing on read. Recording a FeePayment and updating StudentFeeRecord must happen in one MongoDB transaction.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/fees/fee-structure; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
