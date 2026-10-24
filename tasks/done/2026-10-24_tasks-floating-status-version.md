# Floating status notifications and Settings version

## Goal

Keep temporary feedback in a compact bottom-left overlay that does not move sidebar content. Show the installed Mac version in Settings, with the browser build version as the browser-only fallback.

## Outcome

Implemented compact floating feedback, one-time desktop completion/recovery/error notices and a quiet Settings/connection version footer. Native snapshots use the installed app version, so a remote brain or different browser build cannot substitute its version. Update actions remain icons; expired errors remain discoverable through the update tooltip.

## Tasks

- [x] Restyle the shared toast and route one-time desktop completion/failure notices through it; retain icon-only update actions and persistent save/recovery guidance.
- [x] Add a quiet version footer to Settings/connection settings, using the native installed app version when available.
- [x] Verify expiry, repeated updater polling, version accuracy, draft stability and desktop/narrow layouts in both themes.
- [x] Update owning docs/release notes, archive the task and commit only this scope.

## Verification and limits

- Tested snapshot: `eb31e83` plus this task's scoped changes, 2026-10-24. Concurrent Logseq work committed independently during implementation; unrelated planning files remain untouched.
- `npm run build` passed (171,068-byte gzipped browser bundle).
- Focused `node --test` for browser toast, desktop updater, notes browser, graph and Electron host: 148 passed, zero failures.
- Production sandboxed `smoke-inline-updates.mjs`: passed both themes, completion expiry despite repeated polling, sidebar geometry, installed-version override, draft stability, 390/320px layouts and existing native action restrictions. Light/dark notification screenshots in `.local-pack/update-inline-ui/` were visually inspected.
- Production `companion-browser-smoke.mjs`: passed including the Settings footer's build-version fallback and existing connection/save/session checks.
- Production `note-attention-smoke.mjs`: passed actual Snooze/Copy expiry, Undo, draft/caret preservation and desktop/390/320px layouts in both themes.
- `git diff --check` passed. No published upgrade, personal-memory write, installed-app replacement or real assistive-technology test was performed. The change is queued for the next release.
