# Settings — Academic Sessions (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md` (R7:
AcademicSession)
Reference: `academic-sessions.html`

Manages the sessions every page's header session-selector reads from.
This is the page that makes multi-year operation actually work, not
just the dropdown that assumes sessions already exist.

---

## Exactly one Active session — always

A school has exactly one session marked **Active** at any time. Every
NEW record created anywhere in the app — an admission, an attendance
punch, a fee payment, a payroll run, a leave request — is saved
against the Active session, period, regardless of which session the
header selector happens to be showing at that moment. This separation
(what you're **viewing** vs. what's **Active**) is the single most
important rule on this page and is called out explicitly in an info
strip at the top.

## Viewing a past session — read-only, not a context switch

Switching the header's session selector to a Closed session lets a
user **browse** that year's records (a past Fee Statement, an old
Marksheet, last year's Attendance) — it does NOT change where new data
gets saved, and every create/edit/delete action across the app is
disabled while viewing a non-Active session. This is what makes
"look up a fact from two years ago" safe without an accidental write
landing in the wrong year.

## Table

Session → Start Date → End Date → Status chip (Active / Upcoming /
Closed) → Action:
- **Active**: no action available (can't deactivate the only active
  session — you activate a different one instead, which closes this
  one as a side effect).
- **Closed**: a "View" icon (browses that session read-only, same as
  switching the header selector to it).
- **Upcoming**: "Set as Active" button + Delete (an Upcoming session
  with nothing recorded against it yet is safe to delete outright).

## Create Session modal

Session Label, Start/End Date, and — the part that actually makes
year-to-year setup bearable — a **"Copy forward" checklist**: Fee
Structure, Marksheet Structure & Admit Card Structure, Salary Groups,
Holiday Templates, each opt-in via checkbox. This copies CONFIGURATION
only, as an editable starting point — never student placements
(that's Class Promotion, a separate explicit step) and never financial
records (a copied Fee Structure is a fresh template with no payments
attached, even if the amounts start out matching last year's). The
hint states this distinction plainly so nobody expects Copy Forward to
also promote students.

A newly created session is always **Upcoming** — it cannot be created
directly as Active, forcing the explicit "Set as Active" step (below)
even for a school's very first extra session.

## Set as Active modal — type-to-confirm

This is the one action on this page gated by type-to-confirm (typing
the session label, e.g. "2027-28"), because its blast radius is the
entire school, every user, immediately: the warning states plainly
that every new record from every user starts landing in the new
session the moment this is confirmed, and that the previously-Active
session becomes Closed (but remains fully browsable). This is
deliberately heavier friction than the rest of the app's confirmations
— the global cascade-delete rule's lighter single-confirm doesn't
apply here because nothing is being deleted, but the scope of effect
(the whole school, permanently, immediately) still warrants it.

## Relationship to Class Promotion

Creating and activating a new session does NOT move any students into
it — Student → Class Promotion (see `../student/class-promotion.md`)
is the explicit, separate step that creates each promoted student's
enrollment in the new session. A school typically: creates the new
session with Copy Forward checked for its configs, runs Class
Promotion against the still-Active old session (which creates
enrollments in the new one), confirms Fee Structure/Salary Groups look
right for the new year, THEN sets the new session Active. This
ordering means the new session already has real data (enrollments,
config) waiting the moment it goes live, rather than an empty session
with a rush to populate it after the fact.
