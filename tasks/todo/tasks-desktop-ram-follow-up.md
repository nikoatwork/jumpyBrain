# Desktop RAM — measured budgets and further reduction

## Goal

Finish matched whole-desktop acceptance for the first iteration, establish measured budgets, and select further improvements from evidence. Investigate 100 MB total settled physical footprint as a stretch target; neither 100 MB nor 10 MB is established. Do not claim a reduction against the unmatched Notion reference.

## Starting point

- User explicitly split the original full program into a shippable first iteration on 2026-10-22. See [completed iteration](../done/2026-10-22_tasks-desktop-ram-budget.md) and [results](../../deep-dives/desktop-ram/first-iteration.md).
- Implemented: fresh bounded metadata reads, smaller graph intermediates with bounded presentation hydration, hidden graph DOM/timer cleanup, and an index transport that honors the existing 610-second deadline.
- Validation: 1,105 tests passed, one skipped; desktop/mobile browser smoke passed. No persistent metadata cache, forced production GC, semantic downgrade, host migration or availability change.
- Twelve accepted baseline runs cover all four corpora with three repetitions, 15-second stage windows, five-minute recovery, explicit saves and complete descendant shutdown. [Reviewed baseline aggregates](../../deep-dives/desktop-ram/2026-10-22-workload-baseline.json) include identities and variance. They are **not** a matched optimization result.
- Diagnostic 10,000-note graph profiles show less transient allocation, not whole-desktop savings. Semantic indexing reached approximately 5.7–6.0 GB sampled whole-tree physical footprint in large baseline runs; model-active and idle budgets must be separate.
- Keep Electron for this iteration. The unsandboxed WKWebView pilot is incomplete evidence, and does not establish the 100 MB target or feature parity.

## Local handoff

Raw traces, synthetic roots, manifests and frozen snapshots remain ignored under `.local-pack/ram-work/`. They contain local paths/capabilities and must not be published wholesale. If absent on another machine, reproduce from the checked-in tools and [workload contract](../../deep-dives/desktop-ram/workload-baseline.md).

- Accepted smaller baseline: `baseline-v2/` (select only 0/100/1,000 notes); its failed 10,000-note run stays excluded. `baseline-small-summary.json` and post-run `verification.json` are valid.
- Accepted large baseline: `baseline-large-v4/`, summarized in `baseline-large-summary.json`. Its source includes the index transport fix, equally required in its optimized counterpart.
- Optimized snapshots: `optimized-snapshot/` for the exact smaller original driver; `optimized-index-fixed-snapshot/` for the corrected large driver. Source/driver pairings are in [identity evidence](../../deep-dives/desktop-ram/2026-10-22-source-diff.json).
- `optimized-small/` has two successful empty-corpus runs and is deliberately partial after the user's scope change; do not treat it as acceptance. Its `interruption.json` records the intentional stop after guarded quit and descendant drain. `run-full-v4.mjs`/`queue-v4.log` preserve the earlier queue, but do **not** rerun it blindly: its existing output directories are intentionally refused. Start new outputs and explicitly select the remaining work.
- Failed pan/editor-readiness/five-minute-fetch attempts remain excluded. The current default driver fixes both readiness and transport; `workload-v1.mjs` is an archival driver only.

## Tasks

