# Simple desktop onboarding

## Goal

Make first launch welcoming and understandable without technical knowledge: a ready-to-use local folder, one primary action, and a secondary remote connection flow.

## Decisions

- Reuse an existing local app connection when available; otherwise suggest the standard local memory folder. Inspect without creating anything until Start writing.
- Keep folder customization and technical guidance optional. Remote connection asks only for the server address and access key, uses Keychain, and defaults to viewing only.
- Preserve canonical Markdown, existing setup completion, starter-page handoff, save barriers and CLI targets.
- Existing unrelated working-tree edits are outside this task.

## Tasks

- [x] Implement the local default, concise welcome screen and secondary remote form.
- [x] Verify setup policy and production Electron flows, including failures, themes and minimum window size.
- [x] Ask Mistral to review changes and suggest improvements; address actionable findings.
- [x] Update owning docs/release notes, archive and commit scoped changes.

## Outcome and verification

Completed on 2026-10-29 against parent `708eadb` plus scoped onboarding changes. The shared checkout also contained unrelated heading-rail work; it is excluded from this commit.

- `npm run build` passed.
- Setup, connection-store, gateway, desktop-message and onboarding-guidance suites: 56 tests passed. After review refinements, the expanded setup suite passed all 8 tests, including a new folder-alias activation regression.
- `node scripts/electron-smoke.mjs` passed: actual sandboxed welcome, explicit folder creation/reuse, starter handoff, editor integration and save/close protection. An initial run failed at an unrelated heading-rail assertion against stale compiled output; rebuilding resolved it.
- `node scripts/simple-onboarding-smoke.mjs` passed again after review refinements: no-picker default creation, cancel preservation, existing reuse, masked remote authentication retry without duplicates, view-only permissions, transient-helper retry, missing-folder recovery and keyboard focus. The remote fixture saw only observational status GETs.
- Light/dark captures at 960×720 and 680×620 are retained in ignored `.local-pack/simple-onboarding/`; visually checked local and remote layouts, with no horizontal overflow and primary/secondary actions in view.
- `git diff --check` passed.

## Mistral review disposition

Mistral Medium 3.5 reviewed implementation and suggested UX refinements. Findings were checked against the actual call chain rather than accepted by severity label.

- Accepted: transient-helper retry, primary-button focus after valid selection, specific missing-folder/empty-key feedback, and accurate loopback HTTP guidance.
- Folder-alias blocker did not reproduce: both picker and suggestion already return `inspectBrainFolder`'s canonical real path. Added a regression covering activation through an alias; retained the changed-root guard.
- Missing saved folders intentionally are not recreated automatically: a disconnected drive or moved brain must not silently become an empty replacement. The chooser remains usable; the production smoke now verifies recovery without creating the missing path.
- Access keys use a masked password input and no renderer persistence. Retain a failed attempt for convenient correction/retry; clear on Back or successful connection. Verified password type and storage isolation. No plaintext display leak was found.
- Retained direct opening of an already configured remote while offline: the existing editor shell exposes connection status and Settings recovery. Requiring successful connectivity would lock users out of repair. New remote setup still tests the destination before completing.
- Deferred multi-folder dropdowns and note-count/date previews: these add scanning and choices to the first-run path. Existing connections remain manageable in Settings.

## Remaining limits

- Smoke tests use disposable gateway/picker/credential seams. Actual OS Keychain permission prompts, physical native folder interaction and a fresh packaged installation were not rerun.
- Failed new remote checks retain the saved connection for retry; the first saved profile can become active per the existing connection-store contract. This does not authorize remote writes.
- No installation, push or release performed. Unrelated unfinished work remains in the working tree.
