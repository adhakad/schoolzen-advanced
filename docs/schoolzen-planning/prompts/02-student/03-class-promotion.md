Read every .md file in docs/schoolzen-planning/v1/student/ in full — this task builds ONLY the "Class Promotion" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Class Promotion" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/student/class-promotion.html pixel-for-pixel.

Specific rules for this page: the full cascade the Confirm modal must trigger: new enrollment for next session, unpaid fee balance carrying forward as an arrear, Roll Number cleared, Leave balances reset, Stream+Subject Group gate for 11th/12th, Fee Structure existence check — all stated explicitly before confirming, not silently.

Dependency check before starting: Academic Setup (Class/Stream/Section data) must already be merged.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/student/class-promotion; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
