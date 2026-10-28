# Workspace Back and Forward

Completed 2026-10-28: added top-left workspace Back/Forward controls, retaining five previous app destinations and graph return state while Settings keeps its separate Back to app action.

## Scope

Add accessible Back/Forward controls at the top-left of the workspace beside the sidebar. Retain the current destination and five previous app destinations per tab, including graph-to-note return. Hide controls in Settings and skip Settings in the app trail; retain its Back to app action. Reuse save guards, brain scoping and graph state.

## Tasks

- [x] Implement bounded guarded navigation and workspace controls.
- [x] Verify forward/back branching, Settings exclusion, graph restoration, save failures and responsive placement.
- [x] Update owning docs/release notes and archive scoped work for the task commit.

## Verification

- The typed controller reuses browser-entry restore/save/replay; six URL/index pairs supply bounded control availability without document snapshots. Settings returns to the same app destination without consuming another trail entry. Native prefix pruning follows the same app destinations so Settings cannot evict reachable entries.
- Production browser smoke passes graph camera restoration, real note loading, five-step bounds, Forward branching, reload reset and failed-save Retry. All 1280/390/320px light/dark expanded/collapsed captures pass geometry checks; desktop and narrow captures inspected.
- Companion browser smoke passes Settings visibility/detour traversal and existing freeze, session, read-only and draft preservation regressions.
- Native Back smoke and window chrome smoke pass on Electron 44.8.0, including real sandboxed Mac layout, brain reload, native input, failed-save protection and eight Settings detours followed by workspace Back/Forward to graph/note. Collapsed Mac note capture inspected.
- Final `npm run validate`: 1,422 passed, zero failed, one skipped. Build output: 557,327 minified bytes / 184,326 gzip bytes for the browser editor bundle (below the existing 185 KB review gate). `git diff --check` passes.
- Tested snapshot: this task's source, tests and smoke runners on the existing 0.3.11 checkout before the scoped task commit. The browser/module docs and design system document the controller and placement; pending release notes retain the user-facing result.
- Limits: disposable fixtures only; installed app/personal memory unchanged. Physical mouse/trackpad, assistive technology and other browsers remain untested. No release or installation requested.

## Relevant files

- `src/adapters/http-server/workspace-navigation.ts`, `notes-browser.ts`, `browser-entry.ts`, `browser-icons.ts`, `companion-browser.ts`: controller, placement, glyphs and freeze synchronization.
- `integrations/electron/back-navigation.mjs`: Settings-aware native prefix pruning.
- `test/notes-browser.test.js`, `test/electron-back-navigation.test.js`, `test/browser-shell-helpers.js`, `test/companion-browser.test.js`: controller coverage and shared typed test plumbing.
- `scripts/workspace-history-smoke.mjs`, `scripts/companion-browser-smoke.mjs`, `integrations/electron/smoke-back-navigation.mjs`: production UI regression coverage.
- `docs/design-system.md`, `src/adapters/http-server/browser.docs.md`, `integrations/electron/electron.docs.md`, `tasks/todo/release-next.md`: durable behavior and pending release notes.
