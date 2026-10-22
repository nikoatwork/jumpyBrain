# Cleanup and encapsulation proposal

## Goal

Reduce competing implementations, repeated filesystem work, and browser/installer maintenance cost without changing the Markdown-native architecture. Prefer deleting obsolete behavior and giving existing contracts one owner over introducing frameworks or mechanically splitting large files.

**Status: implemented and verified with GPT-6.1 Sol subagents; archived with user approval on 2026-10-16.** The order below is the recommended execution order, except the independent safety fix in 4.0 can run immediately. Start with 1.0–5.0; treat the larger browser and read-path changes as separate increments, not one refactor PR.

## Completion summary

All twelve cleanup increments completed. Final rebuilt suite: 964 passed, 1 skipped; required browser smokes and package validation passed. Two pre-existing daily-capture wording checks remain with companion QA.

## Audit context

- Inspected current source, tests, scripts, module contracts, recent commits, and active plans. Local memory recall found no matching prior cleanup decisions.
- HEAD advanced concurrently from `d65dad0` to `e1ac3e8` during the audit. The latter lands companion polling and graph-warning fixes. Existing uncommitted theme/product/browser changes remain outside this proposal's ownership; reread affected files before execution. Line references below describe the audited working tree and can move.
- Main hotspots: `notes-browser.ts` (1,107 lines), `routes.ts` (909), `graph-page.ts` (862), and `types.ts` (736). These are investigation prompts, **not** reasons to split them indiscriminately.
- Evidence is predominantly source inspection. Scouts additionally reported 16 source-boundary checks, 57 selected Node installer/companion checks, and 43 mocked Python update checks passing against available inputs; an in-memory timer probe reproduced 120-second plus nested 70-second HTTP timers, and a stubbed shell probe reproduced leftover uninstall scratch files. No fresh integrated build/full-suite run establishes a baseline for this proposal.
- No implementation files, installed app, personal memory, configuration, deployment, or Git history were changed by this audit. Only this task list is added. No changelog entry is warranted for the proposal.

## Decisions

- Keep the existing core → app → runtime/protocol ownership, QMD adapter seam, nonce-protected local browser bundle, and framework-free UI.
- Browser save/concurrency state belongs in a typed browser module, not an HTML string; canonical publication policy remains in core/app.
- One owner per lifecycle: HTTP operation deadline, canonical freshness, native ownership/locking, and reference eligibility.
- Request-local reuse is preferred to persistent caches. Do not trade duplicate-ID detection, stale-source checks, protected frontmatter, or publication race protection for speed.
- Existing QA plans retain their unfinished work: [companion QA](2026-10-22_tasks-local-companion-qa.md) and [page-reference manual QA](../todo/tasks-page-reference-manual-qa.md). This proposal does not mark their gates complete.

## Tasks

### First tranche — correctness and deletion

- [x] 1.0 **P1 / small — Give each remote operation exactly one deadline.**
  - Evidence: `src/adapters/http-client/index.ts:85–106,156–185`: rich search enters `execute`, then calls `request`, which starts another `execute` with the 70-second default. Read-only preflight nests the same lifecycle. Longer caller deadlines are silently capped.
  - [x] 1.1 Add timer-controlled regressions for a custom deadline above 70 seconds, caller abort, response-body consumption, and read-only preflight followed by retrieval.
  - [x] 1.2 Split authenticated fetch/JSON handling from operation-scope creation. Public operations create the scope once; internal requests use its signal and remaining lifetime, not a new timer.
  - [x] 1.3 Preserve separate rich/bounded decoders, safe errors, unsupported-server rejection, timer/listener cleanup, and index defaults. Update the HTTP-client contract.
  - Done when `test/http-client.test.js` plus bounded/temporal transport regressions pass and each tested operation creates only one deadline timer.

