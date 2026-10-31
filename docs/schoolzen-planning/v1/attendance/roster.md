# Attendance — Roster

Status: **FINAL**
Reference: `roster.html`

Assign a shift to each staff member or student — what Overview reads as the expected shift per person per day.

---

## Frontend

**Toolbar** (this page's OWN 3-row shape, flex not grid — only 3 filters, don't force Overview's 6-col grid template here): row1 (search), row2 (Person Type → Department/Class → Designation, flex row of `.dd`s, fixed ~150px each), row3 (month nav).

**Legend strip**: only shifts actually in use render here (dynamic, not every configured shift).

**Selection bar**: checkbox-selected rows enable "Bulk Assign" and "Bulk Delete".

**Staff view**: a horizontally-scrollable date-grid, each cell a shift-code chip (click to reassign).

**Student view**: a Class→Stream→Section hierarchy table (same nesting convention as Classes & Sections), each row showing its assigned shift+time or "Not assigned" with a `+`/pencil icon to assign.

**Bulk Delete**: type-to-confirm (`DELETE`), warning states attendance already recorded is unaffected but nothing decides the expected shift going forward until reassigned.

## Backend

No new model — reads/writes `shiftId` on `Staff` or on `StudentEnrollment` (student shift assignment is session-scoped, matching how class placement itself is session-scoped). Bulk-assign is one `bulkWrite`/`updateMany`, never N sequential updates. List endpoint returns each person's shift name already populated (single query with join), not resolved client-side per row.

## Update 2026-10-19 (replaces the toolbar and selection-bar text above where they differ)
- Filters use the Overview grid (6 per row, 2 on mobile). Person Type first; Staff shows Department + Designation, Student shows Class, Stream, Stream Group, Section; the other type's filters are hidden. Month filter is the last cell.
- Buttons: "Bulk Assign", "Bulk Edit", "Bulk Delete", 130px x 38px, 2 per row on mobile. Delete confirmation text stays type-to-confirm.
- A roster is created for the WHOLE month (day 1 to last day), past days included; days outside any roster are locked.
- Last left sticky column carries the light theme shadow.
