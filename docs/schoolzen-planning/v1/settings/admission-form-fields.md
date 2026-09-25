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
