# Fees — Fee Reminder page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `fee-reminder.html` (same folder)

Saved filter criteria for sending WhatsApp fee-payment reminders to
parents — a filter is a reusable RULE, not a one-time send.

---

## Toolbar

Search + "Create" — inside the toolbar.

## Table

Class → Payment Below (%, or muted "No filter") → No Payment Since
(days, or "No filter") → Gap Since Last Reminder (days, or "No
filter") → Send ("To Send" button) → Remove.

## Two-step flow: never a blind bulk send

**Step 1 — Create Reminder Filter modal**: Class, Paid Below (%), No
Payment Since (days), Gap Since Last Reminder (days) — all optional
except Class; each hint clarifies what leaving it blank means ("no
threshold — matches everyone").

**Step 2 — Review & Select modal** (opened by "Choose Filters" or by
clicking "To Send" on a saved filter): shows the actual list of
students the filter currently resolves to — Student, Mobile, Paid %,
Due Fee, Total Fee — each with a checkbox (header = select-all,
pre-checked). Nothing is sent until this step: a saved filter is a
starting point that gets reviewed and adjusted (by unchecking anyone)
every time it's used, since the matching students change day to day.

## Footer — three distinct elements

"Save these filters for next time" checkbox (only relevant when
building a NEW filter — reviewing an already-saved one skips this) +
a running "N selected" count + "Send Now" (disabled until ≥1 student
is checked). Sending is a real outbound message to real parents, so
the count stays visible right next to the button that triggers it.

## Delete confirmation

A saved filter is just a rule — deleting it touches no student data
and cancels nothing already sent, so this uses a plain, low-key
confirm (not type-to-confirm), with the modal stating exactly that
plainly.
