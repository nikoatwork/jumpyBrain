# Graph topic exploration — measured choices

2026-10-23. Disposable synthetic brains only. Markdown remains canonical; graph/index state remains rebuildable.

## Browser snapshots and method

The baseline was rebuilt in an isolated checkout of `da7f90d`, build `ef97cc64f0190dc6`. The optimized graph build is `14598887705f8ca5`. Both use the same recorded driver SHA, Node, Apple M3 Pro/18 GiB machine, Chromium 156 and 1280×844 viewport. Raw [baseline](baseline.json) and [optimized](optimized.json) contain build/bundle fingerprints and three repetitions for each corpus. [The guarded report](report.json) records the comparison.

The driver assembles a real canonical graph with a 10,000-node requested limit, then supplies that packet to the production browser shell. Thus it exercises larger old-renderer scenes rather than comparing 500 old nodes with 10,000 new nodes. Corpus sizes count existing notes; missing-title targets add unresolved nodes at smaller sizes. Scene updates and eight anchored zoom frames are measured separately. The new Canvas paint is frame-deferred; synchronous update time alone is not a painting comparison. Frame intervals include browser scheduling and rendering, not just JavaScript.

| Notes | Returned nodes | Old/new SVG descendants | Old zoom frame range | New zoom frame range | New renderer JS heap range |
| --- | --- | --- | --- | --- | --- |
|100|105|1,128 / 598|2.6–17.4ms|3.7–18.9ms|4.7–5.4MiB|
|500|524|5,796 / 536|11.2–57.8ms|8.6–18.8ms|7.0–9.2MiB|
|1,650|1,728|19,206 / 581|35.3–206.8ms|11.9–19.9ms|11.1–16.9MiB|
|10,000|10,000|112,200 / 581|236.1–844.2ms|21.2–86.8ms|66.7–67.4MiB|

Median backend assembly was 274.6→177.2ms for 1,650 notes and 2,092.9→1,316.0ms for 10,000. The lean packet skips snippet rereads/stat fallbacks; metadata and link discovery still scan canonical input. There is no persistent server graph cache. The final implementation propagates request cancellation into canonical scanning and asynchronous link/snippet reads, so superseded scans stop cooperatively. Synchronous parsing and OS-uninterruptible I/O remain nonpreemptible. A 10,000-note first frame still exceeded the original 50ms aspiration; subsequent stress frames were 21–37ms. This is a scoped improvement, not universal smoothness or a semantic-search latency result.

## Adopted scope and budgets

- Keep the compatible API default at 500 nodes. The browser explicitly requests up to 10,000 nodes/20,000 edges, with an 11MiB whole-record budget that conservatively counts UTF-8 bytes and actual HTTP pretty-print indentation. Preserve truncation metadata, expose details on demand, and keep the companion's 16MiB decoded-response ceiling.
- Keep up to 60 ranked direct topic matches plus 60 one-hop context notes; preserve explicit edges, recent writes, canonical IDs and configured retrieval readiness. Shared search can still return a bounded/incomplete candidate set; loading all graph notes does not prove exhaustive topic retrieval.
- Use keyed SVG through 250 nodes; dense views use Canvas plus a small SVG label/focus layer. The backing store is at most 4 million pixels with device scale≤1.5 (approximately 16MB raw RGBA for one store; browser/GPU buffers are additional). No continuously running simulation, worker, graph database or new runtime dependency.
- Fixed 12px, two-line labels use screen geometry, priority and collision grids. Max label candidates/accepted labels depend on viewport area; text measurements retain at most roughly 12,000 strings. A topic has a readable initial layout, then surviving identities retain positions. Manual camera changes survive refinement; automatic clear restores overview.
- Adopt reference-fixture renderer heap ceilings 32MiB through 1,650 notes and 96MiB at 10,000; at most 1,500 SVG descendants in measured scenes; 33ms sampled frames for ordinary fixtures, 100ms first/40ms subsequent stress frames, and 50ms synchronous scene update. These are narrow regression limits on the recorded reference setup, not an app-wide RAM or arbitrary-device promise.
- Hidden scenes must have zero SVG descendants and a released Canvas store. Every diagnostic run passed this check. Scope change also clears retained node metadata/topology; bounded graph packets/positions remain for same-brain Back navigation only.

