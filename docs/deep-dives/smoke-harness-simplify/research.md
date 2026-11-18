# Smoke-harness simplification — deep-dive research (task 1.0)

Research-only. No source, build, branch or git state was changed. All numbers below
were measured on the working tree at HEAD `f2e5a84e` with `ls`/`wc`/`grep`/`node -e`
read-only commands. The proposal under review is
[tasks/done/2026-11-18_tasks-smoke-harness-simplify.md](../../../tasks/done/2026-11-18_tasks-smoke-harness-simplify.md);
its evidence numbers were re-derived here and several need correcting (section 2).

> **Review 2026-11-16:** an independent source check found errors in the pilot, the gate analysis and the parity plan. Section 10 records them and the narrowed pilot; inline notes mark the affected claims.

## 1. Scope and method

- Read: [AGENTS.md](../../../AGENTS.md), [docs/testing.md](../../testing.md),
  [docs/release-testing.md](../../release-testing.md),
  [src/adapters/http-server/browser.docs.md](../../../src/adapters/http-server/browser.docs.md),
  [src/architecture.docs.md](../../../src/architecture.docs.md),
  [package.json](../../../package.json), plus ~25 smoke scripts sampled across feature
  areas and the gate files listed in section 7.
- Measured with line-frequency analysis over all `scripts/*-smoke.mjs`: verbatim
  shared lines (whitespace/quote-normalized, threshold >= 8 of the 69 server-spawning
  smokes) and a token-based "harness line" count (imports of `../dist/*`,
  `./playwright-runtime.mjs`, temp-root, key, server-start, browser-launch,
  context/page factory, goto, teardown lines).

## 2. Evidence verification — the proposal's numbers, corrected

| Proposal claim | Measured | Verdict |
| --- | --- | --- |
| `scripts/` holds 171 files | 174 files; 25,759 lines of `*.mjs` | Slightly off |
| 99 smoke scripts, ~19,000 lines | 106 files match `*-smoke.mjs`, 18,734 lines (`wc -l`); 109 files contain "smoke" in the name (adds `collaboration-smoke-transport.mjs`, `editor-smoke-helpers.mjs`, `page-action-smoke-helpers.mjs`), 18,971 lines | Line count right; count wrong (+7 to +10) |
| ~32 smokes each spawn their own server + Chromium | 69 smokes call `startJumpyBrainHttpServer(`; 65 of those also launch Chromium; 28 additionally start the companion gateway (`startCompanionGateway`); 82 of 106 drive Playwright/Chromium at all | Understated by ~2x. The correct figure is 69 server-spawning, 65 server+browser |
| package.json carries ~40 npm scripts, mostly `npm run build && npx --package=playwright node scripts/<name>-smoke.mjs` | 48 npm scripts total; 16 mention "smoke"; only 9 invoke playwright smokes and 8 of those carry the `npm run build &&` prefix (`smoke:theme`, `smoke:sidebar`, `smoke:feedback`, `smoke:diagnostics`, `smoke:graph-editor`, `smoke:daily-capture`, `smoke:lexical`, `smoke:page-references`; `smoke:graph` has no build prefix). 11 scripts total start with `npm run build` (adding `smoke:semantic-index`, `smoke:desktop-update`, and `test` itself). The rest of the 48 are benchmarks, dogfood, pack/release plumbing | The "mostly" is wrong: the build-prefixed playwright smokes are 8 of 48 entries. The npm-script zoo is real (48 entries) but not mostly smokes |
| each re-derives temp brain root, AccessStore key issuance, server start, fixtures, teardown (~40 lines) | 96 use `mkdtemp`; 64 call `initializeMemoryRoot`; only 8 use `AccessStore`/`issue()` directly (the other 61 pass static `apiKeys: [...]` literals — 69 lines match `apiKeys:[`); 69 call `startJumpyBrainHttpServer(`; 96 do rm-teardown | The "~40 lines of setup" shape is right per script, but key issuance via AccessStore is the exception, not the rule |

