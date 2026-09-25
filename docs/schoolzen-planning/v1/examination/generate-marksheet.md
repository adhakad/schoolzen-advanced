# Examination — Generate Marksheet

Status: **FINAL**
Reference: `generate-marksheet.html`

Every student with a marksheet structure set up for their class — enter marks, then preview and print.

---

## Frontend

**Toolbar**: row1 (search + "Bulk Enter Marks (N)" + "Print Selected (N)", both disabled until rows checked) + row2 (Class→Stream, Term/Exam `.dd`).

**Table**: checkbox, Student, Roll No., Class, Marks Status (tag: Entered / Not entered), Actions (edit marks pencil, preview eye).

**Enter/Edit Marks modal**: one row per subject (from that class's Marksheet Structure), Theory + Practical inputs bounded by that subject's configured max, plus a co-scholastic grades section.

**Bulk Enter Marks modal**: a spreadsheet-like grid — one row per selected student, one column per subject (dynamically built from the class's subject list) — for entering many students' marks in one screen rather than opening each individually.

## Backend

Schema — marks live on a `StudentMarksheet` or embedded structure per student per term, validated against that class's `MarksheetStructure` maxes (reject a theory score exceeding `theoryMax`). Bulk-enter is one batched write, not N sequential saves. Print/Preview renders via the shared print/PDF template service (see `student/admission.md`'s letterhead note).
