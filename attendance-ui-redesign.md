# Attendance Module — UI Redesign & Live Merge

## What to do

Merge live-attendance into the attendance module and redesign the attendance calendar grid UI.

### Step 1 — Delete live-attendance
- Delete `src/app/pages/admin/live-attendance/` folder entirely
- Remove its route from `app-routing.module.ts`
- Remove its sidebar entry
- Backend `/v1/live-attendance` stays if it exists — it may be called from attendance page

### Step 2 — Socket.io listener in attendance.component.ts
- Add the Socket.io connection from live-attendance into `attendance.component.ts`
- On punch event for this school's adminId, update today's column cell for that personId live (pulsing dot state)
- On reconcile-complete event (if emitted), update that cell to the actual P/L/HD/A status chip

### Step 3 — Live feed strip (top of attendance page)
- Pulsing green dot + "Live" label
- Counters: Present, Late, Punched (raw, pending reconcile), Absent
- Horizontal scrollable feed of recent arrivals: small pulsing green dot indicator (animated expanding ring, NOT a chip) + person name + punch time
- Feed updates live via socket events

### Step 4 — Grid design

**Sticky columns (left):**
- Name column (140px): person name + shift name below in 10px muted text (shift shown once per row, NOT in every date cell)
- Code/Roll column (56px)

**Date columns (60px each):**
- Today column: blue accent background (`var(--bg-accent)` tint) matching the "Today" badge in header — same blue as other accent elements
- Auto-scroll to today column on load (today = first visible column, past dates accessible by scrolling left)
- Future date cells: `opacity: 0.4`, non-interactive, show `—`
- Past date cells: status chip + in-time and out-time on two lines (10px muted)

**Status chips — rounded square (border-radius: 4px):**
- P (Present): green bg/text
- L (Late): yellow/warning bg/text  
- HD (Half Day): orange bg/text
- A (Absent): red/danger bg/text
- H (Holiday): neutral bg/text, border

**Punch received state (raw socket punch, reconcile pending):**
- Show a pulsing green dot with animated expanding ring (CSS @keyframe: ring expands and fades, repeat 2s)
- Punch time shown below dot in 10px muted text
- NO chip, NO text label — just the dot animation + time
- Replaces the Absent state when socket punch event arrives for that person today
- When reconcile completes, replace dot with actual P/L/HD chip

### Step 5 — Today column active state
- Column header: blue accent bg, "Today" badge (same as current design)
- Column cells: `background: color-mix(in srgb, var(--bg-accent) 15%, var(--surface-2))`
- On new punch arrival: brief green flash animation on that cell (CSS keyframe, 1.5s), then back to blue tint

## CSS reference

```css
/* Pulsing dot — punch received */
.pulse-ring { position: relative; width: 18px; height: 18px; }
.pulse-ring .dot { position: absolute; inset: 4px; border-radius: 50%; background: var(--text-success); }
.pulse-ring .ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--text-success); opacity: 0; animation: ringPulse 2s ease-out infinite; }
@keyframes ringPulse { 0%{transform:scale(0.6);opacity:0.8} 100%{transform:scale(1.4);opacity:0} }

/* Cell flash on new punch */
.dcell.flash { animation: cellFlash 1.5s ease-out; }
@keyframes cellFlash { 0%{background:var(--bg-success)} 100%{background:color-mix(in srgb, var(--bg-accent) 15%, var(--surface-2))} }

/* Today column */
.dcell.today-col { background: color-mix(in srgb, var(--bg-accent) 15%, var(--surface-2)); }

/* Future cells */
.dcell.future-col { opacity: 0.4; pointer-events: none; }

/* Status chips */
.chip { display: inline-block; border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 500; }
```

## Notes
- Roster page Staff/Teacher grid is separate and untouched — do not modify it
- Student tab in attendance shows class selector first, then grid for selected class
- WDMS token 401 auto-retry should already be fixed separately

---

## WDMS Token Auto-Retry Fix

Fix WDMS token expiry handling so no manual restart is needed:

1. In `backend/modules/services/wdms-token.js`: add a `clearWdmsToken()` export that sets `cachedToken = null` and `cachedTokenExpiresAt = 0`.

2. In `backend/modules/services/wdms-employee.js`: wrap `createWdmsEmployee` and `updateWdmsEmployee` axios calls — if error response status is 401, call `clearWdmsToken()`, fetch fresh token via `getWdmsToken()`, and retry the request exactly once. If retry also fails, throw the error.

3. Apply the same 401-retry pattern in:
   - `backend/modules/services/wdms-transaction.js` → `fetchWdmsTransactions`
   - `backend/modules/services/wdms-device.js` → `fetchAllWdmsTerminals`

No manual backend restart needed on token expiry — auto-refresh and retry on every 401.

---

## Shift Form Bug Fix — Optional Staff/Teacher Fields

`halfDayAfterMinutes`, `earlyCheckoutMinutes`, and `lateCheckoutMinutes` are currently required validators in the shift form — but these fields only apply to Staff/Teacher, not students. A shift used purely for students (ClassShift) should not require these fields.

**Fix:**
- In `shift.component.ts`: remove `Validators.required` from `halfDayAfterMinutes`, `earlyCheckoutMinutes`, and `lateCheckoutMinutes` form controls — keep them optional
- In `backend/modules/models/shift.js` (or wherever the Shift schema is): remove `required: true` from these three fields, allow null/undefined
- Backend reconcile already skips these fields for students — no change needed there
- Frontend form section label already says "Staff/Teacher Only" — no UI change needed, just the validator fix