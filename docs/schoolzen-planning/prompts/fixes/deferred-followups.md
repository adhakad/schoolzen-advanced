# Deferred follow-ups (not forgotten, just not done yet)

Running list of things found and knowingly postponed, so nothing gets
lost between sessions. Add to this file instead of letting a known gap
go untracked; remove an item once it's actually fixed and verified.

---

## Academic Setup (from `academic-setup-critical-fixes.md`'s real-API test round)

- **P1-9, bad-token case returns 500 instead of 401/403.** A failed
  dropdown fetch does correctly show an error (not a blank/silent
  failure), but when the failure is specifically an expired/invalid
  token, the response code is wrong (500 instead of 401/403) — minor,
  but worth a quick fix since it's a real (if small) correctness bug.
- **P1-5, transaction rollback was never actually tested.** The
  happy-path (subject removed from groups + deleted, one transaction)
  was verified; no failure was induced mid-transaction to confirm the
  rollback itself works, only that it's structurally one transaction.
- **UI/browser-side of 8 items never actually clicked through in a
  real browser**: P0-1 (hasStreams auto-toggle, per-stream sections,
  no subject-checklist in Class modal), P1-7 (stream-picker), P1-8
  (Subject Group edit round-trip), P1-9 (error state), P1-10
  (double-submit guard), P1-12 (empty vs error state — this one is
  UI-only and has NEVER been verified at all, not even partially),
  P1-13 (bulk selection/outcome), P1-14 (DELETE-confirm + blocking
  count). Component unit tests pass (118/118) and the server side of
  each was verified via real API calls, but nobody has actually looked
  at these in a running browser yet. Manual checklist already given —
  go through it before calling this module fully done.

---

## Staff / sidebar permissions

- **Staff APIs are ungated.** Gate them with the `staff` permission. Same for the remaining v2 sidebar entries (Student, Attendance, Leave, Holiday, Payroll, Fees, Settings).

## Certificates

- Date input is a plain textbox (needs the shared date picker).
- Shared pager text differs from the html.
- Letterhead reads the legacy school record (v2 isolation).
- Cloudinary PDF storage not done.
- Sidebar was using old nav settings.

## Attendance / devices

- Legacy `device` collection is read (read-only) for WDMS terminal serials. Remove when a v2 Devices module exists.
- Stream Group in Roster is filter + show only; per-group shift assignment (`groupId` on ClassShift) is not built, add only if needed.
- Device punch fix was verified by reading code only; confirm with one real punch plus the BullMQ worker and Redis running.

## Fees

- Waiver UI and Cancel TC UI are not in the html (backend only today); add when the html has the control.
