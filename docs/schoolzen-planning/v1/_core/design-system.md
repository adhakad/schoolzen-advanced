# Schoolzen — Design System (single, final — no versions)

Status: **FINAL**. There is no v1/v2 — this is the only design system. Every page in this package must match it.

---

## Fonts
Headings/numbers: `Fraunces` (serif). Body/UI text: `Inter` (sans).
```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

## Icons — Bootstrap Icons only
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
```
`<i class="bi bi-xxx"></i>` everywhere. Never inline SVG, never a mixed icon set.

## Color tokens
```css
--paper:#F8F6FC; --surface:#FFFFFF; --ink:#1E1730; --ink-soft:#4F4A63; --ink-faint:#837C97;
--line:#E3DEEF; --line-soft:#EEEAF6; --brand:#8C52FF; --brand-deep:#6425D9; --brand-soft:#F2EAFF;
--slate:#6B5B95; --slate-soft:#EFE7F8; --danger:#B65C4A; --danger-soft:#F7EBE8;
--success:#1E7A46; --success-soft:#E7F4EC; --warning:#9A6A16; --warning-soft:#FBF1DE;
--sidebar:#181321; --sidebar-active:#2A2138; --radius:6px;
```
Never warm/tan greys — always violet-tinted neutrals.

## Page shell
Dark sticky sidebar (248px) → topbar (crumb left, session-pill + profile-dropdown right) → content (`.page-head` h1+subtitle, then `.layout-row`: `.sw-card-main` flex:1 + `.col-side` 260px fixed).