Shared-line measurement over the 69 server-spawning smokes: 63 distinct
normalized lines appear in >= 8 of them, totaling 1,155 line occurrences (mean 16.7
per script). Most frequent: `} finally {` (46), the `node:assert/os/path` imports
(~31-35 each), `browser = await launchPlaywrightChromium({ chromium: await
loadPlaywrightChromium() })` (30), `assert.deepEqual(errors, [])` (30),
`import { startJumpyBrainHttpServer } from "../dist/server/index.js"` (26+19 quote
variants), `await initializeMemoryRoot(root)` (25), the playwright-runtime import
(23+22 variants), `await rm(root, ...)` (23), `let server, browser;` (21),
`server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false })`
(20), `const errors = []` (19), `await context.close()` (19), the
`installCollaborationSmokeTransport` import (16+10), `page.on('pageerror', ...)`
(14+13), `await page.goto(`${server.url}/?note=${id}#apiKey=${key}`)` (12),
`await server?.close()` / `await browser?.close()` (11+12).

Token-based count across all 106 smokes: 2,052 "harness-token" lines = 10.9% of
18,734. Restricted to the 69 server smokes: 1,585 lines = 11.9%, mean 23.0 lines per
script. The 17 browser-only (no own server) smokes carry another 271. Adding
multi-line import blocks, fixture scaffolding and try/finally+teardown that
single-line tokens miss, the realistic absorbable block is ~25-45 lines per
server+browser smoke — so the aggregate absorbable is roughly 1,600-2,700 lines,
i.e. about 9-14% of the smoke corpus, not a third of it.

## 3. Categorization of the 106 smokes

Name+content based grouping (counts overlap-free, totals 106):

| Category | n | own server | Chromium | lines | Notes |
| --- | --- | --- | --- | --- | --- |
| browser UX (theme, sidebar*, note-*, task-*, dropdown, window-chrome, workspace-history, markdown-*, folder-explorer*, drawings, boards, feedback*, recent-notes, note-find, note-outline, ...) | 49 | 36 | 44 | 8,242 | the bulk; mostly one disposable brain + server + Chromium |
| live editing / collaboration / ux-* (collaboration-*, ux-*, companion-browser, companion-gateway, external-document-updates, simple-recovery, single-user-recovery-settlement, stale-note-editing) | 23 | 21 | 23 | 4,332 | 31 smokes overall import the fault injector `collaboration-smoke-transport.mjs` |
| search / graph / references (graph-*, semantic-*, search-recognition, page-reference*, reference-autocomplete, missing-reference-pages, related-pages*, living-topic-pages, semantic-status-browser) | 14 | 9 | 12 | 4,209 | some need real QMD (`JUMPYBRAIN_QMD_BIN` in 8 smokes) or lexical `indexMemory` (14) |
| desktop / Electron / native (electron, *-electron, desktop-*, unified-desktop, mac-back-navigation, native-collaboration-input, backend-restart, claude-onboarding, extensions-desktop, diagnostics-electron, multiplayer-packaged-upgrade) | 12 | 1 | 1 | 1,142 | drive the real app, not `startJumpyBrainHttpServer` |
| install / packaging / hosted (agent-install, onboarding-install, simple-onboarding, desktop-onboarding, hosted-container, legacy-migration) | 6 | 0 | 0 | 710 | docker/pack/electron based |
| imports (logseq-import, obsidian-import) | 2 | 2 | 2 | 205 | |

Pure server-only proofs (server, no browser): `boards-desktop-smoke.mjs`,
`connection-usability-smoke.mjs`, `semantic-index-smoke.mjs`,
`usability-writes-smoke.mjs`. Non-browser smokes total 24. So roughly: 82 browser
scenarios, 24 non-browser (of which 4 are pure server proofs, 12 desktop/native,
6 install/packaging, 2 import... with overlap in the desktop count above — the
clean split is 82 browser vs 24 non-browser).

Near-duplicate / drifted families (each member's header states a distinct purpose;
none are true duplicates, but their setup has drifted in style):

- sidebar family (6): `sidebar`, `sidebar-layout`, `sidebar-requests`,
  `sidebar-settle`, `collaborative-sidebar`, `board-sidebar` — same shell, different
  assertions (layout vs request accounting vs settle animation vs live collab vs
  read-only board nav).
