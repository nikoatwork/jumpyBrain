# Sidebar copy hierarchy

## Goal

Make sidebar titles clearer, previews subtler and elapsed ages compact (`1d`, `2h`, `5m`).

## Work

- [x] Use full-ink semibold titles and muted caption previews/ages through existing theme tokens.
- [x] Remove “ago” for every sidebar duration, including due durations; preserve future/due meaning and exact tooltips.
- [x] Verify existing age tests and production sidebar layout.
- [x] Archive for the scoped completion commit, preserving concurrent page-action styling.

## Outcome and verification

Completed 2026-10-29: full-ink semibold titles, muted caption previews and ages, and compact minute/hour/day labels without “ago”. Exact-date tooltips and future/due semantics remain intact.

- `npm run build` passed; editor bundle 189,336 bytes gzip, within the 190 KB gate.
- Existing navigation/sidebar/bundle tests: **16 passed**.
- Production `scripts/sidebar-smoke.mjs`: passed, including compact edit/due labels, persistent pins, guarded navigation, stable row DOM and narrow geometry.
- Inspected light/dark captures under `/tmp/jumpybrain-sidebar-hierarchy-qa`; browser verification uses disposable Markdown.
- Tested shared working snapshot based on `4de1bc7`; concurrent page-action styling is excluded from this commit. No installed app or release changed.
