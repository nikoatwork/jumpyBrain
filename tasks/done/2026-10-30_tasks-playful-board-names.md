# Playful default board names

Completed 2026-10-30. New boards receive a random unused mood/productivity/animal name, such as “Cozy Focus Foxes.” There are 384 combinations, with a numeric fallback if exhausted. Selection checks active and settled names case-insensitively within the current brain. Pending creation keeps its identity and name unless conflict recovery reveals a competing name, then chooses another name on retry.

- [x] Generate cute productivity-themed word combinations, unique across active and settled boards in the current brain, preserving creation retries.
- [x] Verify naming collisions and board creation flows; update current docs, release notes and dependent smokes.
- [x] Record results, archive and commit scoped changes.

## Relevant files

- `src/adapters/http-server/boards-view.ts`: naming helper and creation integration.
- `src/adapters/http-server/browser.docs.md`: current naming and retry behavior.
- `test/board-names.test.js`: varied choices, repeated randomness, normalization, exhaustion and fallback collisions.
- `scripts/boards-smoke.mjs`: generated names, active/settled uniqueness, double activation and competing-tab collision retry with stable ID.
- `scripts/board-settings-smoke.mjs`, `integrations/electron/smoke-app.mjs`: dynamic generated-name expectations.
- `tasks/todo/release-next.md`, `tasks/CHANGELOG.md`: user-facing notes.

## Verification

Tested `2889a43` plus this scoped change:

- `npm run build` passed.
- `node --test test/board-names.test.js test/companion-browser.test.js`: all 24 tests passed.
- `npx --package=playwright node scripts/boards-smoke.mjs` passed, including real store collision recovery, lost-response recovery, inline rename and brain switching.
- `npx --package=playwright node scripts/board-settings-smoke.mjs` passed.
- `node scripts/electron-smoke.mjs` passed against the production sandboxed Mac window and a disposable gateway.
- `git diff --check` passed.

## Limits

Uniqueness applies to newly generated defaults in the current brain; manual renames retain their existing validation and can duplicate names. Existing board titles are not migrated. No installation, push or release.
