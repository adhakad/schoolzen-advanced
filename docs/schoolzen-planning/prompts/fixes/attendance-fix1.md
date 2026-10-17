# Attendance — fix 1 (Roster, Manage Shifts, Overview)

ONE fix file for the three Attendance pages. Fresh Claude Code session, no agents, don't commit.
Also read `prompts/fixes/global-fixes.md` first (cross-module rules + status per module). Apply its rules to the Attendance pages in the same run and `prompts/fixes/attendance-leave-holiday-fixes.md`
(resolver / roster-WO / UI audit; items there still apply, do not redo what is done).

**Source of truth:** `v1/attendance/roster.html|md`, `manage-shifts.html|md`, `attendance-overview.html|md`.
html wins over the build. Never invent components. Do NOT read or reference the old `/pages/admin/attendance`
(frontend or backend) for now. Build from the html/.md and modern practice only.

Before you say done: re-read the reference html/.md and list one line per item what you matched and what you could not;
run the build and the tests you wrote; do not report PASS for anything you have not run.

---

## 1. Roster
1. Form "Select shift *" must show shift name + time in 12-hour AM/PM (e.g. `Morning 8:00 AM – 2:00 PM`), never raw numbers.
2. Weekly off defaults to Sunday but is a normal toggle: user can click it to make it a working day, and click any
   other weekday to make it WO (same chip behaviour as other days).
3. Current date column: day name AND date both active (brand-coloured as in the html `today-col`), same click behaviour.
   Everything else must match the html; fix every remaining mismatch.
4. Delete + re-assign are broken. **Diagnose first (max 5 lines):** why after delete only Edit is enabled and Assign is not
   (likely state: a deleted cell is treated as "has roster" or selection/disabled flag is not reset). Fix so: delete clears
   the cell and the selection; Assign is enabled again; re-assign over a deleted or existing cell works.
   Delete must be type `DELETE` confirm, bulk, one write, with spinner (global rule 11).
5. The form calendar (Applies to Month) is hidden until the field is clicked, exactly like the html.
6. Class create / Class rows: Stream Group follows the class. Class with General group: Stream Group is preselected
   and disabled (show-only). (Global rule 2.)

## 2. Manage Shifts
1. Start Time / End Time are dropdowns (`.dd`) with all times pre-listed in 12-hour AM/PM, 15-minute steps
   (12:00 AM … 11:45 PM). Choose only; no free typing.
2. "Punch in settings" and "staff only" sections: inputs use the SAME input style as the upper inputs
   (height, border, radius, focus ring from the design system).
3. Early Punch (min) and Grace (min) are required; Submit stays disabled until both are filled with valid numbers.
   Show the helper texts from the html. Spinner on submit (global rule 11).

## 3. Attendance Overview

### 3a. Table must match the html (not the current build)
- Copy structure and CSS from `attendance-overview.html`: sticky checkbox / name / type columns, horizontal scroll,
  `.today-col` header and column, auto-scroll to today, chips `.chip.present|late|absent|holiday` with `.s` + `.t`,
  live pulsing ring `.pulse-cell` for punched-in-no-out, Recent Arrivals panel.
- Attendance chips must render for every status (Present, Late, Absent, Holiday, WO, Leave). Today only WO shows: fix.
- Identity column: show Name plus a second line. Staff: Employee ID. Student: Roll No • Class-Section.
  Search must match name / employee ID / roll no.
- Times everywhere in AM/PM. Chip `.t` text may show `8:23` with the AM/PM suffix; set `.chip` to 45px x 36px (5:4 ratio, width 100 : height 80) with 6px left/right padding and 2px gap between status and time,
  `.s` 10.5px, `.t` 7.5px, so `8:23 AM` fits with clear space from the border. Day columns 62px, table `table-layout:fixed`,
  sticky check/name/type columns fixed at 38/160/90px so they never squeeze. Mobile (<=640px): only checkbox 30px + name 104px sticky, hide Type + avatar, day columns 54px, search full width (global rule 13). Today auto-scroll scrolls only the grid wrapper, not the page. This is the only size change to the html.

