Read every .md file in docs/schoolzen-planning/v1/certificates/ in full — this task builds ONLY the "Generate TC" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Generate TC" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/certificates/generate-tc.html pixel-for-pixel.

Specific rules for this page: shows all students by default; Attendance % in the Issue TC modal is pulled read-only from the real Attendance module, never re-typed; the printable TC has three signature lines (Class Teacher/Accountant/Principal).

Dependency check before starting: Student module must already be merged.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/certificates/generate-tc; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
