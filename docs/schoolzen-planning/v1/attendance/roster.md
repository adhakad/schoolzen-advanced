# Attendance — Roster

Status: **FINAL**
Reference: `roster.html`

Assign a shift to each staff member or student — what Overview reads as the expected shift per person per day.

---

## Frontend

**Toolbar** (this page's OWN 3-row shape, flex not grid — only 3 filters, don't force Overview's 6-col grid template here): row1 (search), row2 (Person Type → Department/Class → Designation, flex row of `.dd`s, fixed ~150px each), row3 (month nav).

**Legend strip**: only shifts actually in use render here (dynamic, not every configured shift).

**Selection bar**: checkbox-selected rows enable "Assign to Selected" and "Delete Selected".

**Staff view**: a horizontally-scrollable date-grid, each cell a shift-code chip (click to reassign).

**Student view**: a Class→Stream→Section hierarchy table (same nesting convention as Classes & Sections), each row showing its assigned shift+time or "Not assigned" with a `+`/pencil icon to assign.

**Delete Selected**: type-to-confirm (`DELETE`), warning states attendance already recorded is unaffected but nothing decides the expected shift going forward until reassigned.

## Backend

No new model — reads/writes `shiftId` on `Staff` or on `StudentEnrollment` (student shift assignment is session-scoped, matching how class placement itself is session-scoped). Bulk-assign is one `bulkWrite`/`updateMany`, never N sequential updates. List endpoint returns each person's shift name already populated (single query with join), not resolved client-side per row.
