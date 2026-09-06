# Certificates — Transfer Certificate Structure (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `tc-structure.html`

New top-level module: **Certificates** — administrative student-exit
documents, separate from Examination (exam-linked documents) and from
Student (record-keeping). Currently holds Transfer Certificate; future
certificates (Bonafide, Character) would join this module rather than
starting a new one each time.

---

## One school-wide structure, not per-class

Unlike Marksheet/Admit Card Structure, a TC's content doesn't vary by
which class the leaving student was in — there is exactly one
structure for the whole school, so this page has no Class filter at
all, just a single settings form.

## Always Included vs. Optional Fields

**Always Included** (locked, matches the legal minimum every TC
needs): Student Name, Father's Name, Date of Birth, Admission No.,
Class Left From, Date of Leaving, Reason for Leaving, Date of
Admission, School Serial No. — same locked-checkbox visual treatment
established by Admission Form Fields' "Always Required" group.

**Optional Fields** (school toggles on/off): Conduct Remark, Subjects
Studied, Attendance %, Fee Dues Cleared, Games/Extra-Curricular,
Qualified for Promotion.

## Certificate Numbering

A single "Next TC Serial Number" field, auto-incrementing with every
certificate issued — editable here only to correct a genuine gap
(e.g. a physical register was already ahead of the system), not for
routine use.
