# Update indicator follows the button shape

## Outcome

Completed 2026-10-27. Download/relaunch readiness now uses a traveling accent highlight along the button's stationary rounded border. The button and adjacent theme control retain their existing shape; action glyphs remain still during readiness and Reduced Motion keeps a static outline/glow.

## Goal and decisions

- Correct the circular halo around a rounded-square button shown in the user's close-up. Both circular buttons and a border-following glow were authorized; chose the smaller border-only fix after inspecting light/dark captures.
- Animate a typed conic-gradient angle inside a 1.5px perimeter mask with inherited button corners. The outline itself never rotates, so its corners stay aligned throughout the cycle.
- Keep updater authority, state transitions, keyboard/focus rules, error/retry presentation, working spinner, app-only policy and guarded restart unchanged.
- Implemented in parallel with [the integrated sidebar/window task](2026-10-27_tasks-mac-sidebar-window-chrome.md).

## Completed tasks

- [x] Compare shape approaches and retain coherent rounded utility buttons.
- [x] Implement both readiness states, stationary glyphs and static Reduced Motion presentation.
- [x] Verify animation geometry, rendered frames, themes, keyboard/focus, narrow layouts and updater states/actions.
- [x] Update owning docs and pending release notes; archive with the scoped implementation commit.

## Verification

- Tested snapshot: base `ff3ee70` plus the scoped UI changes. Concurrent update-build timing work subsequently landed as `75ccaf1`; the final UI commit preserves it separately. macOS 15.7.7 arm64, Node 26.7.0, Electron 44.8.0.
- `npm run build` passed; editor bundle remains within the existing gzip gate.
- `node --test test/browser-sidebar.test.js test/browser-theme.test.js test/notes-browser.test.js test/companion-browser.test.js test/electron-host.test.js test/electron-back-navigation.test.js test/desktop-updater.test.js` — 131 passed, zero failures/skips; includes all 26 updater tests.
- `env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-inline-updates.mjs` passed against the actual sandboxed production shell.
- Fixture checks dimensions/insets/radius/mask, eight distinct rendered positions per readiness state/theme, unchanged glyphs, static Reduced Motion, keyboard focus/activation, available/app-only/ready/working/failure/retry/hidden states, draft stability, restricted native actions and 390/320px layouts in both themes. The deliberately blocked child-frame action emits expected `ERR_BLOCKED_BY_CSP` and never reaches the native handler.
- Inspected available-light and ready-dark perimeter close-ups, full-window states and narrow captures under `.local-pack/update-inline-ui/`.
- JavaScript syntax and `git diff --check` passed.

## Scope and limits

Presentation only. Used an inert updater and disposable Electron profile, without changing personal Markdown or the installed app. Actual packaged download/replacement transactions, other hardware/OS versions and physical assistive technology were not rerun for this CSS change. No push, installation or release.
