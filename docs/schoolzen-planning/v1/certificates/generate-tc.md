# Certificates — Generate TC

Status: **FINAL**
Reference: `generate-tc.html`

Every student, all shown by default — issue a TC for a leaving student, then print it. Class filter narrows only, never gates (same rule as Manage Students).

---

## Frontend

**Toolbar**: row1 (search) + row2 (Class→Stream→Section cascade) + row3 (Status: Any/Issued/Not Issued).

**Table**: Roll No., Student, Class (tag), Date of Leaving (— if not yet issued), Status (tag), Action — **not-yet-issued rows show an "Issue TC" button; already-issued rows show a printer icon** (same not-yet vs. done dual-action-column pattern as elsewhere in this app).

**Issue TC**: opens a form (date of leaving, reason, conduct, etc. per TC Structure's locked field list) → generates the certificate using the current `TcStructure.nextSerialNumber`, then increments it.

**Print**: uses the shared letterhead print template (same as Admission Letter / Admit Card).

## Backend

Schema — `TransferCertificate`: `adminId`, `studentId`, `serialNumber` (captured at issue time — locked, never recalculated on reprint), `dateOfLeaving`, `reasonForLeaving`, `generalConduct`, `remarks`, plus the snapshot of the 19 board-mandated fields pulled from the student's record at issue time (a TC reflects the record AS OF issuing, not live data that could change later). Issuing increments `TcStructure.nextSerialNumber` transactionally with creating this document.
