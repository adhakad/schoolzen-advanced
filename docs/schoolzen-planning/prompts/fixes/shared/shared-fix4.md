# shared-fix4 — one toolbar (Rule 21) + one loading skeleton (Rule 22) on EVERY page

Applies to: ALL modules, ALL pages. Rule 21 = pages with a search box and/or buttons above the table. Rule 22 = every page that loads data.
Reference: approved preview `toolbar-preview.html` (v5). Where an old reference html differs, THIS file wins.

## Step 0 — register the rule (do first)
1. `prompts/fixes/global-fixes.md`: add Rules 21 and 22 (text below), add R21 and R22 columns to the Status table, add "R21 toolbar, R22 skeleton" to step 1 of "Global sweep run order".
2. `v1/_core/design-system.md`: add one line: "Toolbar = search + Actions menu + primary button (Rule 21)".

## Rule 21 — Toolbar
1. Order in one row (desktop): search, then Actions button, then primary button last (rightmost). Filters are in the rows below (Rule 14 grid).
2. Search: one size everywhere, flex, min 200px, max 280px, height 38px.
3. Primary button = the black "Add ..."/main create button. Height 38px, width by text, min 130px, max 180px, text ellipsis + full text in tooltip.
4. Every non-primary button goes inside ONE button named exactly "Actions" (with chevron). No "Bulk Actions", no loose secondary buttons. Actions sits right after the search box, left of the primary button. If there is no primary, Actions is the last item on the right.
5. Actions menu items: use bulk naming (Bulk Print, Bulk Enter Marks, Bulk Generate, Bulk Assign, Bulk Delete, Import, Export ...). No "Print Selected (n)", "Generate for Selected", "Assign to Selected", "Delete Selected". Show a count only inside the item if rows are ticked, e.g. "Bulk Delete (3)".
6. Each item declares `needs`: `[]` always enabled, `['sel']` needs ticked rows, `['Class','sel']` needs a filter value + rows. Unmet item stays visible but disabled; its right side shows the reason ("select rows", "choose a class"); tooltip starts with the reason. Enabled/disabled recomputes live when rows are ticked or filters change.
7. Danger item (Delete) is red and separated by a line at the bottom. Menu hint line: "Some actions unlock when you tick rows or choose a filter".
8. If a page has only one non-primary button it still goes in Actions.
9. Menu: opens under the button, `width:max-content`, never wider than the card (`max-width: card - 36px`), closes on outside click/Esc, keyboard usable.
10. Mobile (card width <= 640px):
   - Row 1: search alone, full width. NO button in the search row.
   - Row 2: Actions (left) + primary (right), two equal columns. If only one of them exists, it sits on the right at its normal width (min 110px).
   - If neither exists: search only, then filters.
   - If only a primary exists and no search: primary alone on the right.
   - Menu opens left-aligned, stays inside the card.
11. Filter grid (Rule 14) by card width: 6 per row, 4 per row for 641–819px, 2 per row at <= 640px. Month filter is the last cell.
12. No horizontal overflow at 390px, no clipped text; long text ellipsis + tooltip with the full text.

## Rule 22 — Loading skeleton
1. Where: every page, on the table, cards, dashboard tiles and the data of filters. On first load and when a filter or month changes.
2. Shape = real shape: tables use the real column widths and 8-10 skeleton rows; cards use the card size; avatars are round. No layout jump when data arrives.
3. One shared skeleton component, theme colour (light grey-purple), shimmer 1.2s. No per-page skeleton CSS.
4. Search, Actions, primary button and filter boxes are shown at once and stay enabled; only their data is skeleton.
5. Spinner only inside a button during save/delete/bulk action. No spinner or blur on the page or table.
6. No flicker: if data arrives in under 150ms show no skeleton. After 10s show an error with "Retry".
7. Empty data after load shows "No records", never a stuck skeleton.
8. Mobile 390px: no overflow; wide tables keep the same skeleton shape.
9. Do: build the component once, replace every page's old blur/spinner/loading text with it, remove old loading CSS. Add an R22 note per page in the audit table.
10. Test (Playwright): slow the API; skeleton shows, goes away after load, no layout shift; one page per module.

