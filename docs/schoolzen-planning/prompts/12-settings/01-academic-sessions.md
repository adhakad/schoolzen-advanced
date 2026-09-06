Read every .md file in docs/schoolzen-planning/v1/settings/ in full — this task builds ONLY the "Academic Sessions" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Academic Sessions" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/settings/academic-sessions.html pixel-for-pixel.

Specific rules for this page: exactly one AcademicSession is Active per school at a time; every new record anywhere in the app saves against the Active session regardless of which one the header selector shows; viewing a Closed session is read-only browsing, all create/edit/delete disabled; Set-as-Active is type-to-confirm given its school-wide blast radius.

Dependency check before starting: Build this module AFTER Student is stable and tested, since Admission Form Fields changes Student's own form/table/Excel behavior.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/settings/academic-sessions; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
