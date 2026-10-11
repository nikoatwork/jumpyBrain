# 4 — Bounded, responsive retrieval execution

## Goal

Keep a shared VPS responsive during retrieval and indexing by bounding backend execution, eliminating event-loop-blocking subprocess waits, and reducing repeated work. Change search effort only when measured evidence coverage supports it.

## Completion — 2026-10-11

Implemented one async QMD execution/admission path, request-local prefix reuse, runtime/CLI/HTTP cancellation and cancellation-safe joined indexing. Retained query counts/max fusion: effort comparisons lacked independent semantic evidence. Finalize/archive approved in the user request.

## Results and decisions

- Inventory: two `runQmd` call sites in `qmd-query.ts` (lexical/structured; dreams reuse lexical), plus separate synchronous Node workers in `qmd-lifecycle.ts` (index/recovery). All migrated to `runQmdChild`. Ticket 1 is complete; preserve its PID lock, transactional worker, pending recovery/readiness rather than parallelizing unsafe SQLite reads. CLI-only doctor version/update installer probes remain outside retrieval admission.
- Frozen defaults: 2 active operations/process, 1/real root, 16 queued and 16 joined index waiters; FIFO among runnable roots. Search/compact total 60 s, query command 30 s, index total 600 s; TERM/KILL grace 250 ms. Combined stdout/stderr caps retain 20 MiB/query, 64 MiB/worker. Only total search/index deadlines configurable; admission/lock waits consume the same budget. Overload/busy 503, timeout 504, connected abort 499; no query/credential/path diagnostics.
- Joined ownership: one cancellation detaches, last owner aborts; new callers wait for abandoned cleanup then retry. Rebuilds recheck ownership after awaits. Failure/cancellation invalidates remote freshness without manufacturing `lastWriteAt`, allowing auto-index retry. Root exclusion lasts through child close/publication cleanup. Shutdown destroys incomplete bodies; local CLI index/search/compact forwards SIGINT/SIGTERM.
- Prefix reuse reserves at most 4 MiB raw bytes/search (31 full 128 KiB+detection reservations), with bounded uncached overflow, preserved per-passage citations and QMD fallback. Decoded JS arrays/strings add overhead; no heap/invalidation guarantee. Canonical discovery/reads accept cancellation signals; multi-document reads are sequential, replacing unbounded `Promise.all`.

### External evaluation/resource evidence

Reused ticket 2's frozen judged **v1.0.0** (`5484dab8928f7dd4c009e032ab974c1c6140b4a8fc9bcfeb08e6b121aa9ebc82`), rubric, oracle-assisted recall+expansion accounting and **js-tiktoken 1.0.21 / cl100k_base**. Broad corpora/harnesses stay external:

- Baseline/reduced variants: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/bounded-execution-v1.tar.gz`, report in sibling `bounded-execution-v1/REPORT.md`. Precomparison gate: zero heldout evidence/reference loss; >=20% warm p50/p95 or invocation improvement; independent semantic-paraphrase non-regression before general effort adoption.
- Matched async replay: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/bounded-execution-postchange-v1.tar.gz`, SHA-256 `94dff6dc85f1cc6bb0022b3bb7a7b0428a1d9c010a01f043c64a5748b2ab7eb4`; sibling `bounded-execution-postchange-v1/REPORT.md`. Freeze SHA-256 `b04ed244d618a4be16d43d619a45da56c83769f4aabc2a65ffc656b68e5322fb`. Compiled snapshots identify tested builds; later CLI lifecycle/option/test/docs edits are verified separately, not silently included in the freeze.
- Target: macOS 15.7.7/Darwin 24.6 arm64, Apple M3 Pro, 11 logical CPUs, 18 GiB, Node 26.7.0, real QMD 2.8.3 (`facd35e`), lexical policy. No model downloaded/provisioned; **not VPS capacity evidence**.
- Same 14 questions, after-index n=14/arm, warm n=28/arm, rotated order. Contemporary baseline -> async after-index p50/p95 **264/772 -> 263/797 ms**; warm **264/766 -> 266/767 ms**. Warm launches **62 -> 62**; peak tree processes **3 -> 3**, sampled summed RSS **175.0 -> 174.7 MiB**. No ordinary latency/RSS improvement claim. QMD wrapper has a worker: invocation admission is not an OS-PID cap.
- "Cold" is first-after-index only: indexing warms caches. **Disk/model-cold remains unmeasured.** Warm maximum 5-ms timer lag **720.3 -> 13.8 ms**. Actual HTTP health p95 under real long-note search **766.2 -> 0.853 ms**; real index worker externally delayed 600 ms **676.3 -> 0.985 ms**. Controlled loopback responsiveness, not SLA/load sizing; unequal health sample cardinalities and noisy initial fetch probe retained in report.
- Baseline/cap2/cap1/async each retain **28/28 required labels, 14/14 supported decisions**. Async's **22 responses byte-identical**, **21,695 bytes / 6,536 tokens**, 8 follow-ups, zero cap violations. Reduced arms use matched maximum candidate/output caps, exact/negative/abstention qualifications and unchanged max fusion. Cap2 reduced launches 29%, cap1 55%, but short/mirrored lexical suite lacks semantic/paraphrase/independent generated-answer judgments. **No changed effort defaults**; no reranker experiment warranted. Semantic non-regression was not established.
- Real 60,090-byte note, eight identical QMD windows: **8 -> 1 prefix opens**, **480,720 -> 60,090 bytes** (87.5% less prefix I/O), identical passages/output. Compact ID verification remains separate debt (320 full reads/627,160 bytes across small suite).