**Toolbar shape is NOT one fixed template** — match each page's OWN needs: many filters → row1(search+buttons)/row2(6-col filter grid)/row3(secondary nav); few filters → one flex-wrap row. Never force one page's row-split onto another — this was a real mistake made once (forcing Overview's 3-row split onto Roster, which only needed one row) and must not repeat.

## Dropdown component — `.dd` — never a native `<select>`
```html
<div class="dd sw-select-pill" id="x" data-value="v">
  <div class="dd-trigger" onclick="toggleDD(event,'x')" style="display:flex;align-items:center;justify-content:space-between;width:100%;">
    <span class="dd-label">Label</span><i class="bi bi-chevron-down chevron"></i>
  </div>
  <div class="dd-menu full-width">
    <div class="dd-option selected" onclick="selectFilter(this,'x','v','Label')">Label</div>
  </div>
</div>
```
`.dd-label` MUST have `white-space:nowrap;overflow:hidden;text-overflow:ellipsis` — never let it wrap to 2 lines (this broke row alignment once already). Disabled state resets value+label to the default option. Profile dropdown starts with a `.drop-school` block (logo+name+meta) above the menu items — don't drop this.

**Menu positioning and open/close behavior — a global rule, confirmed broken across forms today, not a per-instance fix.**
- `.dd-menu` renders in a **top-layer/portal** (a `<dialog>`/`popover`-API element, or an absolutely-positioned element appended to `document.body`, not a child clipped by the modal/form's own `overflow:hidden`/`overflow:auto` container) — this is why a `.dd` near a modal's footer today gets visually cut off/hidden behind the footer: it's being clipped by an ancestor's overflow box, not actually mispositioned.
- On open, measure available space below the trigger inside the viewport (or the nearest scroll container for a non-modal page): if the full menu height doesn't fit below, **flip it to open upward** above the trigger instead — the same collision-aware placement pattern already used for the `.dp` date picker. Never let a menu render partially off-screen or behind another element; flip/clamp, don't just overflow-hidden it away.
- **The portal/top-layer requirement explicitly beats a modal's own header AND footer, not just its scrollable body.** A modal's sticky header/footer commonly carry their own `z-index`/`position:sticky` to stay pinned while the body scrolls — a `.dd` menu rendered as a normal in-flow child can end up visually UNDER either one even after the overflow-clipping fix above, since sticky elements create their own stacking context. The menu's portal element must sit at a higher stacking layer than the modal's header and footer, not just above its body content — a dropdown near the top or bottom edge of a modal (a field right below the header, or right above the footer's action buttons) is exactly where this shows up if missed.
- **Stays open until an explicit resolution**: selecting an option, clicking anywhere outside the `.dd` (including outside the portaled menu itself), or moving focus to a different field all close it. A menu must never auto-close on its own (e.g. on scroll, on an unrelated re-render, or after a fixed timeout) while no resolution has happened — that's the other half of today's bug reports (menus disappearing before a value was picked).
- This applies to **every** `.dd` instance app-wide — filters, form fields, Excel Import's field-mapping dropdown, everything — fixed once here rather than patched per page/per module.

## Date picker component — `.dp` — never a native `<input type="date">`
A native date input renders the browser's own calendar chrome, which is
inconsistent across browsers and breaks the design system's look on any
page with a date field (Student's DOB/DOA, and every other page with a
date filter or date input). Build one shared popover component, reused
everywhere a date is entered:
```html
<div class="dp" id="x">
  <div class="dp-trigger field-input" onclick="toggleDP(event,'x')">
    <span class="dp-label">Select date</span><i class="bi bi-calendar3"></i>
  </div>
  <div class="dp-panel">
    <div class="dp-nav"><i class="bi bi-chevron-left" onclick="dpPrevMonth('x')"></i><span class="dp-month-label">September 2026</span><i class="bi bi-chevron-right" onclick="dpNextMonth('x')"></i></div>
    <div class="dp-grid"><!-- day cells --></div>
  </div>
</div>
```
Opens below the field, same positioning rule as `.dd-menu`. Today's date
gets a hairline ring; the selected date is filled `var(--brand)` purple
with white text. Month/year navigation via chevrons, no native `<select>`
inside it. Hairline border (`1px solid var(--line)`), `border-radius:6px`,
Fraunces/Inter fonts per the rest of the system — no native browser
calendar chrome anywhere. Closing the panel (select, outside click, or
Escape) must call the bound control's touch/validation handler exactly
like `.dd`'s own close handler does (see Form validation state below) —
a `.dp` gets no native `blur` event either.

## Checkboxes
Every checkbox on every page shares one fixed size and one theme — never
the browser default appearance. Unchecked: hairline border
(`1px solid var(--line)`), transparent fill. Checked: filled
`var(--brand)` purple with a white check glyph. Same size across a whole
table's row-select column and any standalone checkbox elsewhere on the
page — a mix of native-sized and custom-sized checkboxes on the same
page is the exact regression to avoid.

## Buttons
Primary: `background:var(--ink);color:#fff`. Any consequential action (sync, delete) opens a confirm modal first — never fires on click. Destructive deletes require typing `DELETE` before the confirm button enables.

**Width rule**: the page's ONE main/primary action button (e.g. "Create", "Save") is padding-based, auto-width to its own label — it never shares a width with the other toolbar buttons. Every OTHER (secondary/utility) button on the same toolbar — Export, Import, Filter, Assign Card, etc. — shares one common fixed width with each other, regardless of each one's own label length, so the row reads as one consistent set; only the main button is the exception, sized to itself.

## Cards / tables
Hairline border only (`1px solid var(--line)`), `border-radius:6px`, no box-shadow. Sticky leading columns via `position:sticky` with cumulative left offsets. Status chips: outline only, all chips in a set the same fixed width, never filled/solid.

**Per-column text-case + sort, on any list table with free-text "main field" columns (a person's name, father/mother/guardian name, and similar — never numeric IDs, dates, or tag/status columns)**: each such column header carries, inline next to its existing sort-direction arrow, a small "Aa" trigger — no extra table column, ever, regardless of how many real fields the table has. Clicking "Aa" opens a small dropdown scoped to that one column: Title Case (default) / UPPERCASE / lowercase, plus a last row "Apply to all fields" that sets every case-toggleable column in that table at once. Pure frontend display transform — never mutates stored data, never fires an API call, never affects any export/import format. Worked example: `student/manage-students.md`'s "Per-column text-case + sort" section — every other module's list table (Staff, etc.) follows the same pattern for its own name-type columns when that module is built, rather than restating it per module.

## Constants
Control height 38px everywhere (search, pills, buttons, month-nav). Radius 6px (pills 20px, circular avatars 50%). Gap in layout-row/col-side: 16px.

## Responsive — plain CSS, width-based tiers, additive only

No Bootstrap grid, no separate framework — just plain `@media (max-width: …)` rules layered on top of the desktop CSS above. **Additive only**: a rule only ever applies below its own breakpoint — nothing above it changes, so nothing already built shifts. Keyed off **width only** — a landscape phone and a small tablet at the same width behave the same, so orientation isn't tracked separately; it falls out of width automatically (a phone rotated to landscape simply reports a wider viewport and lands in the next tier up).

**Industry-standard breakpoints** — the same scale Bootstrap/Material/Tailwind all converge around (this is what real production frontends actually ship, not an exhaustive device-portrait/landscape catalog):

| Breakpoint | Width | Roughly matches |
|---|---|---|
| `sm` | ≥576px | Large phone / phone landscape |
| `md` | ≥768px | Tablet portrait |
| `lg` | ≥992px | Tablet landscape / small laptop |
| `xl` | ≥1200px | Desktop |
| `xxl` | ≥1400px | Large desktop / wide monitor |

In practice only **3 `@media` rules** are needed — several of the above share identical behavior in this design, so they collapse onto the same breakpoint:

```css
@media (max-width: 767px)  { /* below md — phones, portrait and landscape */ }
@media (max-width: 991px)  { /* below lg — phones + tablet portrait */ }
@media (min-width: 1400px) { /* xxl — large desktop / wide monitor only */ }
```

**Sidebar** — persistent 248px from **992px** up (`lg` and above), off-canvas drawer + hamburger below 992px. `app-shell.md` is updated to reference 992px (supersedes the earlier 860px, and the 1024px used briefly before settling on this standard scale).

**The same handful of shared patterns, mapped onto these breakpoints:**
- **Toolbar row** (search + filter pills + primary button): single row from 992px up. Wraps (`flex-wrap`) below 992px. Below 768px, filter pills go full-width stacked one-per-line, search full-width, primary button stays visible at top.
- **Tables**: horizontal scroll (`overflow-x: auto`, columns keep their normal width, never compress) below 992px.
- **`.layout-row` (main + side column)**: stacks vertically (`.col-side` moves below `.sw-card-main`, both full width) below 992px; side-by-side from 992px up.
- **Modals**: full-width (`calc(100% - 32px)`) below 768px; fixed pixel width above that.
- **Content max-width** (`xxl` only): cap the main content area at ~1700px at 1400px and above, so text/table rows don't stretch into unreadably long lines — the extra width becomes wider side margins, nothing else changes.
- **Constants**: control height stays 38px at every breakpoint (never shrink tap targets). Page padding/gaps can step down from 16px to 12px below 768px if a page feels cramped — optional per page, not a hard rule.

That's the whole responsive spec — the standard 5-tier scale for reference, 3 real breakpoints in code, 6 patterns. If a future page needs something this doesn't cover, extend this section — don't invent a one-off rule buried in that page's own file.

## Form validation state — every input, one pattern

Matches `_core/error-catalog-conventions.md`'s shapes #1/#3/#7 (field,
cross-field, and per-row bulk errors) — this is the ONE visual/markup
pattern every form in the app uses to show them, never a per-page
invention.

**Markup**: each field is wrapped `.field { }` containing the
label, the input/`.dd`, and an `.field-error` span directly beneath it
(empty and `display:none` when valid). On error: the input/`.dd`
trigger gets `.is-invalid` (`border-color:var(--danger)`, no red glow/
box-shadow — matches the flat, hairline aesthetic, never a heavy
Bootstrap-style focus ring), and `.field-error` shows the message in
`var(--danger)`, small text, with a small `bi bi-exclamation-circle`
icon inline before it — never just colored text with no icon, and
never a tooltip-only error (must be visible without hovering).

**Trigger timing** — never on every keystroke from the start, never
only on submit:
1. A field shows its error the first time it's blurred (`touched`)
   while invalid.
2. Once touched, it re-validates live on every change (so fixing it
   clears the error immediately — this is the payoff of not waiting
   for submit).
3. Submitting the form marks every field touched at once, so a field
   the person never visited (e.g. skipped a required dropdown) still
   surfaces its error on submit attempt.
4. A server-side error that traces to a field (backend `fields[]`,
   shape #1/#3 — e.g. a duplicate Admission No. only the backend can
   know) is rendered through the exact same `.field-error` slot as a
   client-side one, marking that field touched+invalid on response —
   never a separate toast for something that already has a field to
   point at.

**Submit button**: stays enabled even with known client-side errors
present (per the legacy `isClick`-guard convention, clicking submits
and triggers rule 3 above rather than a silently-disabled button the
person can't figure out why is greyed out) — the one exception is
while a submit request is already in flight (double-submit guard,
disable + spinner until the response lands).

**Bulk/import result panel** (shape #7): not a form, so not the
`.field-error` pattern — a dedicated results list, one row per failed
record, each showing its row number and its own field-level messages
nested underneath (reusing `.field-error`'s icon+color for each nested
line). Rows that succeeded are summarized as a count, not listed
individually.

## Never do
Warm/tan borders. Filled chips. Heavy box-shadow "SaaS card" look. Mixed icon systems. Native selects. Unconfirmed destructive actions. Wrapping dropdown labels. Inventing version labels (v1/v2) for this design — there is only one. Introducing Bootstrap's CSS framework (grid/utility classes) alongside this custom system — Bootstrap here is icons only, per the top of this file. A validation error shown only as a toast/alert with no field indicator. A field silently going invalid-on-every-keystroke before it's ever been touched. A disabled submit button as the only feedback for why a form won't go through. A native `<input type="date">` anywhere — use `.dp`. A default-appearance browser checkbox anywhere — use the shared checkbox style. Forcing every button on a toolbar to one shared fixed width regardless of label length.
