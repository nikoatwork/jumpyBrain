# Local Electron prototype

## Goal

Run the installed jumpyBrain browser UI in a separate Mac desktop window. User authorized implementation and local launch on 2026-10-16. Preserve unrelated working-tree edits.

## Decisions

- Reuse the installed native companion and its gateway, runtime, Keychain capabilities, profiles, and existing write authorization. Start it only when unavailable; never replace, restart, or quit it.
- Electron owns only its window and separate browser storage. No copied frontend, renderer Node access, alternate engine, automatic updates, login registration, signing, or public distribution.
- Install an independently named `~/Applications/jumpyBrain Electron.app` for local testing. Keep the existing companion and CLI installed.

## Tasks

- [x] Inspect architecture, installed companion bootstrap, save/unregister behavior, release setup, and unrelated edits.
- [x] Implement isolated Electron package, installed-companion discovery/bootstrap, restricted window, native menus, and pending-draft close protection.
- [x] Add reproducible local app packaging/install command and usage/boundary documentation.
- [x] Verify bootstrap/security and Electron behavior with disposable fixtures; build and launch against the installed runtime without editing personal memory.
- [x] Record results, limits, and a concise changelog entry for the new desktop surface.
- [ ] User trials the installed prototype; retain this active list for feedback.

## Relevant files

- `integrations/electron/` — prototype host, application, installer, and package metadata.
- `test/electron-host.test.js` — installed-companion/bootstrap boundary regressions.
- `scripts/electron-smoke.mjs` — disposable Electron integration checks.

## Verification

- `npm run build` passed. No installed-runtime replacement occurred.
- Full `npm test`: **994 passed, 0 failed, 1 skipped** (995 total; the existing opt-in provisioned-QMD test remains skipped). A smoke invocation made during the suite's clean rebuild hit missing `dist`; serial rerun after the build passed.
- All 38 targeted Electron host/companion gateway/browser tests passed, including nine new bootstrap/security cases.
- Final production Electron + production gateway smoke passed with disposable local Markdown: existing UI and HttpOnly cookie handshake, token removal, renderer isolation, denied external requests/navigation/windows, permitted clipboard-write/denied clipboard-read permission checks, native Settings action, graph navigation, editing/autosave, keep/discard unload behavior, canonical saved content, and tab cleanup. Clipboard contents were not read or modified by the smoke.
- Packaged for this Mac (`arm64`, Electron 44.8.0), locally ad-hoc signed, and installed at `~/Applications/jumpyBrain Electron.app` (289 MB on disk). `codesign --verify --deep --strict` passed.
- Launched installed app through native macOS UI automation: Home reports `Local brain · connected`; Cmd+, opens existing Settings; Home navigation works; Cmd+K and a read-only query return real results. Reinstalled/reopened the final clipboard-policy build, leaving it connected on Home. Observational installed-app checks only; no personal/remote note edits, indexing, credential changes, or runtime updates.
- Screenshot: ignored local artifact `.local-pack/electron/prototype-home.png`.
- Limits: requires the existing native companion; no public signing/notarization, auto-updater, bundled backend, Intel verification, new Keychain/picker/update validation, or added crash-draft recovery. Theme storage is separate from Chrome.