- [x] 2.0 **P1 / small — Remove overview's competing definition of index freshness.**
  - Evidence: `src/app/local-memory/overview.ts:88–97` checks manifest membership/counts only. Same-path edits or a missing database can still look fresh; `freshness.ts:9–37` already checks canonical stats, policy, and backend readiness.
  - [x] 2.1 Add overview regressions for same-path edits, changed indexing policy, missing database with surviving manifest, and pending publication.
  - [x] 2.2 Derive `index.stale` from observational `retrievalReadiness`; preserve membership counts as descriptive fields, not proof of freshness. Keep incompatible/uninitialized roots safe.
  - [x] 2.3 Align warnings with the shared result without triggering automatic repair or mutation from overview. Update the local-memory contract.
  - Done when overview/status/search agree on relevant stale states and existing overview output fields remain compatible.

- [x] 3.0 **P2 / small — Delete demonstrably unused state and test-only production glue.**
  - Evidence: `graph-page.ts:481–771` writes `selectionToken`, `nodeId`, `saveQueued`, and editor-state `trailingNewline` without production reads. `lexical-editor.ts:133` declares an uncalled `onReference` option. `qmd-snippets.ts:12–18,81–97` contains an unused cleaner and obsolete heuristics retained only by test glue.
  - [x] 3.1 Recheck references, then remove those editor-state fields and the unused callback plus smoke-only callers/counter. Preserve actual newline codec behavior.
  - [x] 3.2 Remove `cleanQmdSnippet`, `looksLikeUnhelpfulSnippet`, its private helper, and `qmdIndexInternalsForTests` in `qmd-driver.ts:397–403`. Import still-live internal helpers directly in tests; delete assertions whose only subject is dead behavior or the glue object's shape.
  - [x] 3.3 Replace identity dream forwarders in `src/app/server-memory/index.ts:264–285` with named re-exports, preserving the public surface and signatures. Remove the unused `repoRoot` declaration/import in `scripts/public-install.mjs`.
  - [x] 3.4 Inspect `exactContent` separately: replace its implementation-state assertion with observable staged-payload/no-second-GET coverage before removing it if no real consumer exists.
  - Done when entrypoint/boundary, save/reconciliation, newline, staged-reference, and retrieval tests pass. Do not delete live `qmd-snippets.ts` as a whole or remove core publication checks.