Reproduce with `npm run build`, then `npx --package=playwright node scripts/graph-exploration-benchmark.mjs --output /tmp/optimized.json`. Validate against a matched baseline with `node scripts/graph-exploration-report.mjs baseline.json /tmp/optimized.json /tmp/report.json`. The report rejects mismatched driver/browser/machine identity, missing repetitions and scoped budget regressions.

## Memory and maintenance limits

The renderer heap is modest at the reported brain size, but it is **not total RAM**. Node+Playwright driver RSS ranged 285–312MiB at 1,650 and 505–841MiB during the repeated 10,000-note workload, compared with 250–329MiB and 275–374MiB baseline respectively. The process includes canonical assembly, packet serialization, Playwright transport and allocation/GC churn. No explicit GC was forced; these samples neither prove a leak nor establish server-only/desktop savings. The larger stress path does not get a memory-reduction claim.

Host-owned maintenance uses a 1s startup check, 5s quiet period, 30s maximum scheduling deferral, 5min canonical reconciliation and bounded retry backoff. Only one automatic tick/job is active per brain; repeated signals coalesce. A browser observes status serially every 10s only while graph/search is visible, with a 5s read deadline. Quiet dialogs suspend observation and closing them schedules the next check. A confirmed fresh generation reissues the visible current query once; browser reads do not issue index mutations or expand remote permissions.

Thirty seconds bounds queued scheduling, not indexing completion. Already-active semantic indexing retains the existing QMD lock and cannot be preempted by interactive search. Model CPU/RAM, downloads/configuration and large-corpus embedding remain separate from idle renderer budgets; incremental maintenance preserves existing semantic policy and does not silently switch retrieval engines. The existing [desktop RAM follow-up](../../tasks/todo/tasks-desktop-ram-follow-up.md) owns broader matched whole-app/model budgets and long-duration leak investigations.

## Verification scope

Final runtime build `14598887705f8ca5`: `npm run build` passed, with a 170,876-byte gzip browser bundle. `node --test` completed 1,198 tests: 1,197 passed, one skipped, zero failures. Graph/editor, graph-warning, 1,650-note topic and companion browser smokes passed. The final browser benchmark above uses this same runtime build. Native desktop/model probes use the separately fingerprinted earlier implementation snapshot in their report; later changes refine topic spacing/camera, pointer/dialog lifecycle, cancellation and conservative wire-byte accounting.

- Full Node suite, including canonical graph, isolated index maintenance, protocol/auth, semantic-policy, read-only, save-barrier and scope tests.
- Production graph/editor and warning smokes preserve save recovery, history/camera/focus and missing-target behavior.
- New 1,650-note production smoke covers first-letter search, direct/context links, sparse readable titles, fixed-size labels under zoom, both themes at 1280/390/320px, physical pointer/keyboard activation in Chromium automation, cancelled pointer streams, actual external body edits becoming searchable through background publication, and hidden DOM/Canvas cleanup.
- Deterministic pure-policy tests cover all 12 desktop / 6 narrow sparse labels, collision/edge bounds, zoom disclosure, stable coordinates and 10,000-node stack safety. Scheduler/observer clocks cover bursts, continuous activity/max deferral, retries, read deadlines, ignored aborts, publication races and brain changes.

Screenshots were visually inspected locally. Physical touch/IME, assistive technologies, Safari/Firefox, OS sleep/wake timing, arbitrary remote latency, adversarial corpus input sizes and large-corpus/other-model memory profiles remain outside these automated claims. A separate two-note existing-model background-refresh/foreground-search probe is recorded in the desktop findings; its tiny corpus is not a semantic desktop budget. The [six-run desktop default-view comparison](desktop-findings.md) records650–665MiB graph-stage physical footprint versus1,193–1,288MiB baseline at one1,000-note fixture, with expanded visible coverage and explicit startup/home tradeoffs. It does not replace the full RAM acceptance program.
