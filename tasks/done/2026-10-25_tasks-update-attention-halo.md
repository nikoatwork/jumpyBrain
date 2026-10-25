# Rotating update attention halo

## Outcome

Completed 2026-10-25. Download/relaunch readiness now has a slowly rotating accent halo around the stationary action glyph. Reduced Motion preserves a static halo and glow. Existing work/error presentation and native actions remain unchanged.

## Goal

Make the Mac sidebar update button easier to notice when a download or restart is ready, with a glowing rotating indicator around the readable action glyph.

## Tasks

- [x] Add the readiness halo, preserving working/error states and static reduced-motion presentation.
- [x] Verify both themes, state transitions, rotation, reduced motion, keyboard actions and narrow layouts in the production Electron fixture.
- [x] Update owning docs and pending release notes; archive and commit the scoped result.

## Relevant files

- `integrations/electron/update-inline.mjs`
- `integrations/electron/smoke-inline-updates.mjs`
- `integrations/electron/electron.docs.md`
- `tasks/todo/release-next.md`

## Verification

- Snapshot: base `6adca73` plus this task’s scoped changes; Node 26.7.0 / Electron 44.8.0.
- `npm run build` passed; editor bundles remain within the existing size gate.
- `node --test test/desktop-updater.test.js`: all 26 passed.
- JavaScript syntax checks and `git diff --check` passed.
- Production sandboxed Electron smoke passed via `env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-inline-updates.mjs`.
- Verified actual halo transform advancement, stationary readiness glyphs, state-transition removal, static reduced-motion glow/halo, both themes, app-only policy, keyboard actions, restart/recovery, draft stability, restricted native actions and 390/320px layouts. The blocked iframe’s expected `ERR_BLOCKED_BY_CSP` never reaches the native handler.
- Visually inspected actual available-dark and ready-light screenshots under `.local-pack/update-inline-ui/`; the fixture also captures reduced-motion readiness in both themes.

## Scope and limits

Presentation only; use the existing authoritative updater actions and save/restart barrier. No installed app replacement or release requested. Preserve the unrelated untracked task lists.

Used an inert updater and disposable Electron profile. Full repository tests, physical assistive technology and packaged update transactions were not rerun for this CSS presentation change. No personal Markdown, installed app, release or remote memory was changed.
