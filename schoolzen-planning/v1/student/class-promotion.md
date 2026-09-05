# Student — Class Promotion (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`, Academic
Setup (target classes/streams/sections), Generate Marksheet (exam
result feeds the default Pass/Fail read, where available)
Reference: `class-promotion.html`

A year-end bulk action: decide who moves to the next class for the
new session. Creates NEW placement records for the next session
rather than mutating the current one — the current session's
enrollment stays in history exactly as it was.

---

## Summary strip

Students in the filtered class → marked Promote (green) → marked
Detain (red) → not yet decided (implicit remainder) — an at-a-glance
read of decision progress before scrolling into the table.

## Bulk "Promote to" strip

A single target-class selector applied to everyone currently marked
Promote, with an explicit note that it can still be overridden per
student in the table below — handles the common case (a whole class
moves 8th→9th together) in one action, without losing the ability to
send an individual student to a different section for a legitimate
reason (e.g. a language-elective change).

## Table

Roll → Student (avatar+name) → Exam Result (Pass/Fail/Not Set chip,
read from Generate Marksheet's result when available) → Promote To
(target class+section selector, disabled and pre-filled with "repeats
current class" for a Detain decision) → Decision (two toggle buttons,
Promote/Detain — exactly one is ever active per row, never both,
never neither once decided). A detained row gets a subtle red-tinted
background so a whole class of decisions stays visually scannable.

## Confirm Promotion modal

States plainly that this CREATES next-session placements and does NOT
touch the current session's records — the phrase "records are not
changed or deleted" addresses the one thing an admin would reasonably
worry about before a bulk year-end action. A three-number summary
(Promoting / Detaining / Not decided) makes the scope of the action
explicit before confirming. Undecided students are explicitly named
and skipped rather than silently defaulted to either outcome — the
submit button's label states the exact count being acted on ("Confirm
Promotion for 40"), not a vague "Confirm."

## "What happens automatically" — the full cascade, stated explicitly

Promotion isn't just a class-field change; it touches several other
modules, and the modal names every one of them so nothing is a
surprise after confirming:

- **New enrollment** for the next session in the target class/section
  (the actual StudentEnrollment record).
- **Unpaid fee balance carries forward as an arrear** — this is the
  exact mechanism Fee Statement's "Previous Year Dues" ledger reads
  from (see `../fees/fee-statement.md`); promotion is what actually
  creates that arrear entry, not a separate manual step.
- **Roll Number is cleared**, not carried over — a student's roll
  number is specific to their old class+section and rarely matches
  meaningfully in the new one; it's assigned fresh via Manage Students
  once the new class list is finalized.
- **Leave balances reset** per the new session's own Leave Limit
  configuration — leave allocation is a fresh grant each session, not
  something that rolls over.
- **Stream + Subject Group gate for 11th/12th** — a student promoted
  into a streamed class cannot complete promotion without picking a
  stream (and, once Subject Groups exist for it, a subject group) -
  the modal surfaces exactly how many students are blocked on this so
  it's fixed before confirming, not discovered as broken enrollments
  afterward.
- **Fee Structure existence check** — if the target class has no Fee
  Structure defined yet for the next session, the modal warns before
  confirming rather than promoting students into a class with no fee
  record at all until someone remembers to set one up.

Both warning rows use the same amber "needs attention before
proceeding" tone as the rest of the app's non-blocking-but-important
notices — they don't prevent confirming (a school may legitimately
want to promote now and fix the stream/fee-structure gap moments
later), but they make sure the gap is seen, not silently created.
