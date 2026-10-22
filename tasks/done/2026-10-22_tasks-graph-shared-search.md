# Graph uses shared app search

Status: completed and archived 2026-10-22; combined with sidebar/attention and unified Mac/CLI updates.

Use the same authenticated search request, ranking, result normalization and recent-save projection as global search. No graph-specific similarity threshold or retrieval engine.

- [x] Wire map queries to shared browser search, preserving cancellation, composition and existing graph filters.
- [x] Filter canonical graph files before its node cap, including an explicit empty result set.
- [x] Verify search parity, stale/failure feedback and late-response fencing; update owning docs and pending release notes.

Implemented 2026-10-22. The map shares normal-depth retrieval, recent saves and the global search's 12-result normalized display selection. Existing focus/orphan controls can narrow the results. Interrupted or changed queries refresh on Back instead of reusing an older packet. Small-screen filter popups stay usable with long feedback.

## Relevant files

- `src/adapters/http-server/{map-controller,graph-page,routes}.ts`
- `src/app/local-memory/graph.ts`, `src/types.ts`
- `test/graph.test.js`, graph browser smokes
- `src/adapters/http-server/notes-browser.ts`, owning browser/local-memory docs and HTTP protocol reference
- `scripts/dream-handoff-smoke.mjs` permits shared search during setup; its handoff quiet window still blocks all network.

## Verification

- `npm test`: 1,113 passed, one skipped, zero failures (includes final search/caching behavior).
- Final `npm run build` and `node --test test/graph.test.js test/notes-browser.test.js`: 108 passed after responsive popup adjustment.
- `npx --package=playwright node scripts/graph-editor-smoke.mjs`: passed desktop/mobile editor, search, Dream quiet window, body-only graph matches, normalized result parity and navigation/camera regressions. One earlier run saw an aborted Recent navigation request; the retry passed.
- Disposable standalone graph fixture: shared-search parity and body-only match passed at 1280/390px.
- `npx --package=playwright node scripts/graph-warning-smoke.mjs`: passed real 501-note lexical fixture, 500-node cap, search filtering, warning/failure/retry and popup accessibility at 1280/390/320px. Initial short-screen failure fixed by toolbar anchoring and upward placement.
- `git diff --check`: passed.
- Semantic model quality/latency, real hosted deployments, installed Mac app, other browsers and physical devices were not exercised. The shared retrieval engine/ranking was not changed; semantic availability follows its existing index policy/readiness.
- Unrelated pre-existing updater/design-system edits remain intact. No version bump, installation, publication or memory writes.

## Final combined integration verification — 2026-10-22

- Combined sidebar/attention, coordinated updater and graph build: `npm test -- --test-concurrency=4 --test-timeout=60000` passed **1,128 tests, one skipped, zero failures**. Bundle: 164,523 bytes gzip, within the165KB review gate. Browser build `9a0a6183dceec7fd`.
- Graph/browser focused suite passed108/108. Real501-note warning smoke passed1280/390/320px. Full production graph-editor runner passed desktop/mobile saves/conflicts/auth recovery, Dream's strict zero-network window, global/graph normalized search parity, body-only matches, cancellation, filters, Back/Forward, zoom and camera.
- Smoke harnesses allow only deliberate aborted GET Recent/Attention metadata requests outside the Dream quiet window and the exact wrong-key attention401 fixture. Quiet-window network assertions remain strict; no production relaxation was needed.
- Visually inspected map filters390px and graph UI1280px screenshots in `/tmp/jumpybrain-combined-graph-qa`. Shared semantic-model quality/latency and real hosted/physical device behavior remain untested; this integration reuses existing retrieval/ranking rather than claiming improved semantic quality.
