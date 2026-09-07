The App Shell (/v2 route) and /v2/components-gallery were just built, but a visual review against the reference files found two problems. Fix both before this task is done.

## Problem 1 — the shell's visual design does not match docs/schoolzen-planning/v1/_core/shell/app-shell.html at all

Right now it renders as generic Angular Material: plain outline icons, no shadows, no rounded cards, no purple gradient, sub-items shown with a plain bullet character instead of a dot icon. This needs to match that reference file pixel-for-pixel, specifically:

1. **Icons**: app-shell.html uses Tabler Icons throughout (`<i class="ti ti-home">`, `<i class="ti ti-school">`, etc., loaded via the Tabler Icons webfont CDN link in that file's `<head>`) — not Angular Material icons (`<mat-icon>`). Replace every sidebar/header icon with the matching Tabler class from the reference file.

2. **Sidebar card**: white background, `border-radius: 18px`, `box-shadow: 0 2px 8px rgba(20,20,60,0.05)`, `width: 224px`, padding `14px 8px` — copy the exact `.sb-wrap` rule from app-shell.html's `<style>` block, do not approximate it.

3. **Active item**: the currently-open group's parent item gets `background: linear-gradient(135deg,#7b6ef6,#5b4fd6)`, white text, `box-shadow: 0 3px 10px rgba(123,110,246,0.3)` — copy `.sb-item.parent-active` exactly.

4. **Sub-items**: use a small dot icon (`<i class="ti ti-point">`), not a bullet character (`•` or `<li>` markers) — copy `.sb-sub-item` and its dot styling exactly.

5. **Accordion behavior**: one group open at a time (opening one closes any other), matching the `toggleGroup()` JS function and `.sb-group.open` CSS in the reference.

6. Also check the header against the reference: brand mark (gradient square logo), session selector pill, notification bell with badge, profile dropdown — all styled per app-shell.html's `.sw-header` rules, not left as Material defaults.

Read the ENTIRE `<style>` block in docs/schoolzen-planning/v1/_core/shell/app-shell.html and port it faithfully into the actual Angular component's stylesheet — do not hand-reinterpret the design from a description, copy the real CSS values (colors, radii, shadows, spacing) verbatim.

## Problem 2 — /v2/components-gallery is a placeholder, not an actual gallery

It currently shows filler text ("This page is listed in the sidebar so the navigation..."). Build the real gallery: render each of the 8 shared components (app-page-shell, app-data-toolbar, app-status-chip, app-confirm-modal, app-data-table, app-summary-strip, app-row-avatar, app-icon-action, app-back-link) with 2–3 example states side by side (e.g. app-status-chip shown in its Active/Inactive/Pending color variants; app-data-table shown with a few sample rows; app-confirm-modal with a button that opens it). This is what lets every later module's pages be visually verified against a working component before they're built.

## Before finishing

Describe exactly what you changed (files touched, CSS rules replaced) and confirm both the shell and the gallery page now visually match their reference files — a screenshot or a clear before/after description of the sidebar and one gallery component is enough.
