# Settings — Admission Form Fields

Status: **FINAL**
Reference: `admission-form-fields.html`

Controls which fields the Admission form shows, whether each is required, and each field's validation rule — this is the single source both the Admission form AND its bulk-import validation must read from (a legacy anti-pattern found in review was hand-duplicated validation between a form and its bulk-import path that silently drifted apart — this page exists specifically to prevent that).

---

## Frontend

**Body**: grouped field list — "Always Required" (Name/Class/DOB/Gender — locked, can't be hidden, but their validation rule can still be edited via the gear icon), then Student Info / State-Specific (dynamic per the school's configured state — a `.dd` state picker filters which state-fields show) / Parents Info / Parents Contact / Admission Info (Admission No./Roll No. — always-required, shown but disabled toggle) groups, each field row: name+current-rule description, a Required toggle, a gear icon (opens validation-rule editor), and a Show/Hide switch (except always-shown fields).

**Add Custom Field / Add State-Specific Field**: opens a modal to define a brand-new field with its own type+validation.

**Save Changes**: one explicit save button — this is a settings form, not a per-row auto-save table.

## Backend

Schema — `FieldConfig`: `adminId`, `fieldKey`, `label`, `group`, `required` (bool), `visible` (bool), `locked` (bool — can't be hidden/unrequired), `validationRule` (a structured rule object: pattern/min/max/uniqueness/etc., not a hardcoded regex per field), `stateSpecific` (nullable — which state this field only shows for), `isCustom` (bool).

**This is the authoritative source for validation** — the Admission page's form AND its bulk-import path (Manage Students' Excel Import, per that page's known legacy anti-pattern) must both call ONE shared validator function that reads `FieldConfig` at runtime, never two separately hand-written validation implementations.

**Excel Export/Import for dynamic fields — header-text-driven mapping, never column-position-driven.**
- **Export**: column headers are each field's current `FieldConfig.label` (human text, not `fieldKey`), in `visible` fields only, ordered by `group` then within-group order — Always Required first, then Student Info/State-Specific/Parents Info/Parents Contact/Admission Info, same order the settings page lists them. State-specific and custom fields appear as ordinary columns wherever their group places them; a field the school never enabled (`visible:false`) is never a column.
- **Import reads columns by matching their header text against current `FieldConfig.label`s at import time — never by column index/position.** This is the one rule that makes the rest of this safe: an admin re-ordering columns by hand in Excel, or a field being added/renamed/reordered in Settings after a template was last downloaded, can never silently shift a value into the wrong field — a header that doesn't match any current field's label is treated as an **unrecognized column** (reported once, not per-row; the row data under it is ignored, the rest of the file still processes).
- **Structural check runs once, before any row is validated**: every `required:true` + `visible:true` field's label must appear as a column header, or the whole file is rejected upfront with the list of missing required columns — cheap, and avoids generating hundreds of misleading per-row errors for what is really one file-level problem. A missing column for a `required:false` field is fine — those cells are simply treated as blank/not-provided for every row.
- **Per-row validation** then runs the same shared `FieldConfig`-driven validator the Admission form uses, field by field, against the mapped values — never a separate/duplicated Excel-only rule set. Row-level errors follow `error-catalog-conventions.md`'s bulk row-level shape (`{row, field, message}`), and `field`/`message` use the field's `label`, not its internal `fieldKey` — the person fixing the sheet only ever sees field names they recognize from the form/settings page, never an internal key.
- This is the same shared-validator principle already stated above, made concrete for the Excel path specifically — it is what actually prevents the "export/import enum drift" class of bug already confirmed once in `student/errors.md` (Qualification/Occupation options), because both directions now read the same live `FieldConfig`/constants instead of each hardcoding its own copy.
