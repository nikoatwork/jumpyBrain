# Graph topic exploration: scoped desktop diagnostic

Measured 2026-10-23 on Apple M3 Pro, 18 GiB RAM, macOS 15.7.7 arm64, Electron 44.8.0, Node 26.7.0 and QMD 2.8.3. Three changed-snapshot and three clean-HEAD baseline disposable 1,000-note runs completed; every sampled owned process tree drained on guarded quit. All 956 changed-snapshot and 959 baseline samples were complete, with zero rejected samples, and both suites passed post-run artifact/dependency fingerprint verification.

This is a short comparison of the old and new user defaults, **not an equal-node renderer experiment or the full desktop RAM acceptance program**. Two-second observation windows and five-second recovery do not establish long-term equilibrium, leak freedom or a general whole-app guarantee. The closed bounded [desktop RAM follow-up](../../tasks/done/2026-10-23_tasks-desktop-ram-follow-up.md) records broader semantic/model measurements and the explicitly deferred soak/host work.

## Snapshot and reproduction

- Changed-snapshot SHA-256: `798e3639e7b80c470afbbdb74bee06f49a3fddbad1ecf8b86d164a7b894073ba`.
- Baseline snapshot SHA-256: `2bab3cae677bd466b8428819a8764026762c48f35cbe8eb626e4d8e9ec8ed903`; runtime compiled from clean HEAD `da7f90d6b27bb952b06c59fc6d6018f7ffa09774`.
- Diagnostic driver SHA-256: `bc2a796585acf0d2208b9609caa7543be006e286bd4b8f2debd05cced87afbfa`.
- Raw changed suite, manifest, samples, per-stage telemetry, verification and summary: ignored repository-relative `.local-pack/graph-ram-2026-10-23-isolated2/`; baseline equivalents: `.local-pack/graph-ram-2026-10-23-baseline/`.
- Artifact composition: copied checkout `dist`, package metadata and Electron/companion code, plus the existing packed native helper. This is a source snapshot diagnostic, not the unmodified installed/release app. The installed app, default CLI root and user notes were not retargeted.
- Workload: 1,000 synthetic saved Markdown notes, including disconnected notes and unresolved references; the graph contained 1,090 nodes and 2,790 edges. At 1280 × 820 and display scale 2, the dense path used Canvas plus 40 accessible/focus overlay nodes. The driver exercised open, canonical save/reopen, graph pan/zoom/resize, graph exit, incremental lexical indexing/search, minimize/restore, close/reopen, short recovery and guarded quit.
- Automatic local maintenance was enabled, including its startup pass and post-save scheduling. Lexical search reported complete retrieval. The desktop comparison loaded no semantic model; no release was installed, and no forced production/diagnostic garbage collection was used.

The existing benchmark was run with `--counts 1000 --repetitions 3 --no-semantic --settle 2 --recovery 5`. Its copied diagnostic driver additionally supplied `updaterOptions.home` as a canonical temporary directory and disabled release discovery, removing unrelated updater socket/network activity from the workload. Temporary updater directories were removed on quit. The changed-snapshot command was:

```sh
node scripts/desktop-ram-benchmark.mjs \
  --output .local-pack/graph-ram-2026-10-23-isolated2 \
  --source .local-pack/graph-ram-2026-10-23/snapshot \
  --driver .local-pack/graph-ram-driver.mjs \
  --counts 1000 --repetitions 3 --no-semantic --settle 2 --recovery 5
node scripts/desktop-ram-report.mjs \
  --input .local-pack/graph-ram-2026-10-23-isolated2 \
  --output .local-pack/graph-ram-2026-10-23-isolated2/summary.json
```

For the baseline, `.local-pack/graph-ram-baseline-snapshot/` copied the changed source snapshot, then replaced only runtime `dist`, package metadata and companion `.mjs` modules with the clean-HEAD versions. It retained the identical native helper, Electron shell, driver, corpus/settings, external engines and machine. The baseline command used the same flags/driver, with `--source .local-pack/graph-ram-baseline-snapshot` and `--output .local-pack/graph-ram-2026-10-23-baseline`. Source differences include the expected compiled graph/index/browser modules, their browser bundle and build metadata. The baseline diagnostic build's license collector produced an empty license file when dependencies were symlinked; this does not affect runtime measurements and that artifact is not a release package.

