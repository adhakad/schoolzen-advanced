# Fees — Fees

Status: **FINAL**
Reference: `fees.html`

Collect fees per student across the session — the working, day-to-day collection screen.

---

## Frontend

**Toolbar**: row1 (search + Generate Report) + row2 (Class→Stream→Group cascade).

**Table**: checkbox, Student, Admission No., Class, Stream, Group, Concession, Paid Fee, Due Fee (shows "incl. ₹X from 7th" note when prior-year arrears are included), Total Fee, Status (tag — including a distinct "Has Arrears" state), Collected By, Collect / Statement / Report action icons per row.

**Collect Fee modal**: shows a due breakdown split by year (current-year due + any previous-year arrear listed separately, then a Total Due) before the amount field — Payment Mode `.dd`, amount input capped/suggested at the total due but partial payment is allowed. Per the side panel's own tip: **collecting a payment always clears the oldest dues first**, including prior-year arrears, before applying to the current year — never let a partial payment apply to current-year dues while an older arrear remains unpaid.

## Backend

Schema — `StudentFeeRecord`: `adminId`, `studentId`, `sessionId`, `totalFee`, `concession`, `arrears:[{sessionId,amount}]` (populated by Class Promotion's carryforward — see that page's `.md`), payments tracked via `FeePayment` (see below). Paid/Due/Status are DERIVED from `FeePayment` records summed against `totalFee+arrears`, never separately stored fields.

Schema — `FeePayment`: `adminId`, `studentFeeRecordId`, `amount`, `mode`, `date`, `collectedBy`, `receiptNo`. On insert, allocate the amount oldest-due-first (arrears before current-year) — this allocation logic should live in one shared function, not duplicated per endpoint.