### 3b. Filters
- Add **Stream Group** filter to the filter row (the html lacks it). Order: Person Type, Department, Designation,
  Class, Stream, Stream Group, Section. Same `.dd` and size as the others. Filters sit 6 per row (CSS grid `repeat(6,minmax(0,1fr))`), the 7th wraps to the next row; on mobile 2 per row. Cascade: Class -> Stream -> Stream Group -> Section.
  Disabled state shows the same text as enabled ("All stream groups") per global rule 8.
  Student-only filters stay disabled when Person Type is Staff.

### 3c. Past / future / today cell treatment (decided; minimal change to html design)
Same chip, same size, same font. Only these modifiers (reuse tokens, no new colours):
- **Past date:** show the real status chip exactly as the html. Add `.chip.locked{opacity:.62; cursor:not-allowed}`.
  Tooltip "Past dates can't be changed". No click action.
- **Today:** normal chip, `cursor:pointer` for authorized users within the time window (see 3d). Today column keeps `.today-col`.
- **Future date:** show what the roster expects, not empty: shift code (e.g. `M`), `WO`, or `H` for holiday, using
  `.chip.future{opacity:.45; border:1px dashed var(--line); background:transparent; cursor:not-allowed}`.
  Text colour `var(--ink-faint)`. Tooltip "Upcoming date".
- **No roster for that person/day** (past or future): `—` in `.chip.nocell` = same dashed style, `opacity:.35`.
  Leave stays visible as Leave on past/future too.
- Dashed style comes only from `.chip.future` / `.chip.nocell`; the present/late/absent look is untouched.

### 3d. Manual attendance (device punches are separate, see 3e)
Manual attendance is **status marking**, not punching. Only three statuses: **Present, Late, Absent**.
No Punch In / Punch Out anywhere in the manual flow (UI text, API names, activity log).
Rules, all enforced on the BACKEND (UI only mirrors):
1. Only **today**. Past and future rejected with 403, no correction flow.
2. Only inside the attendance window: shift start minus Early Punch (min) up to shift end (Manage Shifts fields).
   Outside window rejected; chips disabled with tooltip showing the window in AM/PM.
3. Only users with new permission key `attendance-mark` (add to Roles & Permissions, backend guard, activity log
   entry for every mark: who marked, whom, status, time). No permission = chips not clickable.
4. Default status is Absent when nothing is marked and no device punch exists.
5. Click an editable today chip -> overlay popover directly under the cell (global rule 1 overlay style) showing the
   person's name/ID and three options: **Present / Late / Absent** (current one highlighted). Choosing one saves immediately
   (no extra confirm); Absent clears the manual mark.
6. Wording: students and staff both use "Mark Present / Mark Late / Mark Absent" and the caption "Marked at 8:23 AM".
   No word "punch" for manual marking. ("Punch" stays only for device data in 3e.)
7. **Time always comes from the server** (`markedAt`), never the browser, shown in 12-hour AM/PM on the chip `.t`.
   Changing the status again the same day updates `markedAt` and keeps the previous value in the activity log.
8. Record: one doc per person per day; manual mark stored as `{status, markedAt, markedBy, source:'manual'}`.
   A device punch for that day is never overwritten by a manual mark: if a device punch exists, the popover is
   read-only with the note "Device punch recorded at <time AM/PM>". Unique `(adminId, personType, personId, date)`.
9. Submit guard: option buttons disabled + spinner while in flight, `Idempotency-Key` header so double click can't double write.
10. After success update only that cell (no full reload), and refresh the dashboard hint.

### 3e. Device punches do nothing — diagnose, then fix
Diagnose first and report in 8 lines max, tracing one real punch end to end:
WDMS token/config -> terminal serial (legacy `device` read-only, agreed exception) -> emp code to person mapping ->
`PunchLog` insert (`punchHash` dedupe) -> BullMQ queue -> worker running and connected to Redis -> reconcile writes the
attendance doc -> Overview reads it. Say which link is broken, then fix it. Add a visible "Last sync: <time AM/PM> /
<n> punches" line near Sync Now so the user can verify device punches without reading logs. Sync Now keeps its confirm modal.

## 4. Tests (essential only, plus final run)
Resolver cases, manual mark rules (today only, window, permission, idempotency, server time, source tag, device not overwritten),
status Present/Late/Absent, roster delete -> re-assign, shift form validation, stream-group cascade, one Playwright
parity check of the Overview table vs the html (chips, today col, sticky columns, past/future styles). Global rule 9 test
types apply at the final test round, not per fix.
