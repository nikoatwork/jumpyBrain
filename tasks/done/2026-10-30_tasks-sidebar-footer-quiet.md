# Quieter sidebar footer

Status: completed 2026-10-30.

## Scope and outcome

- [x] Extend the footer divider across the full sidebar while retaining the existing content inset.
- [x] Remove the light/dark shortcut, its markup/styles/handler, and extension-specific toggle wiring. Companion theme preferences remain in Settings → Appearance; hosted shells follow OS/stored preferences.
- [x] Keep the native update check clickable with the same tooltip, keyboard target and focus treatment. Quiet states now have transparent borders/backgrounds and muted glyphs; up to date uses a plain checkmark. Download/relaunch highlights, errors and busy states remain distinct.
- [x] Update existing smoke fixtures to use the surviving preference API and four-control footer; update owning docs and pending release notes.
- [x] Finish verification and archive the scoped work for the task commit.

## Verification

Tested snapshot: `62b44f3` plus this task's scoped changes.

- `npm run build` passed, including the final extension cleanup (189,454-byte gzip editor; 5,669-byte gzip optional extensions UI).
- `node --test test/browser-theme.test.js test/browser-sidebar.test.js test/desktop-updater.test.js test/desktop-system-messages.test.js`: 45 passed, no failures/skips.
- `npx --package=playwright node scripts/sidebar-layout-smoke.mjs`: passed the real companion shell/native update renderer, full-width divider bounds, four aligned controls, 12 layouts, eight palette/scheme combinations, scroll isolation, hover/focus and Settings.
- `npx --package=playwright node scripts/theme-smoke.mjs`: passed four palettes × two schemes × three widths; OS/preferences/reload/cross-tab/blocked storage and draft/caret preservation.
- `env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-inline-updates.mjs`: passed the production sandboxed shell with an inert updater. Checks quiet transparent chrome, manual check clicks, keyboard/focus, every updater phase, actionable glow, Reduced Motion, failure/recovery, draft stability and narrow layouts. Its deliberately restricted app-only navigation produced the expected CSP console warning.
- `npx --package=playwright node scripts/extensions-browser-controller-smoke.mjs`: passed theme fallback and renderer lifecycle checks after removing obsolete toggle wiring.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs`: passed Settings appearance choices, persistence/cross-tab updates, responsive layouts and existing companion lifecycle flows.
- All changed JavaScript/smoke files passed `node --check`; `git diff --check` passed.
- Visually inspected desktop Ocean dark and 320px Ocean light captures under `/tmp/jumpybrain-sidebar-layout-qa/`. Divider is edge to edge, theme icon is absent and the checkmark is unboxed. Native captures are under `.local-pack/update-inline-ui/`.
- Direct `node scripts/sidebar-layout-smoke.mjs` initially could not resolve Playwright; the documented `npx --package=playwright` runner passed.

## Limits

No personal brain edits, installation, actual update download/replacement, push or release. Import/attention smoke fixtures were updated for the removed selector and syntax-checked rather than rerunning those unrelated flows.
