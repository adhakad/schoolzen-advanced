Every dropdown and date filter across the shell/gallery is rendering as a native, unstyled browser `<select>`/date input — no custom styling is being applied at all. Fix this properly.

## Use Angular Material, not Bootstrap

This project already has Angular Material installed and configured — `app.module.ts` already provides `MAT_DATE_LOCALE` and `MAT_DATETIME_FORMATS`, and `mat-menu-panel` styling already exists in the legacy header CSS. Do NOT introduce Bootstrap or any other new UI framework — that would mean two component libraries doing the same job in one app. Use what's already a dependency:

- **Dropdowns/filters** → `mat-select` + `mat-option` (wrap in `mat-form-field` with `appearance="outline"` or a custom minimal appearance, whichever renders closest to the reference's pill shape with the least fighting against Material's default chrome).
- **Date filters** → `mat-datepicker` + `mat-datepicker-toggle`, wired to the existing `MAT_DATE_LOCALE`/`MAT_DATETIME_FORMATS` providers already in app.module.ts — do not add a second date-picker library.

## Then re-theme them to match the design system — do not ship Material's default look

Angular Material's out-of-the-box appearance (Indigo/Pink theme, boxy outlined fields, blue focus ring) does not match this app's design system at all. Every dropdown/date-filter needs to visually match the `.sw-select-pill` shape already defined in the reference files (docs/schoolzen-planning/v1/_core/shell/app-shell.html and any module page, e.g. docs/schoolzen-planning/v1/fees/fees.html): a light background (#f6f5ff), fully rounded pill (border-radius: 12px per the toolbar pills, or 999px for the header's session-selector pill), no visible border/outline, a small chevron-down icon, ~12.5px font, and purple (#7b6ef6) used only as the icon/accent color, not a full-saturation Material button.

Do this via Angular Material's theming API (a custom lightweight theme, or targeted `::ng-deep` / `:host ::ng-deep` overrides scoped to the shared filter/date components specifically — not a global override that could bleed into the legacy admin pages' own existing Material usage, since those must keep rendering exactly as they do today).

## Scope

Apply this to every filter dropdown and date picker currently rendering unstyled — the header's session selector, any Class/Stream/Status filter pills shown so far, and any date-range or month picker. If a shared `<app-data-toolbar>` or similar component already wraps these, fix it once there rather than per-instance.

## Also fix: search box width is inconsistent across toolbars

The search input next to these filters is currently using unconstrained `flex: 1`, so it stretches very wide on a toolbar with no/few filter pills and looks cramped on one with several. Give it a stable, bounded width instead: `min-width: 220px` and `max-width: 340px`, still `flex: 1` so it fills genuinely empty space on a sparse toolbar, but capped so it never balloons regardless of how few filter pills are present. This should be one shared rule (wherever `.sw-search` or the toolbar component's search input style lives), not a per-page override.

## Before finishing

List every component file you changed, and confirm none of the legacy admin pages' existing Material styling (their own mat-select, mat-datepicker, or mat-menu usage outside of `/v2`) was affected by whatever theming approach you chose.
