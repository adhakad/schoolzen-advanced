# Holiday — Assign

Status: **FINAL**
Reference: `assign.html`

Assigns a Holiday Template to staff or to a whole class of students.

---

## Frontend

**Toolbar**: row1 (search + "Assign to Selected" + "Edit Selected", both disabled until rows checked) + row2 (Person Type→Dept/Class→Designation→Section cascade, same pattern as elsewhere).

**Mixed-selection warning**: if the current selection mixes people who already have a template with people who don't, a warning banner appears and both action buttons should be treated as invalid for that mixed selection — Assign is for never-assigned people, Edit is for already-assigned people; selecting across both purposefully triggers this warning rather than silently doing the wrong thing.

**Table**: checkbox, Name, Department, Assigned Template (or "Not set"), Action.

**Assign/Edit modal**: a single Template `.dd` — Assign creates the link, Edit changes it, for every selected person at once.

## Backend

Schema — assignment lives as `templateId` on `Staff`/`StudentEnrollment` (session-scoped for students, matching the shift/class pattern elsewhere) rather than a separate join collection, since each person has at most one active template. Bulk assign/edit is one `bulkWrite`. The mixed-selection rule should also be enforced server-side (reject a batch that mixes intents), not just as a frontend warning.