## Rule 21b — Match the preview exactly, per screen size (found on the Manage Students screenshots)
Mismatches seen in the app: no full-width divider; Actions has no three-dots icon; skeleton is blurred bars only; mobile search too short; sizes not in the preview ratio.
Reference numbers (from `toolbar-preview.html`, keep these ratios at every screen size):
1. Divider: a 1px line `--line-soft` between the toolbar row(s) and the filter grid, running edge to edge of the card (negative margin = card padding: -16px desktop, -12px mobile), 14px space above and below (10px mobile). Hidden if the page has no toolbar.
2. Actions button: icon order = three-dots icon (3 circles r=1.4, 15px) + text "Actions" + chevron (13px, rotates 180deg when open). Width 130px, height 38px, 12.5px/600 text, gap 7px. Open state: brand border + brand-soft background.
3. Primary: height 38px, min 130px, max 180px, black, plus icon + text.
4. Search: height 38px, left icon, 13.5px text, flex 1 1 200px, max 280px, gap to buttons 12px (row gap 8px).
5. Filters: height 38px, 12.5px text, 8px gap, radius same as buttons. Columns by card width: >=820px 6 columns; 641-819px 4 columns; <=640px 2 columns. All columns equal; month filter last cell.
6. Mobile (<=640px): search full width and 44px high (preview 38px is raised; icon/text 14px), Actions+primary row below it in 2 equal columns at 44px high, 8px gaps, filters stay 38px, space below buttons 8px. Single button = right aligned, min 110px.
7. Small phones (<=320px card): same as mobile, no horizontal scroll, text ellipsis + tooltip.
8. Never let the buttons share the search row on mobile.

## Rule 22b — Skeleton must look like the preview (found in the app: only blurred bars)
1. No blur filter and no linear bar loader on the table. Remove them.
2. Skeleton row = checkbox placeholder + round avatar 26px (brand-soft) + two text bars (first 46% wide, 7px high, radius 4, colours #DDD6EC then #ECE8F4) + a status pill 46x16 radius 9 (#E8F3EC) on the right; rows 10px padding, 1px `--line-soft` between rows, 8-10 rows. On desktop add bars per real column at real widths.
3. Shimmer 1.2s moves across the bars; header row and filters stay real and visible.
4. Same component on every page; mobile uses the same row shape.

## Do
1. Build/repair ONE shared toolbar component (search + actions menu + primary + needs logic). Do not copy it per page.
2. Replace the toolbar of every page in every module with it. Convert existing secondary buttons into Actions items with the right `needs`. Remove old per-page toolbar CSS.
3. Approvals: add Stream Group filter (pending from shared-fix3).
4. Test data: add fixtures for Structure, Marksheet Structure, Subject Groups, Leave Assign so their toolbars and filters can be tested.
5. Backend: actions that change data keep their Roles & Permissions key and activity log. UI disabling is not security.
6. Fill the audit table below, one row per page.

## Tests (essential only, Playwright; Rule 22 tests are in Rule 22 point 10)
- 390 / 1366 / 1920 widths: search and buttons sizes equal on all pages (measure), no overflow.
- Mobile: search row has no button; Actions and primary are equal width in one row.
- Actions: item disabled with no rows; enabled after ticking rows; filter-dependent item enabled only after choosing the filter.
- One page per module opens the menu and it stays inside the card.

## Notes
- Reference html files still show the old toolbar. Rule 21 wins; update html only if the owner sends them.
- Open choices (default used): single secondary button goes in Actions; Import/Export always enabled; 4 filters per row at 641–819px; search max 280px (replaces 340px in shared-fix3).

## Audit table (Claude Code fills)
| Module | Page | Search size ok | Actions menu | Primary | Mobile ok | Skeleton (R22) | Notes |
|---|---|---|---|---|---|---|---|
