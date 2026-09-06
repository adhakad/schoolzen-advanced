Read every .md file in docs/schoolzen-planning/v1/certificates/ in full — this task builds ONLY the "TC Structure" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "TC Structure" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/certificates/tc-structure.html pixel-for-pixel.

Specific rules for this page: ONE school-wide structure, not per-class — no Class filter on this page at all; locked Always-Included fields + toggleable Optional Fields; auto-incrementing serial number.

Dependency check before starting: Student module must already be merged.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/certificates/tc-structure; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