### Verification and limits

Deterministic tests cover hung/overflow/crash/spawn/malformed output, operation/queued deadlines, saturation/FIFO/root exclusion, abort/tree cleanup/listeners, bounded prefix reuse, health/recent during slow search/index, incomplete-body shutdown, local/remote errors, joined ownership/retry/rebuilds, interrupted freshness and CLI SIGTERM. Review corrected abandoned-job cancellation, simultaneous rebuild races, remote freshness invalidation and discovery/shutdown gaps. Final review also verified ordinary wrapper exits clean same-group descendants and server close drains disconnected handlers until owned-child cleanup; both have explicit regression fixtures.

Final `npm test`: **755/755 passed**, 0 failures/skips; `git diff --check` passed. Focused execution suite: **15/15 passed** after final cleanup review. Initial runs caught Node fixture auto-discovery and internal option-shape assertions; fixtures now use explicit `.fixture` execution and lifecycle-signal assertions without wire changes.

Tested macOS POSIX lifecycle; Windows direct-child termination, Linux process groups, real semantic inference under saturation, representative VPS concurrency, disk/model-cold and abrupt parent SIGKILL remain untested. Escaped groups, OS-uninterruptible I/O and synchronous JS parsing cannot be preempted. Canonical snapshots/compact ID scans remain unbounded input/heap work. Publication is awaited, never detached; no universal speed/smallest-VPS claim.

### Complexity review

Removed both blocking retrieval/index runners; consolidated capture/deadlines/termination/FIFO admission into one QMD-specific module, not a job framework. Removed cached per-candidate/fallback prefix rereads and unbounded parallel canonical reads. New machinery: one adapter runner, request-local prefix map and explicit index-caller ownership scopes, justified by responsiveness/resource/failure regressions. Existing PID lock remains required cross-process compatibility; coalescing shares index work; transport/body timeouts bound distinct network stages, not duplicated backend retries. No new dependency, broker, daemon, cross-request cache, reranker or effort knob; losing variants exist only in external comparison artifacts. Retained debt: CLI doctor/update probes, unbounded input/ID scans, platform-limited descendants and external filesystem races.

## Notes

