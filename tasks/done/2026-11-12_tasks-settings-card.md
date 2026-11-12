# Settings card finalization

Completed 2026-11-12 on `master` while consolidating worktrees. Finalizes the previously uncommitted implementation from the November 10 settings request: a near-full-screen card, Escape/close/backdrop dismissal, Cmd/Ctrl+F search, section/group filtering and responsive layout. The sidebar keeps its collapse preference and is inert behind the card. Existing save/navigation, brain scope and access-key handling remain in use.

- [x] Preserve and inspect the existing ten-file settings change on base `9c2e2531`.
- [x] Verify against current master, including the newer Access keys section.
- [x] Add current real-gateway coverage for search, empty results, Escape clearing and background inertness at 1280/320px.
- [x] Record checks and commit the completed change with its pending release note.

## Verification

Tested snapshot: `9c2e2531` plus the settings implementation and the focused sidebar smoke additions in this commit.

- `npm run build`: passed; editor 184,211 gzip bytes, below the unchanged 185,000-byte gate.
- `node --test test/companion-browser.test.js test/access-keys.test.js`: 27 passed.
- `npx --package=playwright node scripts/sidebar-layout-smoke.mjs`: passed on final script; actual gateway, 12 layouts, eight palette/scheme combinations, card geometry at 1280/320px, Cmd/Ctrl+F, matching group/empty results, first Escape clears and next closes, background inertness.
- `npx --package=playwright node scripts/board-settings-smoke.mjs`: passed; rename, cancellation, conflicts, settlement, deletion, preserved canonical note bytes and responsive settings.
- `npx --package=playwright node scripts/access-keys-smoke.mjs`: passed; hosted and companion local/remote Settings, role/permission handling, create/revoke and secret clearing on section exit.
- `git diff --check`: passed.

## Limits

No full suite, packaged native Mac, physical keyboard/IME or deployment check selected for this presentation change. The legacy `companion-browser-smoke.mjs` runner was updated by the original implementation but is not claimed as a current pass; its earlier run encountered unrelated fixture/assertion drift. Current focused real-gateway scenarios above supply the settings evidence. Disposable brains only; no installation, push or release.