- [ ] 1.0 Complete matched optimization acceptance.
  - [/] 1.1 Re-verify frozen source, exact driver, sampler, Electron/Node/QMD package, model and hardware identities before and after each suite. Use fresh outputs and roots; record focus, viewport/scale, power and machine pressure. Preflight and post-run identities passed for nine optimized 0/100/1,000-note runs and three new 1,000-note controls; large diagnostic suites' post-run checks are pending. External minute-level observations record foreground app, power and pressure; frozen drivers record viewport/scale.
  - [/] 1.2 Run optimized 0/100/1,000/10,000-note suites, three repetitions each, with lexical then complete semantic indexing/search, 15-second windows and five-minute recovery. Match each baseline protocol exactly, or regenerate both sides with the corrected default; never compare different drivers/transports as a RAM change. Nine optimized runs accepted through 1,000 notes, plus three new matched controls. Failed old-driver edit and 10,000-note default 600-second index timeout are excluded. A matched 900-second large diagnostic pair is running; it cannot establish default-deadline acceptance.
  - [/] 1.3 Compare whole-tree physical footprint, separate RSS, sampled active peaks, CPU and latency. Publish replicate ranges and limitations; avoid subtle savings claims where ranges overlap or GPU/focus noise dominates. [Reviewed partial results](../../deep-dives/desktop-ram/2026-10-23-follow-up.md) and [29 aggregate cells](../../deep-dives/desktop-ram/2026-10-23-comparison-0-100.json) cover 0/100 notes; [15 further cells](../../deep-dives/desktop-ram/2026-10-23-comparison-1000.json) cover 1,000 notes. Local graph-exit savings at 1,000 notes do not establish a general whole-desktop reduction. No budgets adopted.
  - [x] 1.4 Run the real-model cancellation probe and require every observed descendant to exit, lock cleanup and no first-generation publication. Preserve success/cancellation semantics and complete semantic retrieval. Passed 2026-10-23 on the frozen optimized runtime: observed worker at 681 MB, sampled tree drained approximately 105 ms after SIGTERM, lock removed and no first generation published. [Reviewed evidence](../../deep-dives/desktop-ram/2026-10-23-cancellation.json). Successful complete semantic retrieval remains required in 1.2.
- [ ] 2.0 Verify long-running lifecycle retention.
  - [ ] 2.1 Run the 30-minute navigation/edit/search/graph cycle; verify canonical saves, one live window, bounded graph packets, no hidden graph DOM/timers, stable worker/window counts and no orphan descendants.
  - [ ] 2.2 Inspect five-minute buckets, heap/DOM/listener trends and post-work recovery. Diagnose accumulation rather than declaring leak freedom from flat RSS. Fix and repeat only when evidence warrants it.
- [ ] 3.0 Explain graphics peaks and evaluate further loading changes.
  - [ ] 3.1 Run the separate memory-infra/GPU resize trace, record viewport/device scale/surface allocations, and relate sampled GPU peaks to graph exit, minimize and last-window close. Trace overhead excludes it from acceptance comparisons.
  - [ ] 3.2 Evaluate lazy editor/graph loading or retained assets only where whole-tree evidence supports a gain. Preserve drafts, camera/history and save/switch/quit barriers; report reopen latency.
  - [ ] 3.3 Investigate additional metadata/top-k/incremental approaches only if remaining profiles justify cache invalidation complexity. Preserve external edits, exclusions, duplicate-ID detection and exact graph omission/link semantics. Model work remains explicit and isolated; concurrency limits alone are not a RAM budget.
- [ ] 4.0 Decide whether another host merits a separate migration proposal.
  - [ ] 4.1 Compare the disposable WKWebView prototype with the exact optimized runtime/editor, three repetitions, including all responsibility-attributed WebKit/network/GPU XPCs. Match workload phases and disclose native API pan versus Electron pointer pan.
  - [ ] 4.2 Record memory/startup/reopen alongside editing, OS clipboard, sandbox/auth/TLS, Keychain, folder selection, background service, login/tray/update and save-barrier parity. The prototype is unsandboxed and lacks login/tray/update; reuse of helpers is not proof of exercised OS parity.
  - [ ] 4.3 Keep Electron unless evidence and parity justify a separately scoped migration. Do not suspend the live gateway without a proven browser-client admission/resumption boundary.
- [ ] 5.0 Adopt budgets and publish the completed result.
  - [ ] 5.1 Review per-corpus/per-stage settled and active-work limits for background, open UI, lexical and semantic modes from repeated optimized measurements; keep 100 MB as unproven if unsupported.
  - [ ] 5.2 Review generated variance allowances, then commit machine/model/workload-scoped budgets and run the regression guard. Require complete coverage, semantic readiness, artifact verification and descendant drain even when measured bytes are low.
  - [ ] 5.3 Publish reviewed comparisons and host/retention decisions. Update owning docs only for actual contract changes and the changelog only for a significant delivered result. Archive this list when complete.