The original driver and the first temporary-home attempt exited during cold startup without a workload result. Both are excluded; their raw folders are `.local-pack/graph-ram-2026-10-23/` and `.local-pack/graph-ram-2026-10-23-isolated/`. The production updater requires a separate canonical home/socket path for isolated diagnostics; the corrected driver made no production-source changes. All excluded attempts also ended with empty sampled owned trees.

## Whole-app measurements

Ranges below span the three per-run post-operation physical-footprint medians, in MiB (1,048,576 bytes), unless described as peaks:

- Cold background, with no editor window: **137–162 MiB**. Startup indexing overlapped this short window.
- Home: **464–483 MiB**.
- Graph pan/zoom/resize: **650–665 MiB**; the whole-run sampled peaks were **714–740 MiB**.
- Immediately after graph exit: **670–687 MiB**. Clearing the scene did not immediately return whole-app footprint to the home level.
- After subsequent lexical index/search stages: **504–521 MiB**.
- Minimized: **325–331 MiB**.
- Window closed while the service remained available: **225–230 MiB**.
- Five-second observation after reopening: **459–468 MiB**.

GPU-process charges dominate much of the variation: its graph-stage median was approximately 371–413 MiB, immediately after graph exit 412–433 MiB, and during reopened recovery 240–248 MiB. These are per-role medians, not a sum that reconstructs the whole-tree median. The gateway's graph/recovery median was approximately 112–120 MiB, while the renderer process was approximately 73–77 MiB during the graph and 37 MiB after reopen. Six persistent owned processes were typical with a window, five with it closed; short QMD workers were also observed. Guarded quit reached the first empty sampled owned tree after approximately 411–823 ms.

Graph navigation plus clicks, pan and three window resizes took 1.14–1.23 seconds in the driver. This aggregate operation is not an individual interaction-frame measurement. Canonical edit/save/reopen took 609–640 ms; lexical search 158–198 ms in this fixture. These short observations do not isolate maintenance/search lock contention or semantic inference latency.

## Comparison with the old defaults

The old graph returned **500 nodes and 946 edges**, while the changed graph returned **1,090 nodes and 2,790 edges**. Thus this compares the experience users receive by default on the same brain; it does not isolate renderer cost at equal coverage or establish a per-node memory ratio. The baseline also kept the old local `autoIndex:false` behavior, so startup/home differences include the newly delivered automatic maintenance.

Across the three baseline runs, graph-stage physical medians were **1,193–1,288 MiB**, versus **650–665 MiB** in the changed snapshot. The median of the three graph-stage medians was **1,224.9 → 655.0 MiB**, approximately **46.5% lower in this specific diagnostic**. Whole-run sampled peaks were **1,227–1,293 → 714–740 MiB**. All three changed graph-stage medians were below all three baseline graph-stage medians despite the expanded visible coverage. This supports the dense Canvas/focus-overlay path for this fixture; it is not a product-wide RAM savings claim.

Much of that difference appeared outside JavaScript heap: baseline graph-stage renderer-process physical medians were **174–186 MiB**, versus **73–77 MiB** changed, and GPU-process medians **864–957 MiB**, versus **371–413 MiB** changed. In the representative first repetition, DOM counters were **25,913 nodes / 6,283 listeners** baseline and **2,941 nodes / 300 listeners** changed. Baseline graph JavaScript heap was only **5.9–6.0 MiB**, versus **10.2–13.6 MiB** changed; the larger retained topology and different allocation timing make JavaScript heap alone a misleading whole-app comparison.

There is a measurable startup/home tradeoff: baseline cold-background physical medians were **102–103 MiB**, versus **137–162 MiB** changed; baseline home medians were **440–465 MiB**, versus **464–483 MiB** changed. The changed startup window included automatic index work, and the gateway's home median was approximately **80–85 MiB**, versus **55–60 MiB** baseline. This short sequence cannot establish a settled-idle regression or attribute every byte to the scheduler, but the additional background capability has a cost and should not be presented as free. Baseline five-second reopened recovery was **501–505 MiB**, versus **459–468 MiB** changed. Longer recovery and semantic-model behavior remain unmeasured here.

## Renderer and cleanup evidence

