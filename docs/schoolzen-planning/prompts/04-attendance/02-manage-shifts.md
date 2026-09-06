Read every .md file in docs/schoolzen-planning/v1/attendance/ in full — this task builds ONLY the "Manage Shifts" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Manage Shifts" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/attendance/manage-shifts.html pixel-for-pixel.

Specific rules for this page: the grouped Punch-In Settings (everyone) vs Staff Only settings sections in the Add/Edit modal.

Dependency check before starting: Student and Staff modules must already be merged. AttendanceRecord is the highest-volume collection in the app — design it as ONE DOCUMENT PER PERSON PER DAY (a punches array inside it) with a unique compound index on (schoolId, personType, personId, date) so a duplicate device-sync retry can never create a duplicate day record.

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/attendance/manage-shifts; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
