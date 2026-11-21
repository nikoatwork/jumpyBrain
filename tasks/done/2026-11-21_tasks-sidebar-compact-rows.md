# Sidebar: compact rows, last-editor marks and quiet sections

Requested 2026-11-21 after comparing the sidebar with T3 Code: section headers (Drawings, Settled) looked like page rows, settled entries were as heavy as active ones, and Drawings had no count. Three active-row options were mocked in the real shell; the user chose option C (dense single line with time groups) with exactly two last-editor icons (agent, person) instead of folder badges.

## Outcome

- [x] Attention rows carry `editor`, the declared last editor, only while `last_editor_hash` matches the content digest (reuses the stat-keyed settled-revision cache). Untracked edits make it unknown.
- [x] Active sidebar rows are one line: agent/person mark, title, age. Unknown editors leave the slot empty. Preview text moves into the link tooltip.
- [x] Faint Pinned / Today / This week / Earlier captions, computed from the attention sort key; decorative CSS captions on each group's first row (row ages carry the same facts for assistive tech); hidden on narrow chip lists.
- [x] Settled and Drawings use one quiet 32px section header with count and chevron. Settled rows are faint single lines with dimmed marks.
- [x] Drawings header shows the drawing count (listing loads once per connected scope, never the canvas) and an icon-only New drawing (+); the old New drawing row is gone. Drawing rows align with page rows.
- [x] Settle exit animation can collapse one-line rows (`min-height: 0` while settling).
- [x] Docs: design system, browser, app, memory format.

## Verification (working tree on 7f1adc98)

- `npm run build`, then `node --test test/attention-cli.test.js test/architecture-boundaries.test.js test/note-attention.test.js test/browser-page-navigation.test.js test/drawings.test.js`: 58/58 pass. New cases: verified/invalidated/replaced editor in the attention packet; local-day time groups (including a DST-safe date); editor labels.
- Chromium smokes via `npx --package=playwright node scripts/<name>.mjs`:
  - `sidebar-layout-smoke`, `sidebar-settle-smoke`, `sidebar-smoke`: pass (layout assertions updated for the 32px header and one-line rows; `sidebar-smoke` checks list scrolling at 480px height because the fixture now fits at 850px).
  - `collaborative-sidebar-smoke`: new editor-mark assertions pass (agent/person/unknown, raw edit drops the mark, supported write replaces it, browser save marks person). It then times out at the existing 390px screenshot loop; unchanged `master` fails at the same step.
  - `drawings-smoke`: header, count-free proof, create/disabled/reader checks pass; ends on the same "Permissions policy violation: unload" page errors as unchanged `master`.
  - `sidebar-requests-smoke`: fails `open.documentGets` 2 vs 1 identically on unchanged `master`.
- Visual check of the companion shell at 1100px dark/light, hover, collapsed drawings count, and 390px narrow.

## Limits

- The editor mark is declared provenance, not identity. Rows only show it for revision-checked declarations; files edited outside supported writers show no mark.
- Group captions are hidden from assistive tech by design (`content: … / ""`); older engines without the alt-text syntax may announce them.
- The three pre-existing smoke failures above are unrelated and still open.