- page-reference family (4): `page-reference-smoke.mjs` (production integration),
  `page-reference-editor-smoke.mjs` (isolated editor, no server), 
  `reference-autocomplete-smoke.mjs` (stub transport), `missing-reference-pages-smoke.mjs`
  (companion gateway). [browser.docs.md](../../../src/adapters/http-server/browser.docs.md)
  already states these three runners are the production set and the feasibility
  forks were removed — consolidation already happened once, deliberately layered.
- external-links pair: browser vs `external-links-electron-smoke.mjs` (native opener
  seam) — deliberately separate surfaces.
- semantic family (3+): `semantic-index` (real QMD model), `semantic-graph`
  (Chromium+model), `semantic-status-browser` (fake status, no model).
- recovery family (5): `simple-recovery`, `single-user-recovery-settlement`,
  `ux-retained-review`, `stale-note-editing`, `collaboration-retained-versions`.

Drift observed in setup idioms: quote style (single vs double) splits the same
import lines in half; `setDefaultTimeout` values vary (12000/15000/20000);
viewport loops vary (`[1280, 390]` in 14 smokes, `[1280, 390, 320]` in 11); key
naming varies (`key`, `apiKey`, `token`, `setupKey`, literal `'disposable-*'`);
17 of the 69 server smokes do not pass `autoIndex: false` *(review: 2 — `graph-topic`, `usability-writes`)*; `companion-browser-smoke.mjs`
starts three backends plus a gateway in a fixture loop.

Headers double as documentation: 170 leading comment lines across the 106 smokes
(mean 1.6; histogram 0:16, 1:44, 2:31, 3:6, 4:1, 5:6, 6:2); 28 of 106 contain a
runnable command (`npm run build && npx ...` / `node scripts/...`) in the first 8
lines; 7 headers explicitly say to reuse an existing dist ("Use existing dist (do
not build here)": access-keys, companion-env-credentials, companion-gateway,
companion-idle-recovery, page-reference-editor, single-user-recovery-settlement,
window-chrome). These headers must survive any migration verbatim.

## 4. Build coupling

- `npm run build` = `rmSync('dist', recursive)` + `tsc -p tsconfig.json` +
  `node scripts/build-editor.mjs` ([package.json](../../../package.json) line 16).
  [tsconfig.json](../../../tsconfig.json) has no `incremental`/`tsBuildInfoFile`, and
  the rm makes every build clean by design. `build-editor.mjs` additionally runs
  esbuild for the editor bundle, extensions bundle and drawing app, compacts emitted
  whitespace, and writes `dist/adapters/diagnostics/build-info.json` (buildId =
  sha256 over version + feedback URL + all `src/**/*.ts` contents).
- Recorded timings: docs/build-footprint.md mentions a "1.8-second TypeScript/editor
  build"; [tasks/done/2026-11-08_tasks-editor-session-contract-refactor.md](../../../tasks/done/2026-11-08_tasks-editor-session-contract-refactor.md)
  records "Ordinary build passed in approximately 2.3 seconds" with the editor bundle
  at 671,081 minified / 221,862 gzip below the 223,250 gzip gate;
  [scripts/benchmark-build.mjs](../../../scripts/benchmark-build.mjs) times three clean
  builds against a generous 10 s ceiling (`JUMPYBRAIN_BUILD_MAX_MS`). So on the
  maintainer machine a clean build is ~2-3 s, not minutes.
- 86 of 106 smokes import `../dist/`, so they need a built dist, but
  [docs/testing.md](../../testing.md) already mandates the build-once rule:
  "Build once with `npm run build` before checks importing `dist/`. Reuse a build
  only when its relevant source is unchanged. Run builds sequentially with checks
  consuming their output; rebuilding during a check invalidates its evidence." Seven
  smoke headers repeat "use existing dist" inline. The scripts can already rely on a
  pre-built dist; the `npm run build &&` prefix on 8 playwright npm entries is
  belt-and-braces for standalone, copy-pasteable commands — which is exactly how
  docs/release-testing.md and browser.docs.md quote them. *(Review: docs/release-testing.md
  quotes none of the build-prefixed entries; see 10.7.)*
