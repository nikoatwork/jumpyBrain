# Sidebar age integration review

## Scope

Review `708eadb` against current `master` (`d612b20` at review start). Preserve the newer compact labels from `3d8b3b0`, full-width row styling, separate age lane and unrelated board work. The original commit is already an ancestor of master; no replay or merge is needed.

## Tasks

- [x] Verify original integration and inspect subsequent sidebar changes.
- [x] Review attention provenance, date formatting and both row render paths.
- [x] Fix false due labels when preview and attention snapshots have different edit times.
- [x] Verify regression coverage, build, targeted suites and integrated sidebar smokes.
- [x] Record findings and limits and archive for the scoped completion commit.

## Finding

The renderer merges independently fetched preview metadata over the attention packet before comparing `attentionAt` with edit recency. A newer or older preview timestamp makes ordinary recency appear to be an explicit snooze. Reproduced on the initial build: a normal note changes from `3d` / `Last edited …` to `due 3d` / `Due …` after merging a newer preview. Determine due provenance within the original attention snapshot, while displaying the preview's edit age for ordinary notes.

## Verification

- Tested 2026-10-30 on `d612b20698d36937938396e2183f0a8bdf38c563` plus this fix and the existing uncommitted board/companion changes. Those unrelated changes remain outside this commit.
- Initial build and original targeted suites: 35 passed. Both new unit regressions failed against the pre-fix build. The production sidebar regression also failed before the fix (`due 4d` instead of `3d`).
- Final `npm run build`: passed, editor bundle 189,376 bytes gzip (below the 190 KB gate).
- `node --test` for browser-page-navigation, browser-sidebar, note-attention-browser, note-attention, search-recognition, notes-browser, companion-browser, lexical-bundle, architecture-boundaries and package-entrypoints: **153 passed, 0 failed**.
- `scripts/sidebar-smoke.mjs`: passed, including mismatched preview/list revisions, compact due/edit labels, persistence, stable DOM, save guards and narrow layout.
- `scripts/sidebar-layout-smoke.mjs`: passed with existing board follow-up edits, companion shell and native update renderer; 12 layouts and 8 palette/scheme combinations, full-width rows, separate age lane, footer alignment, hover/focus and Settings.
- `scripts/collaborative-sidebar-smoke.mjs`: passed, including periodic create/edit refresh, settlement wake, caret/focus and six layouts.
- `scripts/note-attention-smoke.mjs`: passed, including snooze deadlines, exact metadata/body/caret, independent pins, focus recovery, failed-save recovery and desktop/390/320 layouts.
- Browser suites run using `npx --yes --package=playwright node <script>` and disposable Markdown. Inspected generated light desktop and dark narrow layout captures. `git diff --check` passed.

## Outcome and limits

No merge/cherry-pick is necessary: `git merge-base --is-ancestor 708eadb master` passed. Preserve compact labels from `3d8b3b0` and layout from `d612b20`. The only implementation correction separates attention provenance from preview edit timestamps and shares the resulting label between row creation and refresh. Unit coverage includes both newer/older preview revisions, creation-only recency and a real due time matching the preview edit time.

No additional blocking issue found within the reviewed sidebar-age scope. The protocol still infers explicit due overrides from unequal attention/edit timestamps; an explicit override exactly matching the attention packet's own recency is indistinguishable, as before. The installed Mac application was not rebuilt or installed; the complete repository suite and native packaged-app smoke were not run. No push or release. Unrelated board work remains in progress. Thread settlement follows the scoped commit as part of this integration handoff.