- Approved for planning on 2026-10-10. Direction: [product vision](../../docs/product-vision.md); evidence: [retrieval review](../../deep-dives/retrieval-product-review/findings.md#4-bound-backend-latency-before-adding-smarter-ranking).
- Coordinate the subprocess seam early with [ticket 1](../done/2026-10-10_tasks-semantic-index-reliability.md); integrate against its indexing isolation and failure/readiness contracts. Quality comparisons use [ticket 2](../done/2026-10-11_tasks-budgeted-recall-and-expansion.md)'s output accounting when available.
- Baseline search ran up to eight lexical calls, one structured query, and two dream supplements synchronously without timeouts. Those counts are preserved under the bounded async runner.
- This ticket owns execution/admission control and per-request read reuse. It does not duplicate public-demo IP rate limits in [sandbox hardening](../todo/tasks-public-sandbox-hardening.md).
- Keep existing max fusion and relevance policy as the baseline. Retrieval depth describes evidence shape, not compute spend. No new broker, daemon, mandatory reranker, or external cache.
- Reuse ticket 2's external versioned judged suite and interaction accounting, adding resource measurements instead of another quality harness. Freeze suite/configuration versions and adoption thresholds before final comparisons.

## Bigger picture and simplification

- Optimize the whole local/shared memory system: correct evidence per token, temporal trust, responsiveness, and easy operation—not feature count.
- Give explicit credit for fewer independent code paths, duplicated policies, configuration knobs, dependencies, and maintenance steps. Prefer replacing obsolete machinery to layering another system beside it; no arbitrary lines-deleted target or unrelated cleanup campaign.
- Preserve supported contracts, recovery, security, and useful regression coverage. Remove genuinely dead code and stale docs; do not call a safety check or necessary compatibility path dead without checking callers.

## Acceptance criteria

- Completion includes a short complexity review: what was removed/consolidated, what new machinery remains and why, and any retained compatibility debt. Added complexity must earn its place by meeting the goal; net simplification is a positive outcome alongside correctness and efficiency.
- QMD execution no longer synchronously blocks the server event loop. Health and unrelated lightweight requests remain serviceable during a slow search/index fixture.
- Each operation has a finite total deadline, bounded output capture, bounded active subprocesses/queue, and deterministic overload behavior. Indexing may have a separately configured longer deadline.
- Timeout, client disconnect, shutdown, and cancellation release queued work and terminate owned children safely; canceling one joined index caller must not kill work needed by others.
- Search/index concurrency respects the QMD snapshot/locking contract; scheduling cannot corrupt derived state or mark an interrupted index fresh.
- Fan-out/reranking changes ship only with measured quality/cost evidence; reliability improvements can ship while retaining current query counts and fusion.

## Relevant files

- `src/adapters/qmd/{qmd-cli,qmd-query,qmd-driver,qmd-snippets}.ts` — subprocesses, fan-out, repeated reads.
- `src/app/local-memory/`, `src/app/server-memory/auto-index.ts` — orchestration, joined index jobs and freshness.
- `src/adapters/http-server/{index,routes}.ts`, `src/adapters/http-client/index.ts` — request lifecycle, cancellation and safe errors.
- `src/server/config.ts`, CLI/runtime option seams — configuration/deadline propagation.
- `test/server-auto-index.test.js`, `test/server-http.test.js`, `test/recall-fusion.test.js`, `test/recall-excerpts.test.js` — regression seams.

## Tasks

- [x] 1.0 Set execution/resource budgets
  - [x] 1.1 Read architecture/affected docs and inventory every `runQmd` caller. Coordinate the async signature and index isolation seam with ticket 1 before overlapping edits.
  - [x] 1.2 Measure subprocess counts, cold/warm timings, source-read duplication, and event-loop responsiveness using disposable fixtures; select conservative defaults, not an unverified VPS sizing promise.
  - [x] 1.3 Define request-wide versus per-command deadlines, maximum output bytes, process-wide/per-root concurrency, queue bounds, and overload/cancellation results. Include separate indexing limits and starvation prevention.

- [x] 2.0 Replace blocking execution safely
  - [x] 2.1 Use bounded asynchronous child processes without shell interpolation. Preserve binary/environment isolation and existing buffer protections; normalize spawn, exit, malformed-output, timeout, and abort failures.
  - [x] 2.2 Add finite admission control for all expensive QMD work, including indexing. Reuse the existing index coalescing behavior; do not parallelize unsafe operations against one derived database.
  - [x] 2.3 Propagate cancellation through app/runtime/HTTP boundaries without importing HTTP into core/app. Clean up timers/listeners/children after success or failure and on server shutdown; define portable child termination behavior.
  - [x] 2.4 Preserve ticket 1's truthful fallback/readiness outcomes and freshness on interrupted indexing. Keep diagnostics compact and free of query bodies, credentials, and server filesystem paths.

- [x] 3.0 Remove redundant work and evaluate search effort
  - [x] 3.1 Cache bounded canonical prefixes per request so multiple candidate passages do not reread the same file. Bound total cached bytes and preserve per-passage citations/fallback behavior; add no cross-request invalidation system.
  - [x] 3.2 Compare existing fan-out with fewer/demand-driven lexical variants at matched candidate/output budgets. Keep exact-title, negative-evidence, and semantic paraphrase cases; heuristic confidence is not a calibrated probability.
  - [x] 3.3 Retain max fusion unless independent evidence justifies a separate change. Optionally test an existing supported QMD reranker on a small capped candidate set only if residual errors warrant it; do not make reranking necessary to complete this ticket.
  - [x] 3.4 Adopt changed effort defaults only when the external judged evaluation shows acceptable evidence coverage and improved latency/resource use; otherwise ship execution safety alone and record the no-change decision.

- [x] 4.0 Stress failure paths and document limits
  - [x] 4.1 Add deterministic slow/hung/overproducing/crashing child fixtures covering queue saturation, deadline exhaustion across multiple calls, request abort, shutdown, and owned-child cleanup.
  - [x] 4.2 Verify health responsiveness, bounded process counts, no listener/timer leaks, index/read isolation, joined-caller cancellation, and consistent local/remote errors. Avoid flaky wall-clock-only assertions where injected controls suffice.
  - [x] 4.3 Record cold/warm p50/p95, peak memory/process counts, and evidence coverage on an explicitly provisioned target; keep performance harnesses/private corpora external and avoid universal speed claims.
  - [x] 4.4 Update QMD/server/CLI owning docs, configuration and VPS limits; run `npm test` and record untested OS/process-lifecycle behavior here.
  - [x] 4.5 Remove the replaced synchronous runner and duplicate timeout/retry/queue machinery once all callers migrate. Keep one bounded execution mechanism with explicit search/index policies, not a generic job framework; delete losing fan-out/reranker experiments and unused knobs. Record the complexity review and rerun affected tests after cleanup.
