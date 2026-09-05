# Fees — Fee Structure page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `fee-structure.html` (same folder)

Defines the annual fee for a Class(+Stream) — this is what every
student's fee record in **Fees** and **Fee Statement** is generated
from.

---

## Toolbar

Search + Class+Stream (existence+dependency pair, filters the list) +
"Create" — inside the toolbar row.

## Table

Session → Class → Stream (existence-shown, "N/A" when not
applicable) → Particular Total → Admission Fee → Breakdown (icon
opening a read-only view) → Action (Edit/Delete).

## Create/Edit modal

Session (read-only, current) → Class → Stream (dependency-gated,
disabled/hidden unless 11th/12th) → Admission Fee (hint: applies only
to newly admitted students) → **Particulars** — a checklist (Tuition,
Transport, Library, Lab, Sports) where ticking one reveals its amount
input below, and a computed **Particular Total** updates live as
amounts are entered.

## Breakdown view modal

Read-only, split into three clearly labeled sections: **New
Students** (Admission Fee applies, shows the combined total including
it), **Existing Students** (Admission Fee doesn't apply, shows the
particular-only total), and **Particulars** (each line item and its
amount). This distinction — new vs existing student totals — is a
real business fact from the legacy component and stays prominent
rather than being buried in a single flat number.

## Delete confirmation — cascade, type-to-confirm

Per the global cascade-delete rule: this is the one case in the app
where deleting a config record destroys real financial history, not
just placement data — the modal states plainly that every student's
fee records generated from this structure are deleted too, including
anything already paid, and requires typing "DELETE" to confirm. The
legacy component's plain paragraph warning becomes a proper gated
confirmation here, consistent with how every other cascade-delete in
the app now works.
