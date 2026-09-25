# Student — Class Promotion

Status: **FINAL**
Reference: `class-promotion.html`

Year-end bulk Promote/Detain decision per student, creating NEW next-session placements — the current session's records are never touched.

---

## Frontend

**Toolbar**: row1 (search) + row2 (Class → Stream (11/12 only) → Group (depends on Stream) → Section, dependency-cascaded `.dd`s) + a "Promote strip" (bulk "Promote everyone marked Promote from 8th to: [target class]" `.dd`, applies only to rows currently marked Promote, individually overridable below).

**Table**: Roll, Student, Exam Result (tag: Pass/Fail/Not Set), Promote To (a `.dd` per row — disabled+relabeled "8th (repeats)" when that row is set to Detain), Decision (two toggle buttons, Promote/Detain, exactly one active — setting Detain disables that row's Promote-To dropdown and tints the row).

**Confirm Promotion modal**: states plainly this CREATES next-session placements without touching current records; a 3-number summary (Promoting/Detaining/Not decided); a "what happens automatically" checklist (new enrollment, unpaid-fee-as-arrear carryforward, roll number cleared, leave balances reset per new session) plus amber warning rows for anything blocking (students moving to 11th needing Stream+Subject Group set; target class missing a Fee Structure for the new session) — these warnings are non-blocking (confirm is still allowed) but must be surfaced, never silent. Submit button labels the exact count ("Confirm Promotion for 40"), not a vague "Confirm."

## Backend

No new model — this creates `StudentEnrollment` documents for the NEXT session (see `manage-students.md`'s note that class placement is session-scoped via `StudentEnrollment`, not a flat field on `Student`).

On confirm, for every student marked Promote:
1. Create their new-session `StudentEnrollment` (target class/section/stream/group).
2. If they have unpaid balance in `StudentFeeRecord` for the current session, push it into the new session's fee record's `arrears[]` array (see Fees module).
3. Clear roll number on the new enrollment (left for manual assignment via Manage Students).
4. Reset/create their `LeaveLimit` entries for the new session.
**Scale**: this runs for a whole school's cohort at once (potentially thousands of students in one confirm click) — it is a **BullMQ background job, never a synchronous HTTP request** processing the whole set inline (the confirm endpoint enqueues and returns immediately; the UI polls/gets notified when done, per `additional-technical-considerations.md`'s job-queue pattern). Inside the job, students are processed in **chunks of a bounded batch size** (e.g. 200 at a time), each chunk's 4 steps wrapped in its own transaction — never one single all-thousand-students transaction (long-held transactions/locks at that size are themselves a scale problem) and never an unguarded loop of individual `.save()` calls per step. A partial failure must not leave a student half-promoted (enrollment created but fee-carryforward missed, etc.) within their own chunk's transaction; a failed chunk is retried/reported without re-processing already-committed chunks (idempotency key per chunk, same pattern as `additional-technical-considerations.md`'s queued-job dedup rule).

Validation before allowing confirm to actually process a given student: if moving into a streamed class (11/12) with no Stream+Subject Group chosen, or if the target class has no Fee Structure for the next session, surface these as warnings in the confirm response — matching the two warning rows shown in the modal.
