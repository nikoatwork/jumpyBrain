# Board sidebar default and Settings icon

Completed 2026-10-31 on base `ae0a305`, after v0.3.14. Enable board navigation trees by default and give the Boards Settings navigation entry a matching icon.

- [x] Default unspecified board preferences to enabled with board/columns open; preserve explicit opt-outs and saved disclosure state, scoped per brain/device.
- [x] Add a shared decorative board glyph to Settings navigation, matching existing entries.
- [x] Update behavioral smoke coverage for fresh defaults, saved opt-outs/reloads and scope isolation; inspect populated sidebar and Settings screenshots.
- [x] Update docs and pending release note, archive and commit the completed task.

No canonical board/Markdown mutations, installation or additional release are part of this change.

## Verification

- `npm run build` passed; editor gzip remains 189,959 bytes, under the unchanged 190,000-byte gate.
- Extended `scripts/board-sidebar-smoke.mjs` passed: fresh defaults expanded without visiting Settings, checked controls, decorative Settings icon, explicit opt-out surviving reload, saved collapse state, cross-tab changes, storage denial, canonical byte preservation and populated responsive light/dark layouts.
- `scripts/boards-smoke.mjs` passed. Board-count assertions now count top-level boards, excluding the default-visible descendants.
- `scripts/boards-desktop-smoke.mjs` passed with two real Electron processes: local/remote defaults, read-only opt-out/re-enable, guarded navigation, persistence on relaunch and unchanged canonical fixtures. Native screenshot capture now waits for the Settings entrance animation to finish; the intermediate fade was not a disabled-state contrast problem.
- 28 focused tests passed across browser-sidebar, companion-browser and lexical-bundle. Full suite was not repeated for this small default/icon change.
- Visually inspected `/tmp/jb-sidebar-default-qa/settings-light.png`, the populated `1280-850-280-light.png`, and `.local-pack/boards-native/tree-settings.png` in dark mode. Board icon aligns with Brains, Appearance and Extensions; checked defaults and expanded hierarchy are visible.
- Logs: `/tmp/jb-sidebar-default-{build,browser,boards,native,tests}.log`. All test roots and native profiles disposable; no personal brain, installed application, hosted server or physical accessibility testing. No new release or push.