- [x] 4.0 **P1 / medium — Give native install/update/uninstall one ownership and locking implementation.**
  - Evidence: `integrations/macos-companion/uninstall.py:10–29` assumes default support/LaunchAgent paths and opens a lock with `"a"`; `update.py:95–183` validates configured paths and uses no-follow/inode-checked locking. Install/update also import each other (`install.py:23`, `update.py`'s install call).
  - [x] 4.1 Add disposable uninstall regressions for custom support/agent paths, held/missing/symlink/replaced locks, unrelated bundles/jobs, and preservation of Markdown/runtime/support data.
  - [x] 4.2 Extract a small import-safe Python ownership/locking module. Make all three tools use the same exception identities and primitives; remove the circular import.
  - [x] 4.3 Read validated bundle configuration before uninstall, lock the actual support directory, and verify the owned LaunchAgent/program before deletion. Fail closed when ownership/liveness cannot be proved.
  - [x] 4.4 Separate ownership validation from runtime/key health: uninstalling a broken owned app must not require a working CLI or valid API key. Preserve supported legacy ownership detection.
  - [x] 4.5 Update `install.sh`'s downloaded dependency set, shipped resources, packaging assertions, and companion docs in the same change; exercise fresh/update/bootstrap paths with stubs.
  - Done when install/update/uninstall share the safety primitive and mocked lifecycle/package tests pass. Do not run uninstall against the installed application to validate this task.

- [x] 5.0 **P2 / small–medium — Remove the obsolete bootstrap and close distribution gaps.**
  - Evidence: Swift launches `gateway.mjs` (`Companion.swift:434–435`), which owns the watchdog (`gateway.mjs:335–349`). `server-bootstrap.mjs` is only copied/required/fixture-generated in current repository consumers. `scripts/local-pack-manifest.mjs:15–24` omits required assertions for Swift/uninstall/public installer resources; current tarballs are not proven incomplete.
  - [x] 5.1 First add independent omission regressions for indispensable companion/public-installer resources, including helper dependencies introduced by 4.0. Extend the existing validator, not a generic dependency scanner or a second manifest framework.
  - [x] 5.2 Verify supported invocation paths, then delete `integrations/macos-companion/server-bootstrap.mjs` and its copy/validation/fixture requirements in install/update and Python smoke tests. Assert the actual gateway dependency closure instead. Check external/deep invocation compatibility before treating the removal as private.
  - [x] 5.3 In `uninstall.sh:17–30`, keep the scratch-owning shell alive around the downloaded Node helper so its EXIT trap runs; preserve the checkout-local `exec` branch. Add stubbed success/failure/signal cleanup coverage.
  - Done when package omission checks, update/watchdog regressions, and offline shell-wrapper tests pass. Retain snapshot migration and scratch-directory preservation used for supported recovery.

### Second tranche — real encapsulation and less repeated work

- [x] 6.0 **P2 / medium — Extract the browser document controller, then the map controller.**
  - Evidence: `graph-page.ts:481–771` embeds persistence/codec functions in a template string; title composition is in `notes-browser.ts:207`. Tests recover executable functions through brace-counting rather than importing a typed module. The same shell owns map loading/rendering/camera at `graph-page.ts:305–479,810–854`.
  - [x] 6.1 Move `createDocumentEditor`, split/compose codec, and title composition into a cohesive typed browser module. Inject transport, timers, selection/session checks, and UI callbacks; make dependencies explicit rather than importing Node/core storage code.
  - [x] 6.2 Use the existing esbuild/browser delivery path for the extracted code; keep it same-origin, locally bundled, nonce-protected, and script-terminator-safe. Do not add a frontend framework/service or a second asset pipeline.
  - [x] 6.3 Convert controller/codec tests to direct imports while retaining production-shell parse/CSP/bundle checks. Add explicit state types so undeclared fields and unused bookkeeping cannot hide inside generated JavaScript.
  - [x] 6.4 Preserve save serialization, lost-response uncertainty, idle reconciliation, title rejection/recovery, navigation guards, and the ordinary-versus-companion conflict policy exactly. Change no conflict UX in this extraction.
  - [x] 6.5 In a separate increment, isolate map rendering/loading/camera behind fetch and guarded-open callbacks. Leave `graph-page.ts` as shell composition, not a new global controller registry. Consolidate repeated category color mappings while here.
  - Done when graph/notes/daily/companion tests and production editor/map/warning smokes pass; caret, history, camera restoration, warning races, and package/bundle budgets remain unchanged. Follow current QA/theming integration rather than replacing it.

- [x] 7.0 **P2 / small — Share reference eligibility and browser request construction, not UI behavior.**
  - Evidence: `notes-browser.ts:477` and `reference-autocomplete.ts:143` repeat safe-title/visible-duplicate policy; `reference-ranges.ts:5` owns another safety predicate. `notes-browser.ts:522,531` repeats identical search requests. `graph-page.ts:289` duplicates `memoryDocumentPath` in `adapters/http-protocol.ts:25`.
  - [x] 7.1 Introduce one browser-safe pure eligibility function with unsafe-title/missing-ID/visible-duplicate reason codes, consumed by both pickers. Keep their explanatory messages local.
  - [x] 7.2 Add shared table cases for controls, delimiters, whitespace, punctuation, invalid/missing IDs, and distinct-ID duplicate titles. Retain live range/session validation at acceptance.
  - [x] 7.3 Share one authenticated search request function and reuse the existing protocol route/path owner through the browser build. Preserve payloads, abort signals, `If-Match`, and companion generation/tab headers.
  - Done when both reference pickers, search-ranking parity, and companion transport regressions pass. Do not merge popup/modal state machines or companion cookie-control traffic with ordinary memory authentication. Visible suggestions do not establish global title uniqueness.

- [x] 8.0 **P2 / medium — Batch canonical ID discovery and remove the redundant update pre-read.**
  - Evidence: `local-memory/compact.ts:29–45` caches by ID, but each distinct ID calls the whole-corpus scan at `core/canonical/markdown-store.ts:106–137`. K distinct IDs cause K discovery scans. `local-memory/index.ts:129–139` also pre-reads an update before core repeats lookup/hash validation at `markdown-store.ts:227–233`.
  - [x] 8.1 Give core a request-scoped multi-ID discovery operation with global duplicate detection, then use existing guarded reads for matched locations. Compact recall should discover once per request, not once per result.
  - [x] 8.2 Preserve cancellation, invalid UTF-8 rejection, subroot/path-basis rules, source identity changes, missing IDs, and expansion-unavailable reasons. Never use index IDs/paths as proof of canonical uniqueness.
  - [x] 8.3 Independently remove only the app's preliminary update read/hash comparison. Keep required preconditions and translation to `MemoryDocumentPreconditionError`; core remains the sole validator before and during publication.
  - [x] 8.4 Add deterministic read/discovery counters with synthetic multi-ID fixtures and retain concurrent-update/publication-race tests. Measure work reduction without claiming a production latency gain.
  - Done when discovery is one corpus pass for multiple IDs and update error shapes/race safety are unchanged. No persistent ID cache or snapshot-isolation claim.

- [x] 9.0 **P3 / medium — Read/parse index inputs once under the existing safety scope.**
  - Evidence: `local-memory/index.ts:63` reads/parses every file via `readMarkdownDocuments`, discards content, then `qmd-driver.ts:62–70` rereads/reparses the same files under its lock.
  - [x] 9.1 Replace the preliminary content read with discovery; define a core-owned canonical snapshot reader returning content, parsed metadata, and source stats.
  - [x] 9.2 Acquire snapshots inside the current QMD lock/execution scope and feed them through the adapter, preserving stat-before/read/stat-after checks. Do not reuse earlier unguarded bytes or move QMD infrastructure into core.
  - [x] 9.3 Test read counts, cancellation, changed-during-read failure, empty documents, configured index roots, rollback, and generation publication. Update canonical/local-memory/QMD ownership docs.
  - Done when each indexing input snapshot is read/parsed once under lock with unchanged transaction/safety behavior; the independent post-publication freshness scan retains migration-envelope reads. This is not streaming indexing or a bounded-memory claim; keep it separate from 8.0.

- [x] 10.0 **P3 / medium — Reuse graph connection collection, not graph presentation.**
  - Evidence: `local-memory/overview.ts:116–147` and `local-memory/graph.ts:58–89` repeat lookup, link resolution, self-link exclusion, edge aggregation, and neighbor assembly.
  - [x] 10.1 Extract a small app-local collector over core link semantics that supplies resolved edges and unresolved references to both projections.
  - [x] 10.2 Keep overview cheap: do not instantiate snippets, stat-rich graph nodes, browser layouts, or graph-limit policy for a connection summary.
  - [x] 10.3 Cross-check common edge counts with repeated/self/ambiguous links. Preserve the intentional difference: overview counts unresolved occurrences; graph deduplicates unresolved nodes.
  - Done when common connection policy has one implementation and both existing output contracts remain intact.

### Supporting work — test and documentation ownership

- [x] 11.0 **P2 / small — Consolidate test plumbing after the new seams exist.**
  - Evidence: function extraction repeats in `test/{graph,notes-browser,daily-notes-browser,companion-browser,search-ranking-parity}.test.js` and `scripts/reference-autocomplete-smoke.mjs`; Chromium launch fallback repeats across smoke runners despite `scripts/playwright-runtime.mjs` and `editor-smoke-helpers.mjs`.
  - [x] 11.1 Prefer direct controller/policy imports after 6.0–7.0. Share the remaining extraction helper only as transitional shell-test plumbing, not a permanent parser framework.
  - [x] 11.2 Extend `playwright-runtime.mjs` with a shared launch/fallback helper that preserves channel overrides and exposes explicit options. Reuse existing editor helpers rather than copying them.
  - [x] 11.3 Keep scanner unit tests, save-controller tests, real HTTP/browser integration, and gateway coordination coverage distinct. Remove duplicate setup, not independently useful assertions or manual rollout gates.
  - Done when representative isolated and production-shell smokes use the common helpers with unchanged coverage. Leave the stale daily-capture assertion fix owned by the current companion QA task.

- [x] 12.0 **P2 / small–medium — Consolidate owned contracts and distinguish active plans from completed history.**
  - Evidence: `docs/technical.md:5–92` repeats source-layer rules from `src/architecture.docs.md`; browser behavior repeats in `docs/shared-memory-protocol.md:312–371` and `http-server.docs.md:6–42`. Protocol line 328 still describes white/warm-grey surfaces while the working tree adds Ember light/dark. Execution mechanics repeat across technical/protocol/QMD/CLI docs.
  - [x] 12.1 Make `src/architecture.docs.md` the source dependency-policy owner. Shorten technical.md to conceptual navigation plus its unique distribution/operator decisions; retain brief AGENTS.md safety reminders.
  - [x] 12.2 Create one cohesive co-located `src/adapters/http-server/browser.docs.md` for browser/editor/companion state and verification contracts; make the adapter guide a short responsibilities/non-responsibilities map. Keep public HTTP schema/auth/CSP/compatibility details in the protocol reference, preserving useful anchors.
  - [x] 12.3 Correct theme drift when the theme change lands. QMD docs own backend execution mechanics; protocol owns wire errors; HTTP-client docs own transport deadlines; CLI/operator docs retain necessary user instructions and link for mechanics. Do not collapse these different timeout scopes.
  - [x] 12.4 Review the completed mellow-editor, sentence-excerpt, and interaction-accounting lists for approved archival rather than leaving completed work indistinguishable from active plans. Carry any real follow-up into its existing owner; preserve evidence and archive-approval requirements.
  - [x] 12.5 Check inbound links/anchors and compare two real reading paths before/after (browser change; retrieval lifecycle change). Do not impose doc word quotas or create per-file documentation.
  - Done when each changed contract has one discoverable owner, navigation works, and active task status is accurate. Do not rewrite task archives/release notes or add a granular changelog entry; reassess a highlight only for a significant implemented architectural result.

## Deliberately not proposed

- No new monorepo/package split, graph database, event bus, dependency-injection framework, generic repository/cache layer, or browser framework.
- No split of `types.ts`, `routes.ts`, `Companion.swift`, or large test files just to meet line-count targets. Extract additional modules only when an identified behavior owner/direct test seam justifies it.
- No removal of legacy dream batch APIs, supported installer recovery/migration, strict read-only handling, or public compatibility exports based only on internal call counts.
- No merging written/evidence/edit dates, automatic/nonrepairing/strict read-only retrieval, compact/rich packet validators, or ordinary/companion conflict policies.
- Defer Swift toolchain/overlay helper extraction: there is duplication in install/native tests, but lower value than the work above. If later extracted, include the helper in the native build fingerprint.
- Do not delete `deep-dives/` evidence, task archives, release/legal notices, generated assets required for packaging, or canonical memory buckets (`notes/`, `pages/`, `sessions/`, etc.). No whole dead source directory was established.

## Execution gates

- Keep each numbered task independently reviewable. Before changing a source module, reread its architecture and nearest `*docs.md` contract; update that owner if the boundary changes.
- Add behavioral/counter regressions before altering a safety or lifecycle boundary. Run focused checks per increment and `npm test` against the final integrated source; do not use stale `dist` passes as proof of a completed source refactor.
- Browser extraction additionally requires actual production-shell editor/reference/companion/map smokes; installer changes require disposable offline bootstrap/package/update/uninstall fixtures. Build and package checks must cover new shipped dependencies/assets.
- Report measured reads/timers and actual test scope. No claim of faster production recall, full device/browser validation, installed-app readiness, or complete QA without corresponding evidence.

## Execution notes — 2026-10-16

- Initial local memory recall found no matching cleanup decisions. Preserve pre-existing browser/theme/product edits. HTTP deadline, overview freshness, and native lifecycle work assigned to separate GPT-6.1 Sol subagents; parent owns integration and task status.
- Task 3 reference audit: `fileURLToPath` remains live in public installer file-URL resolution, so retain its import while deleting only unused `repoRoot`. Staged-reference regression already verifies rendered Markdown and exactly one GET; removed only its redundant `exactContent` implementation-state assertion.
- Tasks 1–2: build passed; HTTP/bounded/temporal transport 32/32; overview + semantic lifecycle 30/30 and expanded overview 4/4. Controlled clock reproduced five HTTP failures before correction and now observes one operation timer. Overview regressions cover same-path edits, policy, missing DB, pending publication, and safe incompatible/uninitialized roots.
- Task 3: rebuilt-source graph/notes/CLI/dream checks 138/138, including save reconciliation, newline codec, staged reference rendering and no-second-GET behavior. Public installer retains its live file-URL import.
- Task 12: browser-change reading path previously required adapter + protocol + technical duplication; now architecture → adapter map → browser contract → protocol only for wire details. Retrieval reading path now technical operator configuration → QMD execution owner, with separate HTTP-client deadline and protocol error references. Completed mellow/sentence/interaction lists are clearly labeled completed pending archive approval; no archives moved.
- Task 3 boundary/entrypoint checks additionally passed 21/21. Task 12 checked all 33 relative links/anchors in changed technical/protocol/adapter/browser guides; existing protocol and adapter heading anchors retained. Source architecture owns boundary verification; no historical task evidence or release notes rewritten.
- Tasks 4–5: shared import-safe Python lifecycle primitives, configured-path uninstall and loaded-job ownership validation; obsolete bootstrap removed, 17 independent package omission checks and shell scratch success/failure/TERM coverage. Python 50 passed; focused lifecycle/gateway/menu/package 64 and installer/shell 36 passed before final integration. A concurrent dist rebuild interrupted a later fixture setup; final stable suite remains the integrated gate. Loaded-job diagnostic parsing fails closed on unfamiliar macOS output; real native/launchd integration remains unverified.
- Native test setup incident: importing the original uninstall script inspected the installed bundle and opened its already-held lock, then exited before launchctl or deletion. No installed state changed; the module is now import-safe and subsequent lifecycle operations used disposable mocks/fixtures.
- Tasks 6–7/11: typed document/map controllers and shared reference eligibility/search transport use the existing local esbuild/nonce path; direct-import behavior checks replace extraction plumbing where seams exist. Final rebuilt browser checks 141/141; gzip bundle 148,088 bytes (baseline 143,088), below 160 KB review gate. Actual editor/map/camera/history, reference editor/autocomplete, reference HTTP integration (27), companion browser, real gateway (14), Lexical, theme, and warning (1280/390/320 px, 501 disposable notes) smokes passed. Final map tweak rechecked with 141 tests and warning smoke.
- Daily capture smoke retains two existing wording failures at `scripts/daily-capture-smoke.mjs:360` (`Enter to insert` versus `Enter insert`); other smoke cases passed. Per 11.3, that assertion remains owned by companion QA; this cleanup does not close manual/device QA gates.
- Tasks 8–10: final integrated counters pass: multi-ID discovery once for four source files/two guarded opens; compact two IDs/one discovery; app update discovery reduced two → one. Index fixture: five candidate reads + five parses under lock, four published documents, then two independent freshness eligibility reads/parses. No pre-lock input content reads. Preserve the later observational migration scan instead of claiming one read for the whole operation. Connection parity retains two resolved edges, three unresolved occurrences in overview versus two deduplicated graph nodes. Focused lifecycle/publication/scanner/overview 56/56 passed.
- Independent GPT-6.1 Sol source reviews found no remaining actionable issues after correcting deferred migration eligibility; browser save/conflict/CSP/reference/map contracts and canonical publication guards retained. Actual final tarball validated 163 required files across 304 entries; eight additional independent omission tests cover extracted modules.
- Final integration: `npm test` rebuilt current source and passed **964 tests, 1 skipped, 0 failed (965 total)**; final package validation passed and `git diff --check` is clean. No installed-app readiness, physical-device coverage, or production recall latency claim. No commits, archive moves, personal/global memory writes, or deployment performed.

## Relevant files added

- `src/adapters/http-server/{document-controller,map-controller,reference-policy,browser-transport,browser-entry}.ts` and `browser.docs.md` — typed browser owners and contract.
- `src/core/document-id-format.ts` — browser-safe shared ID format; `src/app/local-memory/connections.ts` — shared graph connection collection.
- `integrations/macos-companion/lifecycle.py` — shared ownership/locking primitives.
- `scripts/browser-shell-test-helpers.mjs`, `test/browser-shell-helpers.js`, and `test/{canonical-work-reuse,playwright-runtime,reference-policy,uninstall-shell}.test.js` — direct behavior/counter and shared plumbing regressions.
