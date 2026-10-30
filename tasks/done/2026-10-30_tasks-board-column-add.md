# Clearer board column add control

Completed 2026-10-30. Column counts are removed; each title now has an adjacent outlined SVG plus with stronger resting contrast and the existing accessible name and composer behavior.

- [x] Remove column counts and place a clearly outlined plus beside each column title, retaining accessible names and responsive targets.
- [x] Run the build and existing board smoke, inspect the header, update release notes and archive with a scoped commit.

## Scope

`src/adapters/http-server/boards-view.ts`, the shared icon library and browser contract. Presentation only; existing composer and board membership behavior remain intact.

## Verification

Tested `d6a8598` plus this scoped change:

- `npm run build` passed.
- `npx --package=playwright node scripts/boards-smoke.mjs` passed, covering composer entry, inline rename, focus restoration, membership operations, retries and persistence against a disposable gateway.
- Inspected generated 1280px dark and 390px light captures: outlined plus controls remain next to titles; counts are absent. Existing smoke captures cover both schemes at both widths.
- `git diff --check` passed.

## Limits

Chromium verification; no full Electron or physical touch-device run. No installation, push or release.