Renderer JavaScript heap was **10.2–13.6 MiB** at the graph stage, **10.3–13.7 MiB** just after graph exit, **3.7 MiB** after reopen and **3.9–4.0 MiB** after the five-second recovery. JavaScript heap is distinct from renderer physical footprint, GPU charges, gateway memory and whole-app RAM.

Graph exit removed all focus-overlay graph nodes, reset Canvas dimensions to 0 × 0 and left no layout timer running. The current bounded graph packet intentionally remained available for navigation restoration. Closing the window destroyed its renderer; reopening began with no retained graph nodes and reset the observed renderer listener count to 258. These observations confirm the intended short lifecycle behavior, but do not establish leak freedom over repeated long-lived navigation or eliminate allocator/compositor retention. The elevated immediate graph-exit footprint is a reason to preserve the broader recovery/soak work rather than infer instant RAM release from empty DOM/Canvas alone.

## Small background semantic-model and contention probe

A separate, narrower probe used **two disposable notes** and the already available **EmbeddingGemma 300M Q8_0 GGUF** model (333,590,944 bytes; SHA-256 `b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63`). File hashes before and after matched. No model was downloaded or personal memory root/index accessed. The runtime came from the same changed source snapshot identified above. Raw fixture, events, samples, results, model verification and derived stage summary are in ignored `.local-pack/graph-ram-semantic/`.

The seed index reported **added: 2, embedded: 2**, fresh lexical plus semantic readiness, and complete embedding coverage. After changing one note body, a host `notifyWrite()` signal scheduled the shared automatic incremental ensure workflow. This probe used a **100 ms quiet period**, not the production five-second default. Publication completed **1,722 ms after the signal**; the automatic runner's active interval was **1,624 ms**. It published `stale:false`, fresh lexical/semantic readiness and complete embeddings, and the newly added body-only token was subsequently found through the authenticated search protocol with complete retrieval. Exact background work counters were not retained by the runner logger, so no per-file vector-reuse count is asserted for this particular probe.

The 100 ms sampler recorded **69 complete samples, zero rejected samples**, with these observed owned **Node host plus QMD/native-model worker** peaks:

- Initial two-note semantic indexing: **504.5 MiB physical footprint**, **1,044.5 MiB RSS** (19 samples in that stage).
- Automatic repair of the one changed body: **411.0 MiB physical footprint**, **948.5 MiB RSS** (15 samples in the active-runner interval). The QMD Node worker itself contributed approximately **379.6 MiB** at the whole-tree peak.

These are process-tree diagnostics without Electron, the native desktop helper or browser/GPU; they must not be added mechanically to the desktop medians or interpreted as a semantic desktop total. The model executed inside QMD Node workers; no separate `llama` executable was observed. The tiny input does not characterize large embedding batches, other models, long-lived model caches or absolute peaks between samples.

A foreground semantic search began approximately 500 ms into the admitted background run while `isIndexing()` was true. It returned **HTTP 200, fresh/complete retrieval in 2,979.9 ms**; publication overlapped approximately the first 1.11 seconds of that request. A post-publication search for the new body-only token returned **HTTP 200, complete retrieval in 1,358.3 ms**. The queries differed and each includes model/query-worker costs, so this does not isolate lock-wait duration or prove a fixed contention penalty. It confirms that background semantic work can noticeably delay an interactive request; queued-work deferral does not preempt an already active model job.

Host shutdown completed, the sampler's final owned tree was empty, both probe and sampler exited with code zero, and the existing model fingerprint remained unchanged. No forced garbage collection was used. No additional probes followed this run.

## Limits

The source/driver/settings comparison is matched as described above, but visible coverage and automatic-maintenance behavior deliberately differ. Baseline runs followed the changed runs without randomized order; thermal/focus/OS-cache conditions were not fully controlled. Historical runs used different source/driver groups and longer observation windows and are not comparison controls. The desktop comparison covers one dense 1,000-note lexical corpus and one device. The separate two-note semantic probe supplies only a small model-work/overlap observation, not a full semantic desktop workload, a 10,000-note desktop run, long-lived browsing or sleep/wake behavior. The 100 ms libproc sampler is non-atomic, may miss shorter children, and measures kernel-attributed process charges rather than deduplicated system DRAM or an absolute peak. RSS is recorded separately in the raw summary and is not substituted for physical footprint.
