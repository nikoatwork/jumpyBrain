# Theme visual review

## Goal

Review all six built-in palette/scheme combinations for a clean, consistent appearance across Home, notes, search, graph and Settings, including desktop and narrow layouts. Fix visual defects found and retain repeatable checks.

## Tasks

- [x] Expand theme verification across Ember/Ocean/Grove light/dark and representative app surfaces.
- [x] Inspect screenshots, check contrast/focus/overflow, and fix any visual defects.
- [x] Record results and limits, archive and commit the scoped verification/improvements.

## Findings

Completed 2026-10-28.

- All six combinations look cohesive: warm parchment/graphite Ember, cool blue Ocean, and soft green Grove. Shared spacing, typography, code/table surfaces, hover/selected rows and focus accents stay consistent.
- No theme-specific clipping, mismatched backgrounds or unreadable text was found. Palette/UI colors remain unchanged.
- The prior theme smoke verified full surfaces primarily for Ember. It now checks actual surfaces for every palette, uses representative linked/formatted notes, and captures populated search and Feedback as well as Home, writing and graph.

## Verification

Tested snapshot: parent `2caefcc` plus this verification-only script/doc change.

- Expanded theme smoke: 3 palettes × 2 schemes × 3 widths × 5 app surfaces = 90 screenshots and automated surface/identity/focus/overflow/dialog-bounds checks. OS/manual/reload/cross-tab/blocked-storage and draft/caret/editor-preservation checks cover each palette.
- Companion browser smoke passed, including all Appearance combinations at those widths (18 additional palette/scheme/width combinations) and existing save/switch/recovery behavior.
- Theme unit/contrast suite: 7 passed. Primary, secondary, faint and error text meet 4.5:1 against surface, control and hover fills; focus meets 3:1 against the surface.
- Visually inspected comparison sheets for all six palettes across Home, formatted notes, search, map, Feedback and Appearance, including narrow layouts. Screenshots remain disposable in `/tmp/jumpybrain-theme-review` and `/tmp/jumpybrain-theme-review-settings`.
- Previewed an interactive screenshot gallery for the user.
- Final smoke with explicit screenshot palette/scheme identity assertions: passed, zero page errors.
- `git diff --check`: passed.

## Limits

- Browser verification uses Chromium and disposable roots; populated search is intercepted fixture data, not live QMD retrieval. Missing-index/search-recovery notices on relevant screenshots are expected because this fixture builds no index. Feedback was opened but never sent.
- No physical macOS fullscreen, Safari/Firefox or installed-app test. No installation/release or personal memory changes.
- No runtime implementation changes; the full unit suite was not repeated for this script/documentation-only review.