## Progress — 2026-10-23

- Re-verified both accepted baseline suites and the interrupted optimized-small suite: source, driver, sampler, Electron, Node, QMD launcher/package and model identities all match. Both standalone optimized snapshots also match the checked-in source-diff hashes.
- The smaller optimized suite at ignored `.local-pack/ram-work/optimized-small-followup-2026-10-23/` completed six 0/100-note runs, then failed at the first 1,000-note edit. Its exact old driver can admit an editor before loaded/visible readiness; the marker never appeared in editor/canonical bytes. The failed run's sampler exited successfully with an empty observed tree. This attempt remains excluded. The six completed runs passed independent post-run artifact verification and selected `--counts 0,100` reports plus matched comparison guards.
- Machine observation: AC power, normal pressure at preflight, approximately 1.57 GB swap already used; the installed app remains running outside benchmark ownership. Focus, filesystem cache and unrelated user activity are not controlled. Raw machine/preflight records stay ignored under `.local-pack/ram-work/`.
- Measurements apply to the frozen first-iteration runtime; later product changes in the current checkout are outside this before/after comparison. Partial 0/100-note results show overlapping home/recovery ranges and higher optimized graph-exit memory, with semantic active peaks still around 5.3 GB. No whole-desktop reduction is demonstrated; the 100 MB target remains unsupported.
- Closed a regression-guard gap: budgets now reject missing/failed post-run artifact verification even below all byte thresholds. Comparison output also retains whole-stage RSS replicate medians/maxima separately from physical footprint. All 16 fixture/report/comparison tests pass, and `git diff --check` passes; this tooling change does not alter either frozen workload driver. These short tooling tests ran outside the owned benchmark tree during early empty-corpus recovery; retain the unrelated-load caveat.
- The first continuation queue stopped on the smaller-suite failure and never launched its large suite. Its failed state/log and first machine observations remain intact.
- The second queue completed all three new 1,000-note controls and all three optimized runs. Artifact, complete semantic retrieval, coverage and drain checks passed; reviewed evidence is linked above. Its first 10,000-note optimized run then hit the 600-second backend index deadline (approximately 600.02 seconds), with an empty observed process tree after shutdown. This failure remains excluded and the second queue is stopped.
- Active third queue: `.local-pack/ram-work/followup-large-queue-2026-10-23-v3.mjs`, tracked command session `14681`. It runs fresh `baseline-large-followup-2026-10-23-v3/` and `optimized-large-followup-2026-10-23-v3/` with identical benchmark-only 900-second backend, 910-second gateway and 950-second driver deadlines. [Protocol identities](../../deep-dives/desktop-ram/2026-10-23-extended-deadline-protocol.json) record modified frozen copies and driver; production defaults are unchanged. Keep this diagnostic pair separate from default-deadline acceptance. The command runner can surface completion/failure, unlike the earlier detached queue.
- Inspect `followup-2026-10-23-v3-queue-status.json`, `followup-2026-10-23-v3-queue.log` and `followup-machine-2026-10-23-v3.jsonl` in the ignored directory. Never start a duplicate while active. A failure stops the queue with its reason; proposed budgets are not adopted/published automatically. Review results and the failed default deadline before completing 1.1–1.3 or 5.1–5.2. Soak/GPU/native experiments remain outside this queue.


## Relevant files

- `scripts/desktop-ram-{fixtures,benchmark,app,report,compare,profile}.mjs` — deterministic fixtures, isolated workloads, diagnostics and tested report guards.
- `scripts/desktop-ram-{native,gpu,cancel}.mjs` — separate experimental probes; full acceptance remains pending.
- `deep-dives/desktop-ram/{sample-tree.c,NativePrototype.swift}` — macOS sampler and disposable native prototype, outside production runtime.
- `src/core/canonical/markdown-store.ts`, `src/app/local-memory/{graph,connections}.ts` — first-iteration scan/graph changes.
- `src/adapters/http-server/map-controller.ts`, `notes-browser.ts` — hidden graph cleanup with preserved state.
- `integrations/macos-companion/gateway.mjs` — explicit-deadline index forwarding.
