# Certificates — TC Structure

Status: **FINAL**
Reference: `tc-structure.html`

One school-wide structure — a Transfer Certificate's content doesn't vary by class, unlike Marksheet/Admit Card Structure. Not a table page — a single settings form.

---

## Frontend

**Body**: a 19-field checklist, all checked and **locked** (disabled checkbox + lock icon) — these are the board-mandated standard TC fields and are not a school's choice to toggle off. Below it, a single editable field: "Next TC Serial Number" (auto-increments per certificate; editable only to correct a numbering gap) → "Save Structure" button.

**Side panel**: stats (Fields on Certificate=19, Next Serial No., TCs Issued This Session) + tips explicitly stating the fields can't be turned off and the serial-number edit only affects future certificates.

## Backend

Schema — `TcStructure`: `adminId`, `nextSerialNumber` (string, e.g. "TC-2026-0048"). The 19 fields themselves are NOT stored per-school configuration — they're a fixed constant in code (the standard board format), since the page itself states they're locked and non-configurable. Generate TC reads this doc only for the current serial number, incrementing it on each issue.
