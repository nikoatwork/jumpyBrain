# Conservative graph search

## Outcome

Implemented graph-only precision selection: at most 12 direct matches, conservative base-score filtering and no nonmatching neighbor expansion, including provisional title views. Full-query lexical and confirmed recent-save matches remain discoverable; links among retained notes remain visible. Shared search ranking and other search surfaces retain their behavior.

## Goal
Favor a small set of strongly matching notes over a broad semantic mesh.

## Tasks
- [x] Trace graph candidate selection, score semantics and linked expansion.
- [x] Add graph-only precision filtering, a 12-note cap and no nonmatching neighbor expansion (including provisional views).
- [x] Cover strong/weak semantic results, exact/body/recent saves, empty results and graph requests; run build, tests and disposable browser checks.
- [x] Update owning docs, release notes and changelog; record limits, archive and commit scoped work.

## Findings and decisions
- Current map requests 120 search hits, keeps 60 normalized matches and adds 60 neighbors without a relevance gate.
- Search scores include non-relevance boosts. Use only the existing base `qmdScore` for semantic filtering: floor 0.75 and at least 85% of the strongest candidate base score. These are conservative presentation heuristics, not calibrated confidence or cosine distance.
- Preserve full-query lexical title/body matches and confirmed recent-write matches; keep shared search ranking and other search surfaces unchanged. Cap the retained map at 12 direct notes. Only canonical links between retained notes appear; overview/focus/API expansion remains available.
- No private-corpus semantic relevance judgment or installed-app validation is implied by fixture tests.

## Relevant files
- `src/adapters/http-server/graph-search.ts`
- `src/adapters/http-server/map-controller.ts`
- `src/adapters/http-server/graph-page.ts`
- `src/adapters/http-server/recent-write-search.ts`
- `src/adapters/http-server/browser-entry.ts`
- `src/adapters/http-server/browser.docs.md`
- `test/graph-search.test.js`, `test/graph.test.js`
- `scripts/graph-topic-smoke.mjs`, `scripts/graph-ui-smoke.mjs`

## Verification

Tested the task diff on `59348ad` using Node v26.7.0 on 2026-10-23.

- `npm run build`: passed; browser bundle 170,270 gzip bytes, below the documented 172 KB review gate.
- `node --test`: 1,220 passed, zero failed, one optional real-QMD read-only conformance test skipped because its explicit binary was not provisioned.
- `npx --package=playwright node scripts/graph-topic-smoke.mjs`: passed at 1280/390/320 px with 1,650 disposable notes, light/dark screenshots, controlled three-strong/117-weak semantic candidates, twelve-note broad-query cap, retained links, no context expansion, navigation/camera and settled single-note external-refresh checks.
- `npx --package=playwright node scripts/graph-warning-smoke.mjs`: passed all three widths with 501 disposable notes; empty/uncapped views, notices, refresh/retry and API default cap retained.
- `npx --package=playwright node scripts/graph-editor-smoke.mjs`: passed desktop/mobile editing, save/failure recovery, search, body-only graph matching, history/navigation and graph UI checks.
- Visually inspected desktop light and 320 px dark screenshots; no clipped graph controls or labels.
- `git diff --check`: passed. Updated the graph controls assertion for the existing icon's accessible Filters label and graph smoke expectations for the deliberate precision policy.

## Remaining limits

- Semantic score thresholds are initial display heuristics over existing fused scores, which include rank fallback. They are not a guarantee of relevance or a measured embedding-distance cutoff. Model-backed precision/recall on the user's actual notes remains unmeasured.
- Broad queries intentionally show at most twelve direct notes, even if more lexical matches qualify. Semantic-only hits from older servers without a base-score breakdown are omitted. Partial query-word overlap alone is not lexical qualification.
- Browser verification used disposable lexical indexes and controlled semantic response scores; no personal notes were read or written. No installed-app update, release or push was performed.

Owning browser docs, glossary, pending release notes and changelog were updated. Finalized and archived with the scoped implementation and verification.
