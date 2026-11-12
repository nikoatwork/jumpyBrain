# Sidebar header alignment

Completed 2026-11-03. The collapse button and wordmark now sit together at the right content edge; the native traffic-light minimum clearance and collapsed-toolbar inset remain intact. Settings inherits the same wordmark placement.

## Goal

Align the jumpyBrain wordmark and collapse button together at the right of the sidebar header, farther from the Mac traffic lights.

## Tasks

- [x] Right-align the header group while preserving native control clearance and Settings placement.
- [x] Build and run the existing relevant layout and interaction checks.
- [x] Record verification and limits, update release notes, archive and commit the scoped change.

## Relevant files

- `src/adapters/http-server/notes-browser.ts`
- `src/adapters/http-server/browser-settings.ts`
- `src/adapters/http-server/browser.docs.md`
- `scripts/window-chrome-smoke.mjs`
- `integrations/electron/smoke-window-chrome.mjs`
- `docs/design-system.md`
- `tasks/todo/release-next.md`
- `tasks/CHANGELOG.md`

## Verification

Tested snapshot: `28836cd` plus the scoped header change, in a shared working tree with unrelated editor/dependency work in progress.

- `npm run build` — passed.
- `node --test test/browser-sidebar.test.js test/browser-theme.test.js test/notes-browser.test.js` — 91 passed.
- `scripts/sidebar-layout-smoke.mjs` — passed 12 layouts, resizable sidebar widths, themes, hover/focus and Settings.
- `scripts/theme-smoke.mjs` — passed all four palettes, both schemes and three viewport widths.
- `scripts/window-chrome-smoke.mjs` — hosted geometry, right alignment, both schemes, desktop/narrow collapse/focus and search passed; the native Electron run passed header geometry, native-control clearance, drag regions, Home/note/graph, collapse/expand, fullscreen and minimize checks before a later failed-save fixture timed out waiting for `saveStatus === "failed"`.
- Additional broad smokes did not pass: `scripts/sidebar-smoke.mjs:117` timed out in its failed-save/navigation scenario; `scripts/feedback-smoke.mjs:97` timed out waiting for failed save; `scripts/companion-browser-smoke.mjs:176` failed its no-memory-fetch-on-Settings-startup assertion. These checks do not exercise header alignment; no broader green-suite claim is made.
- Visually inspected the 280px dark and 224px light sidebar captures: the complete wordmark and collapse button fit at the right edge.
- Scoped `git diff --check` — passed.

## Limits

- Layout change only; no installation, publication, push or physical native-control click/drag validation. Broader fixture failures above remain unresolved and outside this task.
- Preserved unrelated changes in the shared working tree.
