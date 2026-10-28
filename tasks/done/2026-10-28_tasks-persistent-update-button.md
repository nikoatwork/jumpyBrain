# Persistent desktop update button

Status: completed 2026-10-28. The Mac update control stays visible in its existing footer slot throughout the updater lifecycle.

## Goal

Keep the Mac sidebar update button in a stable position in every updater state. Its icon, tooltip and action reflect checking, availability, preparation, readiness and recovery.

## Tasks

- [x] Keep the button visible and provide a check action/quiet icon when no update needs attention.
- [x] Update existing installed/UI fixtures and verify state transitions, stable placement and accessible actions.
- [x] Update docs/release notes, record results and archive/commit the scoped work.

## Outcome

- The button mounts visibly with a named refresh glyph, disabled until its first authoritative snapshot. Idle/canceled/recovered states provide **Check for updates**; current/success use a checkmark and **Up to date; check for updates**.
- Available updates retain the highlighted download action; checking/preparing/applying use a disabled spinner; ready uses highlighted relaunch. Retry/recovery and app-only policy retain their existing actions and explanations.
- No state hides or remounts the control. Updated the installed-success fixture to expect the visible up-to-date action, and updated owning docs, design guidance and pending release notes.

## Verification

- Tested snapshot: `241ae06` plus this task's scoped implementation, fixtures and documentation.
- `npm run build` passed (181,744-byte gzip editor; optional desktop extension UI 5,762 bytes gzip).
- `node --test test/desktop-updater.test.js test/desktop-system-messages.test.js`: 32 passed, zero failures/skips.
- `env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-inline-updates.mjs` passed in the actual sandboxed production editor shell with disposable profile, loopback fixture page and inert updater. It verifies all 11 updater phases, visible quiet-state check actions, identical utility-control bounds through state changes, both themes, 390/320px layouts, keyboard activation/focus, readiness borders, reduced motion, retry/recovery/app-only behavior, stale-action restrictions, notifications and draft/caret preservation.
- Screenshots retained under `.local-pack/update-inline-ui/`; visually inspected `current-light.png` and `current-dark-390.png`. The button fits and aligns with the existing controls. Fixture content lacks the real brain API; its expected recent-activity failure and test-inserted blocked iframe are unrelated to update presentation.
- `node --check integrations/electron/smoke-updater-app.mjs` and `git diff --check` passed.
- Limits: no actual release download/replacement, full installed transaction rerun, assistive-technology or physical-device review. The installed-success assertion was updated and syntax-checked; real installation remains covered by the existing workflow. No user installation, public release or push was performed.
