# Integrated Mac sidebar and quiet window chrome

## Outcome

Completed 2026-10-27. Mac windows integrate real native traffic lights into the Ember app surface, with a small muted `jumpyBrain` label beside the sidebar toggle. A compact labeled global Search action sits beside the New note compose icon. Collapse remains reachable on desktop and narrow layouts without recreating the editor or losing keyboard focus.

## Goal and decisions

- Follow the user's T3 Code screenshot and the running Mac reference for compact hierarchy, integrated window controls and subtle branding; retain jumpyBrain's Ember themes and writing surface.
- Use Darwin-only `titleBarStyle: 'hidden'` and native traffic lights at `{x:16,y:18}`, supported by the installed Electron 44.8.0 API. Keep the existing frame, sandbox, context isolation and lifecycle; no drawn controls or new native renderer bridge.
- Host publishes only a same-origin `data-native-mac=true` presentation marker at DOM ready and before first show. The shared shell reserves 88px before the toggle in its 48px header; ordinary browser sessions retain their normal 12px inset. Header/workspace toolbar provide drag regions, with interactive controls, brain selectors and tooltips/popovers excluded.
- Keep the exact regular caption-sized `jumpyBrain` Home label; remove the beta suffix and repeated workspace brain mark. Brain health/selection stays below the header. Search remains global, including notes absent from the bounded sidebar; existing search/capture shortcuts and guarded creation are unchanged.
- Move the same collapse toggle between sidebar and workspace toolbar, preserving focus and the existing stored preference. Narrow layouts also allow collapse/expand. Keep the native inset stable through full-screen transitions.
- Preserve continuous pinned/attention navigation, footer controls, brain switching and draft safeguards. Coordinate utility geometry with [the update-border task](2026-10-27_tasks-update-indicator-shape.md).

## Completed tasks

- [x] Establish header layout, native platform support and expanded/collapsed/narrow/full-screen arrangements.
- [x] Integrate real traffic lights and drag/no-drag regions with existing host/security/lifecycle behavior.
- [x] Refine subtle branding and compact global Search/compose actions while retaining navigation and accessibility.
- [x] Verify production hosted/native layouts, controls, shortcuts, drafts and physical header dragging.
- [x] Update owning browser/native/design docs, pending release notes and the repository changelog; archive and commit scoped work.

## Verification

- Tested snapshot: base `ff3ee70` plus the scoped UI changes. Concurrent update-build timing work landed independently as `75ccaf1` and is preserved. macOS 15.7.7 arm64, Node 26.7.0, Electron 44.8.0.
- `npm run build` passed; editor bundle is 181,734 bytes gzip within the existing gate.
- `node --test test/browser-sidebar.test.js test/browser-theme.test.js test/notes-browser.test.js test/companion-browser.test.js test/electron-host.test.js test/electron-back-navigation.test.js test/desktop-updater.test.js` — 131 passed, zero failures/skips.
- `npx --package=playwright node scripts/window-chrome-smoke.mjs --inspect` passed: real production hosted shell at 1280/390/320px, Mac window at 1200/480px, both themes, Home/note/graph, collapsed layouts/focus, global pointer search for a real canonical note absent from sidebar, Cmd+K, compose/Cmd+Enter, native full-screen/minimize APIs, failed-save create/close protection, Retry and reopen.
- Search alone uses a deterministic indexed-search response; canonical GET/create/save/navigation remain real. Fixed the new fixture's missing recognition-version metadata and Electron top-level readiness-await deadlock before its successful runs. The temporary source-only layout probe was removed once the production fixture passed.
- Existing browser fixtures passed: `scripts/sidebar-smoke.mjs`, `scripts/theme-smoke.mjs`, `scripts/companion-browser-smoke.mjs`, `scripts/external-document-updates-smoke.mjs` (each through `npx --package=playwright node`). Covers pin/navigation persistence, cross-tab focus/preferences, theme/storage/draft/dialog behavior, companion settings/freeze/session safeguards, external-refresh/merge/history and narrow collapse expectations.
- `node scripts/electron-smoke.mjs` passed: production gateway/window, onboarding/relaunch, sandbox/security, native menus, Find, graph/navigation, feedback, autosave, keep/discard close guard and tab cleanup.
- Direct CUA inspection confirmed actual native traffic lights, minimize/restore, full-screen/restore, close and Cmd+N reopen. Initial synthetic CUA drags did not move the window; the user then confirmed actual mouse dragging works, and the fixture recorded multiple native move events with changed bounds. Close/reopen and native control events are captured in `.local-pack/window-chrome-ui/inspection-events.json`.
- Inspected actual native header plus captured hosted/Mac Home/note/graph layouts, including light 480px notes, dark 1200px graph and collapsed/full-screen states. Captures: `.local-pack/window-chrome-ui/`.
- [The production update-border fixture](2026-10-27_tasks-update-indicator-shape.md) also passed against the combined shell. Changed JavaScript syntax, Markdown links and diff whitespace checked.

## Relevant files

- `integrations/electron/window.mjs`, `src/adapters/http-server/{notes-browser,browser-sidebar}.ts` — implementation.
- `scripts/window-chrome-smoke.mjs`, `integrations/electron/smoke-window-chrome.mjs`, `test/browser-sidebar.test.js` — focused production/native and focus/preference verification.
- `scripts/theme-smoke.mjs`, `scripts/external-document-updates-smoke.mjs` — updated expectations for labeled Search and reachable narrow collapse.
- `docs/design-system.md`, `src/adapters/http-server/browser.docs.md`, `integrations/electron/electron.docs.md` — owning layout/platform contracts.

## Scope and limits

Used disposable brains/profiles; no personal memory or installed application was changed. Search fixture validates scope/navigation, not QMD relevance. Other OS/hardware, physical assistive technology and arbitrary device input remain untested. Whole-repository tests and packaged release/update transactions were not rerun for this UI change. No push, installation or release.
