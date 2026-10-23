# Icon-only desktop updates

## Outcome

Completed: one icon handles download, background preparation, restart and retry/recovery. Download/restart readiness has a subtle static glow. Successful/current/canceled updates disappear quietly; the sidebar mounts no update text panel, details section, release notes or success message.

## Goal

Keep desktop update actions in one quiet sidebar icon, with no visible status paragraphs or Update details section.

## Decisions

- Subtle, static glow for available downloads and prepared restarts.
- Spinner during work; hide the icon after verified success/current/canceled states.
- Tooltip/accessibility text explains actions and errors, including blocked restart/save recovery.
- Explicit app-only policy remains in the icon action name/tooltip; no implicit change to managed/pinned CLI policy.
- Preserve native transport restrictions, duplicate-action protection and all-tab save barrier.

## Tasks

- [x] Simplify updater presentation and adapt fixture expectations.
- [x] Run targeted tests and actual sandboxed Electron UI checks, including themes and narrow widths.
- [x] Update docs/release notes, archive the result and commit scoped changes.

## Verification

- Tested snapshot: base `d804508` plus this task’s scoped changes on 2026-10-23, Node 26.7.0 / Electron 44.8.0.
- All 26 `node --test test/desktop-updater.test.js` tests passed, including action URL restrictions, pinned/managed CLI policy, restart barriers and private update-channel behavior.
- Actual sandboxed Electron UI smoke passed: `env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-inline-updates.mjs`.
- UI coverage: both themes; idle/current/available/checking/preparing/ready/success/failed/recovered states; no mounted text panel; computed glow only for download/restart readiness; keyboard download; explicitly named app-only action; failed restart tooltip; recovery; stale-action/frame restrictions; duplicate click and late poll fencing; draft/caret preservation; 390/320px layouts.
- The expected blocked iframe navigation emits `ERR_BLOCKED_BY_CSP` in the fixture log; it never reaches the native action handler.
- Visually inspected actual available-dark and ready-light screenshots under `.local-pack/update-inline-ui/`.
- Updated packaged-transaction fixture selectors to the single icon and silent success behavior. `node --check` passes for changed JavaScript, and `git diff --check` passes.

## Limits

- Used an inert updater/disposable Electron profile. No update was downloaded/applied, and no installed app, personal brain, release or remote memory was modified.
- Full packaged update transactions, full repository tests and physical assistive-technology sessions were not rerun for this presentation change. Existing updater/lifecycle production modules are unchanged.
