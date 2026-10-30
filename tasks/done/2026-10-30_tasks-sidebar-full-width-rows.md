# Full-width sidebar rows

Completed 2026-10-30: full-width desktop hover/selection with consistent content insets and a separate age lane.

## Goal

Apply hover/selection across the desktop sidebar entry and truncate title/preview before a separate, right-aligned age column.

## Tasks

- [x] Extend the row surface across the sidebar while retaining aligned content insets and the horizontal footer.
- [x] Give both title and preview the same text column, separated from the age.
- [x] Verify resting/hover/focus geometry at minimum/default/wide sidebar widths and preserve narrow/touch navigation.
- [x] Document results, archive and commit the scoped fix.

## Scope

Follow-up to `3d7eb52`; preserve unrelated board follow-up work. No delegation, push or release.

## Verification

Tested `3d7eb52` plus this scoped follow-up:

- `npm run build` passed.
- `scripts/sidebar-layout-smoke.mjs` passed: desktop rows reach both sidebar edges; title/preview share equal text bounds; age clearance is at least 12px with a 24px right inset. Includes actual outer-edge hover activation, selected/hover/focus surfaces, preserved footer alignment, narrow/touch layout and Settings utilities.
- Covered 224/280/480px sidebars, short desktop windows, 390/320px viewports, both color schemes, and hover/focus across all four palettes.
- The existing sidebar smoke caught the full-width rows covering the resize handle. Raised the handle above the row surface; `scripts/sidebar-smoke.mjs` then passed, including keyboard/pointer resizing, pins, rename/reload, cross-tab state, failed-save guards, themes and narrow layout.
- Visually inspected resting and hovered Ocean dark screenshots at 280px under `/tmp/jumpybrain-sidebar-layout-qa`.

## Limits

Rendered checks use Chromium and the production companion/native update UI, not the full Electron end-to-end suite. Row actions retain their existing hover/focus behavior; they replace the age while shown. Long text retains tooltips. No canonical note or navigation-policy changes.
