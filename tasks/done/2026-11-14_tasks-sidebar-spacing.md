# Sidebar spacing and type hierarchy

Completed 2026-11-14.

## Goal

Use the supplied T3 Code entry as a visual reference: a slightly wider sidebar, more breathing room and clearer differences between titles, previews and ages.

## Tasks

- [x] Widen the default desktop sidebar to 320px while preserving saved widths and resize controls.
- [x] Increase entry spacing and distinguish primary titles from supporting text and timestamps.
- [x] Build and verify the rendered sidebar at desktop/minimum/narrow sizes, in both schemes, including hover, keyboard and touch controls.
- [x] Record results and limits, update owning docs/release notes, archive and commit scoped changes.

## Scope

Shared browser/Desktop presentation only. No release, installation, push or canonical memory changes.

## Outcome

- Default desktop width is 320px (previously 280px); existing saved custom widths still apply. Pointer/keyboard resizing and double-click reset persist correctly.
- Entries use 12px vertical padding, 8px between title/preview and 8px between rows. Titles are 14px semibold, supporting previews 13px regular and ages 12px faint tabular numerals. Pin alignment follows the taller title line.
- Full-width selection, separate age lane, hover actions, board tree, independent scrolling and narrow navigation retain their existing behavior.

## Verification

Tested build: `e6d0252e` implementation, unchanged since the successful build. Concurrent repository work committed the initial task file in `f4bda47a` and the implementation/docs/smoke changes in `e6d0252e`; those commits are preserved. This finalization commit records the scoped result.

- `npm run build` passed; editor 184,883 gzip bytes, below the existing 185,000-byte limit.
- `npx --package=playwright node scripts/sidebar-layout-smoke.mjs` passed: initial 320px width, actual pointer resize to 280px and reload, keyboard resize, reset/reload, 224/320/480px sidebars, short windows, 390/320px layouts, light/dark schemes, four palettes, hover/focus, touch and Settings.
- `npx --package=playwright node scripts/board-sidebar-smoke.mjs` passed: board/column/page hierarchy, keyboard/focus, persisted preferences, unchanged canonical files and responsive light/dark layouts.
- Visually inspected Ocean light/dark captures at 320px under `/tmp/jumpybrain-sidebar-layout-qa/`.
- `git diff --check` passed.

## Limits

Chromium exercised the production shared companion shell using disposable brains. The packaged Mac app, physical assistive technology and other browser engines were not tested. No installation, release or push. Existing custom widths intentionally do not grow automatically; double-clicking the sidebar separator selects the new default.

## Relevant files

- [Sidebar layout and markup](../../src/adapters/http-server/notes-browser.ts)
- [Width preference](../../src/adapters/http-server/browser-sidebar.ts)
- [Browser contract](../../src/adapters/http-server/browser.docs.md) and [design system](../../docs/design-system.md)
- `scripts/sidebar-layout-smoke.mjs`, `scripts/board-sidebar-smoke.mjs`
