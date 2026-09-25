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

## Buttons
Primary: `background:var(--ink);color:#fff`. Any consequential action (sync, delete) opens a confirm modal first — never fires on click. Destructive deletes require typing `DELETE` before the confirm button enables.

## Cards / tables
Hairline border only (`1px solid var(--line)`), `border-radius:6px`, no box-shadow. Sticky leading columns via `position:sticky` with cumulative left offsets. Status chips: outline only, all chips in a set the same fixed width, never filled/solid.

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

## Never do
Warm/tan borders. Filled chips. Heavy box-shadow "SaaS card" look. Mixed icon systems. Native selects. Unconfirmed destructive actions. Wrapping dropdown labels. Inventing version labels (v1/v2) for this design — there is only one. Introducing Bootstrap's CSS framework (grid/utility classes) alongside this custom system — Bootstrap here is icons only, per the top of this file.
