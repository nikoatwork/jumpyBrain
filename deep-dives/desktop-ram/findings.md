# Desktop RAM measurement — 2026-10-22

The installed jumpyBrain 0.3.3 desktop app used **371 MB median physical footprint** across all six processes during a 60-second observation. This is about **2.7× smaller than a 1 GB reference**, not an order of magnitude smaller. A 10× reduction requires at most 100 MB total; 100× requires 10 MB. Those thresholds require approximately 73% and 97% reductions from this observation.

## Evidence and scope

- macOS 15.7.7, arm64, 18 GiB RAM; installed app already running for about 2.5 hours. One renderer was present. No app interaction was driven during the measurement; the visible page, corpus size, foreground/background state and prior workload were not controlled.
- Thirteen samples at five-second intervals, 11:12:11–11:13:11 UTC. [Raw samples](2026-10-22-installed.json) contain process IDs, roles, byte counts and timestamps, without note content, credentials or command lines.
- Each sample discovers the main process's full descendant tree and sums `footprint --noCategories -f bytes` auxiliary `phys_footprint`. The sampled tree comprised Electron main, GPU, network utility, renderer, Swift host and Node gateway. No QMD/model child was observed at sample times; short-lived children between samples can be missed.
- Physical footprint: **361.7–378.3 MB**, median **370.7 MB** (353.5 MiB). Separately, summed `ps` RSS: **471.6–511.2 MB**, median **483.2 MB**. Decimal MB = 1,000,000 bytes throughout; GB reference = 1,000 MB.
- These are different metrics, not competing estimates of the same counter. RSS sums can include shared pages and are affected by compression. Electron also cautions about interpreting resident memory on macOS in its [memory API documentation](https://www.electronjs.org/docs/latest/api/process#processgetprocessmemoryinfo).
- Notion was not running and was not measured. The 1 GB reference comes from the user's observation, without matched workload or measurement method. This is not a comparative product benchmark.
- The installed artifact reports version 0.3.3. The repository was at `eb55463d7f59c4e9a5c9ba2c265e237e38f47d77` with unrelated uncommitted work; that revision is context, not proof of the installed binary's source identity. No rebuild, reinstall, app restart or changes to personal notes were made.

## Where the memory is

| Process | Median physical footprint | Implication |
| --- | ---: | --- |
| Node gateway/local engine | 162.6 MB | Largest measured component; exceeds the entire 100 MB stretch budget alone |
| GPU helper | 79.1 MB | Significant graphics allocation even in this observation |
| Electron main | 57.1 MB | Persistent desktop shell cost |
| Renderer | 53.9 MB | Editor/browser page cost |
| Swift host | 12.1 MB | Small relative to backend and Chromium |
| Network utility | 7.5 MB | Additional browser process |

Component medians need not sum exactly to the median of simultaneous totals. The GPU's OS-recorded lifetime peak was **432.4 MB**, predating this test; its cause and timing are unknown. Do not sum process lifetime peaks into a claimed app peak. The 378.3 MB maximum above is only the maximum sampled during this minute, not a startup, search, indexing or graph peak. A minute of observation cannot establish leak freedom.

## Interpretation and improvement candidates

High confidence: the current observed desktop session misses both magnitude targets. Both the backend and desktop shell need attention to reach 100 MB; removing the renderer alone would not be enough. A 10 MB full desktop target is not supported by these measurements and should not be promised.

Medium confidence as investigation priorities, unknown savings:

- Profile gateway heap/native allocations and imports before changing architecture. Determine whether its 163 MB is a cold baseline, transient scan allocation retained by the runtime, or retained application objects. Electron's [performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance) supports measuring module costs and deferring unnecessary loading; it does not establish the savings here.
- Current source `recentServerMemory` scans canonical documents and sorts candidates to return eight entries; `overviewMemory` loads all document metadata. `graphMemory` builds the graph before applying output limits, and `collectConnections` reads document contents again. These are concrete scaling/profiling candidates, not demonstrated causes of this installed process's footprint. Preserve freshness, duplicate-ID handling and canonical Markdown semantics when optimizing.
- Reproduce the GPU peak with graph navigation, window resizing, hide/minimize and close/reopen. Determine whether graph state/rendering resources are released when unused. Do not disable acceleration or force garbage collection by default on the strength of one sample.
- Measure background launch and last-window closure separately. Production already closes/destroys the editor window while keeping the host available; hiding a window and closing it are different states. Sleeping services must preserve save barriers, browser clients and local/remote availability contracts.
- If a measured optimized Electron build still cannot approach 100 MB, prototype a small native/WKWebView host using the same app/runtime/editor. Include all WebKit helper processes and keep it an experiment until memory, latency and lifecycle parity are measured. Sharing the OS web engine is not a guaranteed 10× saving.

## Reproduce

Find the main desktop PID in Activity Monitor or `ps` (not a renderer/helper), then run:

```sh
python3 deep-dives/desktop-ram/measure-macos.py MAIN_PID \
  --samples 13 --interval 5 --output /tmp/jumpybrain-ram.json
```

The sampler is read-only and does not drive workloads. It fails on missing/inaccessible process measurements rather than silently reporting a partial total. `footprint` inspection itself adds some observation overhead; the per-process counters are collected close together, not atomically. For workload benchmarks, add faster sampling and operation peak telemetry to catch brief child processes and allocation bursts.

Implemented changes and their limits are recorded in [the first iteration](first-iteration.md). Further work is tracked in [the RAM follow-up task](../../tasks/todo/tasks-desktop-ram-follow-up.md).
