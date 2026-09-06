Read every .md file in docs/schoolzen-planning/v1/payroll/ in full — this task builds ONLY the "Salary Groups" page, but the whole module's .md files give the shared context (schema relationships, cross-page rules) you need.

Build the "Salary Groups" page — schema/model additions if not already created by an earlier page in this module, the controller function(s) and thin route file it needs (per frontend-backend-folder-structure.md: routes stay thin, business logic lives in the matching controller file), and the Angular component — using the shared component library and error-handling foundation already built (see prompts/00-shared-components.md).

Match docs/schoolzen-planning/v1/payroll/salary-groups.html pixel-for-pixel.

Specific rules for this page: inline +/x allowances/deductions editor; cascade delete offering 'Set Inactive' when in use.

Dependency check before starting: Staff and Attendance modules must already be merged. PayrollRun needs a unique compound index on (schoolId, staffId, year, month) so re-clicking Generate is idempotent (updates the existing draft, never duplicates).

New collections/fields and new API routes only — do not modify any existing legacy schema or route in place. Wire this page behind /v2/payroll/salary-groups; do not touch or redirect the legacy equivalent yet.

Follow the per-module checklist in claude-code-implementation-strategy.md. Stop after feature-flagging (do not cut over) so this one page can be manually verified against its .html reference before merging.