- Realistic savings from dropping/caching the prefix: ~2-3 s per npm-script
  invocation on this machine. Per scenario run directly via
  `npx --package=playwright node scripts/x-smoke.mjs` (the docs/testing.md form)
  there is no build cost at all today. Incremental `tsc --build` or a dist cache
  would change what `npm run build` means for the recorded-evidence rule above and
  for the gates that consume build output: `test/package-footprint.test.js` packs
  and budgets `dist/`, the editor-bundle gzip gate (224.25 KB, cited in
  browser.docs.md) is asserted in tests, `benchmark-build.mjs` times clean builds,
  and `npm test` itself is `npm run build && node --test`
  ([docs/release-testing.md](../../release-testing.md): "The full release
  command already runs **npm test and npm run cli:pack**"). Any build-flow change is
  therefore a release-gate change, not a smoke-local one.
- `node --test` (Node 22 default discovery) only picks up `test/` patterns; nothing
  in `scripts/*-smoke.mjs` matches, so smokes are outside `npm test` by construction
  and by design ("Smokes live outside the node --test runner" in the proposal is
  confirmed).

## 5. Proposed harness API (concrete shape)

Module: `scripts/smoke-harness.mjs` (new helper module; per docs/testing.md "Helpers
exporting functions are not standalone test commands", so every scenario keeps its own
file, npm entry and docs row). Proposed exports, modeled on what the 69 server smokes
actually repeat:

```js
// Brain: temp root + initializeMemoryRoot + fixture files
async function createSmokeBrain({ prefix = 'jb-smoke-', fixtures } = {})
  // -> { root, writeFixture(relPath, text), dispose() }

// Keys: AccessStore issuance (the 8 smokes that use it) or static apiKeys passthrough
async function issueSmokeKeys(root, entries) // [{name, role}] -> [{ token }]
function smokeApiKeys(...keys)                // wraps the static apiKeys: [...] literal

// Server: startJumpyBrainHttpServer with the common defaults
async function startSmokeServer(brain, { apiKeys, host = '127.0.0.1', port = 0,
  autoIndex = false, extra = {} } = {})
  // -> { url, server, close() }  (extra passes through lazyIndex/onBackendActivate etc.)

// Browser + page factory (wraps playwright-runtime.mjs; keeps pageerror collection,
// default timeout, #apiKey fragment navigation explicit)
async function launchSmokeBrowser(options)                    // -> browser
async function openSmokePage(browser, server, { noteId, key, width = 1280,
  height = 844, permissions = [], installTransport = false } = {})
  // -> { context, page, errors, transport? }
  // installTransport must stay an explicit per-page step BEFORE page.goto, because
  // collaboration-smoke-transport.mjs documents "Install BEFORE navigation".

// Fault injector: re-export so scenarios keep the exact contract
export { installCollaborationSmokeTransport } from './collaboration-smoke-transport.mjs';

// Lifecycle + evidence: owns try/finally so teardown cannot be forgotten
async function runSmoke(name, fn)   // fn(harness) ; harness.dispose() closes
                                     // browser/server/access in reverse order and rm's the root
async function recordSmokeEvidence(outDir, { scriptUrl, extra })  // the --out report:
  // git HEAD, dist/adapters/diagnostics/build-info.json build id, runtimeSha256 over
  // dist/**, script self-hash, and copies of input scripts -- must now include
  // smoke-harness.mjs itself in the copied inputs list
```

Hard requirements for the API: (a) no shared server/browser across scenarios within
one script run — each scenario keeps its own disposable brain and server (the
isolation is the point; docs/testing.md: "Keep fault injection on disposable
brains"); (b) `--kind/--width/--out` argv (3 smokes use `parseArgs`) and
`JUMPYBRAIN_SMOKE_SCREENSHOT_DIR` (34 smokes) stay owned by the scenario script, not
the harness; (c) the harness never navigates before the scenario installs its
transport.

Pilot set (5) with expected diff shapes *(superseded by 10.8: pilot 2 is gate-pinned, pilot 5 becomes a dry run)*:

1. `scripts/collaboration-overlap-smoke.mjs` (127 lines) — the task list's example.
   Replace ~18 harness-token lines (imports, mkdtemp, AccessStore+2 issues, server
   start, browser launch, context/page loop, finally-teardown) with
   `runSmoke('overlap', async h => { const brain = await h.createBrain(...); ... })`.
   Scenario body (caret/settled helpers, the 8 overlap assertions, JSON result line)
   untouched. Expected diff: -25..-35 lines, +5..8.
2. `scripts/ux-uncertain-save-smoke.mjs` (358 lines, has `--kind/--width/--out` and
   the report.json evidence) — harness absorbs server+browser+per-iteration
   context/page factory (~33 token lines); the report/evidence block moves to
   `recordSmokeEvidence` and gains `smoke-harness.mjs` in its copied-inputs list.
   Args parsing stays in the script. Diff: -35..-50, +8..12.
3. `scripts/theme-smoke.mjs` (194 lines) — simplest browser-UX case: static apiKey,
   one fixture, width loop. Diff: -20..-28, +4..6.
4. `scripts/graph-warning-smoke.mjs` (135 lines) — 501-fixture fan-out plus
   `indexMemory(root, { indexing: { mode: 'lexical' } })` (14 smokes do this); harness
   absorbs brain+server+browser+width loop, keeps indexing in the scenario.
   Diff: -18..-24, +4..6.
5. `scripts/access-keys-smoke.mjs` — the gateway variant: two roots + remote server
   + `startCompanionGateway` + clipboard permissions + `--shots`. Shows the harness
   must expose multi-brain/multi-server escape hatches, not just the single-server
   happy path. Diff: -30..-40, +8..10.

## 6. Regression-verification plan for a migrated script

1. Command stability: file name, npm script name and value, and every docs row stay
   byte-identical. Live docs reference 87 distinct smoke scripts in 130 mentions
   across `docs/`, `src/`, `integrations/`, README (repo-wide .md references: 100
   distinct, 1,278 mentions including tasks/deep-dives history), plus 29
   `npx --package=playwright node scripts/...` commands and 16 `npm run smoke:*`
   references in live docs. After migration, re-run
   `grep -rEo "scripts/[a-z0-9][a-z0-9-]*-smoke\.mjs" docs src integrations README.md`
   and confirm the same 87 distinct paths resolve to existing files.
2. Behavior parity on the same build: because the harness lives in `scripts/` only,
   `dist/` is untouched — prove it by comparing
   `dist/adapters/diagnostics/build-info.json` buildId and a sha256 over `dist/**`
   (the `runtimeSha256` pattern already used by `ux-uncertain-save-smoke.mjs`)
   before/after. Run each pilot pre- and post-migration on the same commit+build;
   compare exit code and stdout JSON (`{passed:true, results:[...]}`) field by
   field — the results array is the per-assertion record, so "every assertion still
   exercised" is directly checkable, not inferred from a green exit. *(Review: only
   pilots 1 and 2 print that JSON; see 10.4.)*
3. Mutation-style evidence, not just green runs: for live-editing pilots, the
   existing fault injector is the mutation lever — arm a `holdRequest`/`dropReply`/
   `rejectNext` rule the scenario does not expect and confirm the migrated script
   exits nonzero and names the failed assertion; then, in a scratch copy of the
   script (not the repo), delete/neuter one scenario assertion and confirm a second
   injected fault is still caught. For non-live pilots, mutate the seam the scenario
   asserts on (e.g., flip a fixture string, or a one-line `src/` mutation plus
   rebuild in a throwaway worktree — never in the main tree) and confirm nonzero
   exit. Record which assertion caught which fault, per pilot, in the task list
   (task 4.0's "failures reproducible when injected").
4. Gate mechanics the migration must not disturb:
   - [test/architecture-boundaries.test.js](../../../test/architecture-boundaries.test.js)
     scans `src/**` only (`sourceFiles(srcRoot)`); a harness under `scripts/` is
     outside the layer graph, so no boundary churn — but do not move harness code
     into `src/`.
   - [test/package-entrypoints.test.js](../../../test/package-entrypoints.test.js)
     pins manifest fields (`private`, `main`, `types`, `bin`, `exports === undefined`)
     but not the scripts block; still, keep npm entries unchanged per (1).
   - [test/package-footprint.test.js](../../../test/package-footprint.test.js) packs
     via the `files` whitelist in package.json — `scripts/` smoke files are not
     whitelisted (only installer scripts ship), so a new `scripts/smoke-harness.mjs`
     does not move any byte budget.
   - [scripts/precommit-guard.mjs](../../../scripts/precommit-guard.mjs) scans staged
     content for secrets; its `ALLOWED_PLACEHOLDER_VALUES`
     (line 54) already tolerates the `disposable-*` key literals the smokes use
     *(review: it has no such entry; the literals pass because they don't match
     `SECRET_ASSIGNMENT`)* —
     the harness must use the same placeholder style for any default key, and
     `guard:staged` must be run on the migration commit.
   - The multiplayer production gate contract
     ([docs/deep-dives/multiplayer-editing/production-gate-contract.json](../multiplayer-editing/production-gate-contract.json);
     `assertTreeFingerprints` over `runtimePaths = ['src','integrations','scripts',
     'package.json',...]` in [scripts/multiplayer-verify.mjs](../../../scripts/multiplayer-verify.mjs))
     fingerprints the whole `scripts/` tree. Any smoke or harness edit changes that
     fingerprint, so the pinned gate contract needs a deliberate re-capture before
     that gate is used again (build-footprint.md says the same about the pinned
     package-budget digest). This is the single most expensive hidden cost of the
     proposal. *(Review: overstated, and the real pinned-file gate was missed; see
     10.1-10.2.)*
   - `node --test` never discovers `scripts/*-smoke.mjs`, so `npm test`
     (`npm run build && node --test`) is unaffected as long as smokes stay in
     `scripts/` and out of `test/`.
5. Loop-time measurement (task 4.2): time `npm run smoke:<x>` before/after for each
   pilot, and separately time `npx --package=playwright node scripts/<x>-smoke.mjs`
   with a pre-built dist (the docs/testing.md flow) — the build prefix is the only
   removable term and it is ~2-3 s. *(Review: the pilot keeps the prefix, so task 4.2
   becomes "not slower"; see 10.6.)*

## 7. Estimate

- Lines: harness module ~150-250 lines added once. Absorbable per server smoke is
  mean 23 token-lines (1,585 total) and ~25-45 lines including multi-line blocks —
  call it ~1,600-2,700 lines across the 69 server smokes plus ~271 in browser-only
  smokes. Full-rollout net deletion: roughly 1,500-2,500 lines (~8-13% of 18,734).
  The 5-script pilot is net-neutral on lines (~-120..-180 removed, ~+200 harness):
  the pilot's value is proving the API and the verification plan, not line count.
- Loop time: per migrated npm entry, up to ~2-3 s saved if the `npm run build &&`
  prefix is dropped after a build-once rule; per direct `npx ... node scripts/...`
  run, ~0 s (no prefix exists). Server+Chromium startup per script (~1-3 s each,
  65 scripts) is NOT saved and must not be shared across scenarios. Honest expected
  improvement: single-digit seconds per command, not minutes.

## 8. Risks / reasons NOT to do this

1. The command surface is load-bearing, not accidental: 87 distinct smoke scripts
   are referenced from live docs (`docs/`, `src/`, `integrations/`, README) and
   1,278 md references repo-wide, including historical evidence in `tasks/` and
   `docs/deep-dives/` that records exactly which script produced which result. Renaming,
   merging or deleting scripts breaks recorded-evidence chains, and the headers
   double as documentation (170 comment lines; 28 with runnable commands).
2. Duplication is ~11-12% of smoke lines, not dominant. Mean 23 harness lines per
   server smoke; the other ~88% is scenario logic. The win is consistency, not
   scale.
3. Setup varies meaningfully per script (static vs issued keys, `autoIndex` on/off
   in 17, lexical `indexMemory` in 14, real QMD in 8, multi-brain gateway fixtures
   in companion-browser-smoke, viewports 1280/390/320, permissions, timeouts
   12-20 s, `--kind/--width/--out` argv in 3, `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR` in
   34). A harness that normalizes all of this hides scenario-relevant differences;
   one that doesn't needs so many escape hatches that the diff obscures the
   scenario — the exact failure mode the proposal itself warns about.
4. Recorded-evidence semantics: `--out` reports (25 smokes have an `out:` option, 6
   write `report.json`) pin git HEAD + dist buildId + dist runtimeSha256 + script
   self-hash + copied input scripts. A harness changes every script's self-hash and
   must be added to the copied-inputs list, or old evidence dirs stop matching.
5. The multiplayer gate contract fingerprints all of `scripts/`; any change there
   forces a deliberate re-capture of `production-gate-contract.json` before that
   gate runs again. *(Review: overstated; see 10.2.)*
6. Build savings are small (~2-3 s per prefixed command) and docs/testing.md already
   mandates build-once-per-change for interactive work; 7 smoke headers already
   instruct "use existing dist". Removing the prefix from the 8 npm entries trades
   away the standalone reproducibility of the exact commands quoted in
   docs/release-testing.md's gate for ~2-3 s.
7. Churn conflict: 214 commits touched `scripts/` in the last 30 days (recent work
   is actively porting smokes onto live editing: `17aa9763`, `35f40cf8`,
   `9d835e2f`, `6db05ceb`, ...). A 69-script migration would collide with in-flight
   ports; a pilot of 5 avoids this.
8. Fault-injection ordering ("install BEFORE navigation", per-page `routeWebSocket`)
   is safety-relevant; burying it in a page factory risks installing too late on
   exactly the scenarios that exist to test lost acknowledgements.

## 9. What would falsify the proposal

- Any pilot where the before/after stdout JSON differs in the `results`/assertion
  set, or where an injected fault (transport rule, fixture flip, or scratch src
  mutation) that failed pre-migration passes post-migration.
- Measured build time on the maintainer machine <= ~1 s, making the prefix
  immaterial — then "build once" buys nothing and the npm entries should stay as
  they are.
- Fewer than ~55 of the 69 server smokes expressible through the harness API without
  per-script escape hatches (spot-check by dry-diffing a random sample of 10).
- Any docs drift: the 87 distinct `scripts/*-smoke.mjs` paths referenced from live
  docs not all resolving after migration.
- Full-rollout line savings below ~1,000 lines.

If any of these hold, the recommendation is: keep one file per scenario and the npm
entries exactly as they are, and at most extract the two or three helpers that are
already shared (`playwright-runtime.mjs`, `editor-smoke-helpers.mjs`,
`collaboration-smoke-transport.mjs`) into a slightly larger harness — without
touching any command names. *(Review: this fallback is the most expensive option,
since all three are pinned assertion roots; see 10.3.)*

## 10. Review corrections (2026-11-16)

An independent, source-checked review of sections 1-9 before the 2.0 go/no-go. Confirmed correct: 174 files, 106 smokes, 18,734 lines, 69 server smokes, 8 using `AccessStore`, 48 npm scripts, 28 gateway starts, 31 fault-injector imports, 34 screenshot-variable users, 3 `parseArgs` users, the build definition (`package.json:16`), no incremental build, the 10 s benchmark ceiling, the `docs/testing.md:9,11` quotes, `architecture-boundaries` scanning `src/` only, `package-entrypoints` pinning only manifest fields, the `files` whitelist excluding smokes, and the pilot sizes (126/358/193/135/180 lines).

### 10.1 Missed gate: architecture-contracts pins a pilot script

[test/fixtures/architecture-contracts/profile.json](../../../test/fixtures/architecture-contracts/profile.json) pins `scripts/ux-uncertain-save-smoke.mjs` by hash (line 16) and requires its `JUMPYBRAIN_CONTRACT` observation ids (the "uncertain" check around line 119). Migrating it changes the pinned file, and making it import a new `smoke-harness.mjs` fails [contract-delta.mjs:108](../../../scripts/multiplayer-verification/contract-delta.mjs) ("New assertion helper requires an explicitly pinned null-old declaration") unless a reviewed contract delta is authored. Pilot 2 is dropped until someone budgets that review.

### 10.2 The `scripts/` fingerprint cost is narrower than stated

`runtimeSnapshot` ([scripts/multiplayer-verify.mjs:126-135](../../../scripts/multiplayer-verify.mjs)) records `scripts/` and requires it committed and unchanged during a run; it is not compared against the baseline contract. The real costs are: edits to pinned assertion files (and new helpers they import) need a reviewed delta; the production gate's Linux reports bind the full source map including `scripts/` ([multiplayer-production-verify.mjs:69](../../../scripts/multiplayer-production-verify.mjs)), so existing Linux reports are re-run for the new commit (per-run evidence, not a contract re-capture). The re-capture note in `docs/build-footprint.md:58-60` concerns the pinned `scripts/package-budget.mjs` digest only. Smokes not named in a gate inventory carry no gate cost.

### 10.3 The fallback recommendation is the expensive path

Section 9's fallback grows `playwright-runtime.mjs`, `editor-smoke-helpers.mjs` and `collaboration-smoke-transport.mjs`. All three are pinned assertion roots in the gate inventories, so editing them triggers 10.1's delta review. A new harness file that imports them unchanged is cheaper.

### 10.4 Parity needs counting for most pilots

Only `collaboration-overlap-smoke.mjs` (`:122`) and `ux-uncertain-save-smoke.mjs` (`:335`) print `{passed, results:[...]}`. `theme-smoke.mjs:188` and `graph-warning-smoke.mjs:109,112` print single PASS lines; `access-keys-smoke.mjs:22` prints `ok - <name>` per check. For those, "every assertion still exercised" requires counting executed assertions (scratch instrumentation, or adding a results array deliberately) plus injected-fault checks.

### 10.5 Teardown order is scenario-specific

`ux-uncertain-save-smoke.mjs:349-357` closes the browser, then the server, then copies notes into the evidence folder, writes `report.json`, and only then removes the temp root. `access-keys-smoke.mjs:175-179` swallows close errors and sets `process.exitCode` instead of throwing. A `runSmoke` wrapper that simply removes the folder in `finally` breaks the first and changes the second's failure output. Harness v1 needs an ordered cleanup stack (reverse registration, scenario-added steps).

### 10.6 Task 4.2 could not pass as written

The pilot keeps every npm entry and its build prefix, and section 4 measures ~0 s saving for direct runs, so "a loop that did not get faster is evidence against the proposal" would always fire. The bar becomes "not slower".

### 10.7 Smaller corrections

- 2 of 69 server smokes omit `autoIndex: false` (`graph-topic`, `usability-writes`), not 17.
- `docs/release-testing.md` quotes no build-prefixed `smoke:*` entry; it references `smoke:desktop`, `smoke:electron`, `smoke:hosted`, `smoke:install`.
- `ALLOWED_PLACEHOLDER_VALUES` (`scripts/precommit-guard.mjs:54`) has no `disposable-*` entry; those key literals pass because `const`/object-literal lines don't match `SECRET_ASSIGNMENT`.
- Live docs reference 86 distinct smoke paths (all resolve), not 87; 89 smokes import `../dist/`, not 86.

### 10.8 Narrowed pilot

- Migrate `collaboration-overlap`, `theme` and `graph-warning` only (none gate-pinned). Use `access-keys` as an uncommitted dry run of the multi-brain/gateway escape hatches. Leave `ux-uncertain-save` until a reviewed contract delta is budgeted.
- Harness v1: temp brain, server start, browser launch/page factory, ordered cleanup stack. No `recordSmokeEvidence` yet.
- Do not edit the three pinned helpers; import them.
- Parity per 10.4; loop "not slower" per 10.6.
