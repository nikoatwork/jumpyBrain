# Page actions and hover geometry

Completed 2026-10-29: a quiet, right-aligned page card, integrated board action and shared hover geometry fixes. Mistral review incorporated; browser/layout checks pass with the native-smoke limit recorded below.

## Goal

Tuck note actions against the right edge, integrate Add to board, and fix asymmetric hover surfaces through shared control styling.

## Tasks

- [x] Inspect screenshots, layout, shared styles and prior conventions; bounded local recall found no relevant memory.
- [x] Implement quiet right-aligned actions and shared hover/geometry corrections.
- [x] Assess requested Mistral Large 4 review and address warranted findings.
- [x] Verify desktop/narrow, light/dark, hover/focus and existing workspace/board behavior.
- [x] Record results and limits, update docs/release notes, archive and commit only scoped changes.

## Scope

Shared hosted/Mac browser presentation; no install, push or release. Preserve existing collaborative-sidebar work, including overlapping files. No canonical memory or action behavior changes.

## Findings

- Saved version puts its divider inside a square button with top-only padding; its inherited hover paints the whole asymmetric box.
- The generic quiet-button hover omits `.icon-button`, so workspace Back/Forward can acquire unwanted fills.
- Board title controls use zero padding; transparent board controls inherit the filled hover ramp.

## Review and decisions

- Mistral Large 4 reviewed source and both supplied screenshots using OCR/pixel geometry. Accepted its grid percentage-width finding: explicitly fill the 224px desktop track so the base responsive width cannot shrink it to 192px. Accepted symmetric header insets, action-group spacing and larger board controls.
- Kept semibold board-column labels: these rename controls also serve as column headings. No changes from speculative search/graph hover observations without a reproduced geometry defect.
- Production screenshot inspection additionally found board navigation inheriting a three-column note-row grid. Board names now stay on one line with ellipsis and use a single parent hover surface, without nested button fills.
- Added reusable transparent-button hover tokens and action-row geometry; divider belongs to the facts wrapper. Preserved icon resting backgrounds, keyboard focus, touch sizes, existing selection states and all action behavior.
- Removed the redundant Saved version aria-label while keeping its visible accessible name, avoiding an unnecessary tooltip triggered by the new decorative SVG chevron.
- Concurrent collaborative-sidebar changes were committed separately as 4de1bc7 and 3d8b3b0 during this task. They remain intact; this task stages only its own changes. The unrelated board-creation follow-up task remains untouched.

## Verification

- Production build passes: 189,339-byte gzip editor bundle, no dependency changes. 113 focused browser/workspace/theme/sidebar/companion tests pass.
- All-theme smoke passes: four palettes × light/dark × 1280/390/320px, covering note/Home/search/Feedback/map, theme persistence, draft/caret and contrast surfaces. Log: `/tmp/jumpybrain-page-actions-theme.log`.
- Workspace smoke passes: real create/format/reference/Back/search/save-failure/retry/copy/read-only flows and expanded facts. Added rendered geometry/hover/focus assertions at 1820/1280/1180/900/390/320px in both schemes. Final log: `/tmp/jumpybrain-page-actions-workspace-isolated-rerun.log`.
- Board smoke passes: note-to-board chooser, selected column, conflict retry, duplicates, archived filtering, unchanged Markdown/unsaved draft, keyboard focus return, board creation/movement/settlement/restore, matching hover rows and collapsed navigation. Also checks single-line navigation and touch-sized board actions. Log: `/tmp/jumpybrain-page-actions-boards-isolated.log`.
- Visually inspected wide Ocean dark, collapsed Ocean dark, narrow Ocean light and expanded Ember light screenshots. Captures: `/tmp/jumpybrain-boards-qa/page-actions-*.png` and `/tmp/jumpybrain-page-actions-qa/workspace-*.png`.
- Initial shared-checkout workspace rerun failed because another build removed `dist/adapters/collections/store.js`. Final verification used an isolated source snapshot at `/var/folders/wg/nj9x33kx7q984kv_sb31z5hr0000gn/T/jumpybrain-page-actions-check-x6guci2l`, based on `543ba599f6951ab33df0f8652a401087fc6ae8a2` plus this task's implementation/harness and the pre-existing sidebar markup repair. An isolated concurrent run hit a caret-placement failure in the existing first-note flow; its serialized rerun passed unchanged. These failures are not hidden by the passing rerun.
- Full Electron smoke was attempted but stops at `integrations/electron/smoke-app.mjs:111`, which expects an edited/unpinned starter note to disappear from the DOM. The recent collaborative attention behavior can retain it. No claim of a full native-smoke pass; log: `/tmp/jumpybrain-page-actions-electron.log`. The optional native suite is a recorded limitation, not a CSS regression established by this run.
- Physical assistive technology, non-Chromium browsers and custom extension themes were not exercised. No install, release, push or personal brain changes.
- Scope excludes other tasks' feedback/CLI changes and the pre-existing sidebar DOM repair; those working-tree edits remain untouched. Only this task's source, checks, docs and archive are committed.
