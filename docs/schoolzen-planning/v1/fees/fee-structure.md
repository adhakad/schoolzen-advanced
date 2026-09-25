# Fees — Fee Structure

Status: **FINAL**
Reference: `fee-structure.html`

Defines the annual fee for a Class(+Stream+Group) — admission fee plus a checklist of named particulars.

---

## Frontend

**Toolbar**: search + Create (row1), Class→Stream→Group cascade (row2).

**Table**: Session, Class, Stream, Group, Particular Total, Admission Fee, Breakdown (clickable, opens the full particulars list), Action.

**Add/Edit modal**: Session/Class/Stream/Group selectors + Admission Fee + a dynamic add/remove checklist of particulars (name+amount pairs, e.g. Tuition, Transport, Lab) that sum to Particular Total.

## Backend

Schema — `FeeStructure`: `adminId`, `sessionId`, `classId`, `streamId` (nullable), `groupId` (nullable), `admissionFee`, `particulars:[{name,amount}]`. Unique `(adminId, sessionId, classId, streamId, groupId)`. This is what `StudentFeeRecord.totalFee` derives from when a student's fee record is created/rolled over for a session — Class Promotion's warning about a missing Fee Structure for the target class+session (see `class-promotion.md`) checks against this exact collection.
