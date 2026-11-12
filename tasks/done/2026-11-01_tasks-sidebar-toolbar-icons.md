# Sidebar toolbar icons

Completed 2026-11-01: all four top toolbar controls are icon-only, with transparent resting borders/backgrounds and an active Home border.

## Goal

Use icon-only Home, New note, New board and Search controls, with transparent resting borders/backgrounds and a visible border for the active Home destination. Preserve names, tooltips, focus and touch targets.

## Tasks

- [x] Inspect shared browser styles, design contract and existing checks.
- [x] Update toolbar presentation and owning documentation.
- [x] Build and run relevant theme/sidebar smoke checks; record results and limits.
- [x] Archive this list, update pending notes/changelog and commit only scoped changes.

## Scope

Shared hosted/Mac browser shell. Preserve existing unfinished page-action and copy-path work. No installation, push or release.

## Verification and limits

- Tested snapshot: `8d43bf8f7776083370d73fcb3e014f4d0c5efb65` plus this task and existing concurrent working-tree changes. Staged only toolbar changes from the shared `notes-browser.ts` file.
- `npm run build` passed.
- 91 targeted tests passed (`browser-theme`, `browser-sidebar`, `notes-browser`).
- Sidebar layout smoke passed: actual companion shell and native update renderer, 12 desktop/narrow light/dark layouts, 8 palette/scheme combinations, square icon targets, transparent inactive states, active Home border, accessible names and keyboard Search opening.
- All-theme browser smoke passed: 4 palettes × 2 schemes × 3 widths, including Home/note/search/Feedback/graph and draft/caret persistence.
- Visually inspected the Ocean dark 224px sidebar capture. Captures: `/tmp/jumpybrain-sidebar-layout-qa`; logs: `/tmp/jumpybrain-toolbar-{build,tests,sidebar,theme}.log`.
- `git diff --check` passed. No full suite or new native Electron launch; the Mac app uses this shared browser shell. No installed app, personal memory, push or release changed.
