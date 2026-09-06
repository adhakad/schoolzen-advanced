Read every .md file in docs/schoolzen-planning/v1/examination/ in full — this task builds ONLY the "Marksheet Structure (+ Setup)" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Marksheet Structure (+ Setup)" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/examination/marksheet-structure.html pixel-for-pixel.

Specific rules for this page: the 3-state landing page (empty/existing/template-picker); the Setup page's subject groups by marks-type (Theory/Practical/Periodic Test/Project) driving the ENTIRE shape of Generate Marksheet's Add/Edit Result modal — no hardcoded subject list, read the configured structure.

Dependency check before starting: Academic Setup and Student modules must already be merged.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/examination/marksheet-structure; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
