# Leave — Requests page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `requests.html` (same folder)

Top-level Leave sidebar item, sub-tab "Requests" (default landing page
of the Leave module).

---

## Who can request leave

Both **Staff and Student** — leave isn't staff-only. A student may need
extended absence (medical, family) approved and recorded, same as a
staff member.

## Toolbar (order per the global fixed-filter-order rule)

Search → Person-type (Staff/Student) → Department+Designation (Staff,
adjacent pair, Designation disabled until Department chosen) →
Class+Section (Student, existence-check: Section only appears for a
class that actually has sections — demoed with 6th having sections,
7th not) → Leave Type filter → Status filter → Month+Year (last) →
**"Apply Leave" button, inside the toolbar itself, same row as the
filters** — never in a separate row above/beside the title. This
matches the position of every other primary action in the app (Salary
Groups' "Add Salary Group", Generate Payroll's "Generate for selected").

## Table

Name(+code+type badge) → Leave Type (tag) → From–To → Days → Status
chip (Pending/Approved/Rejected, fixed-width) → Action.

## Action column — three distinct actions, never merged

- **Approve/Reject** (Pending only) — two separate icon-buttons,
  approve green-tinted, reject red-tinted.
- **Cancel** ("take back") — only on an already-Approved leave that
  isn't yet completed. Reject and Cancel are NEVER the same button:
  Reject declines a request that changed nothing yet; Cancel reverses
  a leave that's already on the attendance register.
- **Delete** — only on Rejected/Cancelled requests, to clear clutter.
  Never available on Pending or Approved.

## Apply Leave modal (sticky header+footer)

Who is this leave for (staff/student) → Name → Leave Type → a balance
sentence ("9 days remaining of 12 assigned this year") shown inline,
before the dates, so the applicant knows what they have to spend
without reading a chart → First/Last day (date pickers, min=today,
leave is applied for, never backdated) → computed working-days note
(Sundays/holidays inside the range aren't counted).

## Approve confirmation modal

States what will happen: "X day(s) will be marked as leave on the
attendance register." If the request exceeds the person's remaining
balance, an amber note appears and the button becomes "Approve
anyway" (destructive-styled) — approving over-balance is possible but
never silent.

## Reject confirmation modal

States plainly that nothing changes on the register; the request stays
visible, marked Rejected.

## Cancel ("Take Back Leave") modal

States the leave marks will be removed from the register for those
dates, and the days return to the person's balance. Requires a reason
(textarea) before the destructive button enables — this is data
already acted upon being reversed, so a reason is captured for the
record (feeds ActivityLog per R6).

## Delete modal

Simple confirm — removes the request from the list; attendance is
never affected since only Rejected/Cancelled requests can reach this
action.
