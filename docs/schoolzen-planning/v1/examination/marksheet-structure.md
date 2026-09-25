# Examination — Marksheet Structure

Status: **FINAL**
Reference: `marksheet-structure.html`

Every Class(+Stream) shown always, with its assigned template and subjects — set up the ones still empty (existence-shown, not a filtered "only configured" list).

---

## Frontend

**Table**: Class, Stream, Template (or "Not set"), Subjects Set (count or "0"), Action (opens the setup view).

**Setup view**: a marks-table listing each subject with Theory Max and Practical Max inputs — this defines what Generate Marksheet later collects per student.

## Backend

Schema — `MarksheetStructure`: `adminId`, `classId`, `streamId` (nullable), `templateId`, `subjects:[{subjectId, theoryMax, practicalMax}]`. This is what Generate Marksheet reads to know which fields to show per student in that class.
