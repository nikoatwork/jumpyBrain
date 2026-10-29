# Subtle hover and button layout

Completed 2026-10-29: softened theme-aware hover feedback, made icon-only hover glyph-focused, and corrected compact target sizing/centering.

## Goal

Soften hover feedback in every built-in light/dark theme. Icon-only actions change glyph color without a hover background, while selected states and keyboard focus remain clear. Review compact controls for clipping and centering.

## Tasks

- [x] Review shared browser/Mac styles and relevant project conventions.
- [x] Apply theme-derived hover treatments and correct compact control geometry.
- [x] Verify production rendering across palettes, desktop/narrow layouts and native Mac shell; record limits.
- [x] Update design guidance and release notes and archive this task; commit with the scoped implementation.

## Scope

Shared browser UI used by the Mac app; keep existing selected/status treatments. Preserve unrelated sidebar work already in progress. No installation, push or release.

## Implementation

- Theme-derived faint row wash and filled-control/border hover ramps; preserve selected, expanded, focus and native readiness states.
- Icon controls change glyph color without background/border hover. Include navigation, theme, graph, note actions, boards, Settings and native-injected updates.
- Nonshrinking centered SVGs; remove cramped sidebar/theme/find padding, make find arrows square, correct Snooze close height, and give Add connection the shared narrow-screen target.
- The concurrent sidebar task committed the first `notes-browser.ts` hover edits in `0a29656` while this work was running. They remain intact; this task's commit contains the remaining implementation and refinements. No unrelated work was reverted or staged.

## Verification and limits

- Build and 42 targeted browser/theme/sidebar/attention/workspace tests passed.
- All-theme smoke passed: Ember/Ocean/Mono/Pride × light/dark × 1280/390/320px, covering Home, notes, search, Feedback, graph and theme/draft persistence.
- Production sandboxed Electron smoke passed, including native 1200/480px layouts, Settings, boards, Find, editing/save and close guards.
- Board, dropdown and note-find smoke passed.
- Companion smoke passed its appearance/Settings layout section but failed at `scripts/companion-browser-smoke.mjs:513` (document-request count 47 vs 46). An isolated rerun and a separately built clean archive of baseline `0a2965651180a619b698e79655a1c5bde68e6120` reproduced the identical failure. This pre-existing request-count failure is not claimed fixed; see `/tmp/jumpybrain-hover-companion-recheck.log` and `/tmp/jumpybrain-hover-baseline.log`.
- Direct rendered hover/geometry probe passed 312 checks across all 24 palette/scheme/width combinations, including native update injection, disabled find controls, background/border stability and centered noncompressed glyphs. Captures in `/tmp/jumpybrain-hover-qa`; visually inspected Pride dark desktop and Ember light narrow layouts.
- Final build and `git diff --check` passed. The final dropdown guard preserves checked/disabled option treatment; the dropdown smoke passed again after that refinement.
- Tested baseline: `0a2965651180a619b698e79655a1c5bde68e6120` plus this task's working-tree changes. Build log: `/tmp/jumpybrain-hover-build.log`; test logs: `/tmp/jumpybrain-hover-{tests,theme,geometry,electron,boards,find,dropdown}.log`.
- Scope is the shared editor/Settings/graph shell used by Mac and hosted mode. Separate onboarding/update windows retain their existing styles. No claim of full-suite, physical assistive-device or third-party extension-theme QA. No installed app, personal brain, push or release was changed.
