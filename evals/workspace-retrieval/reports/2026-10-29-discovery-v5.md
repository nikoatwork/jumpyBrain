# Named-source discovery and bounded ordering — adopted for lexical retrieval

The declared combined arm passes the frozen quality, context and local cost gates. Its production port reproduces all 140 cases' serialized recall/read responses and requests exactly. **Discovery alone is rejected**: admitting missing sources does not by itself make them visible.

## Paired evidence results

All arms use the same 225 fictional pages / 140 tasks, five compact results and at most three guarded reads. These are canonical source-specific required-span diagnostics, not autonomous answer accuracy.

| Arm | Complete after reads | Macro unit coverage | Initially complete | Fresh complete | Interaction tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| unchanged control | 70/140 | 62.62% | 58/140 | 9/16 | 401,780 |
| discovery only | 70/140 | 62.62% | 58/140 | 9/16 | 401,975 (+0.049%) |
| discovery + fixed identity ordering | 89/140 | 73.69% | 69/140 | 11/16 | 406,266 (+1.117%) |
| production port | 89/140 | 73.69% | 69/140 | 11/16 | 406,266 (+1.117%) |

Two clean control roots reproduce every non-timing case score, source selection, admission diagnostic and cost exactly. The affected orientation/current/multi-source/rationale slice improves 23/70 → 37/70 (+20 percentage points). The combination gains two fresh complete tasks, loses no complete task, unit label or individual required clause, and has zero observed provenance or response-budget failures. All arms use 384 follow-up reads. Separate rich-search required-source coverage at ten is 72.50% → 72.86% → 80.00%; actual human search/open behavior remains unmeasured.

The [pre-output contract](../DISCOVERY-EXPERIMENT.md) and both unchanged eval policies were frozen before new outputs. All 124 earlier tasks remain seen controls. A separate agent authored 15 fresh pages / 16 tasks across a seed exchange, oral-history collection and water watch; it inspected no retrieval outputs. No policy, source, expected clause or threshold was tuned after outputs. The two new passing tasks now become seen too. The earlier identity-only rejection remains valid; this investigation tests a separately declared combination. There is no identity-only v5 arm, so its gains cannot all be attributed to discovery.

## Admission, ordering and source judgments

Both discovery arms add 339 compact candidates across 65 calls, at most eight per call, with zero original-candidate evictions. They admit 26 previously absent required-source occurrences, all surviving canonical repair/grouping. Across displayed required sources, the combination adds 27 exposures and removes none. Fifteen already exposed sources gain full guarded reads without losing previously displayed text.

- **Fresh Patchbay orientation:** neither required source entered the compact control pool. The combination supplies the collection's purpose and Milo's steward role with appointment-only listening and the exclusions on downloads/promotional clips. This is substantive missing evidence recovered through admission and ordering.
- **Fresh Millrace orientation:** the introduction was already in the control pool but was not displayed. The combination supplies the community benefit and Sana's coordinator role beside checked escalation and the limit on evacuation authority. This is an ordering gain within the combined mechanism.
- **Old Belltower/Copperfin/Mothlight misses:** all three briefs now enter both admission arms. Belltower's compact rank 39 falls inside the unchanged forty-result ordering window and becomes visible. Copperfin and Mothlight rank 42 and remain undisplayed. Their purpose and coordinator gaps persist; the window was not widened on these results.
- **Fresh Wrenfall orientation:** its charter is selected fourth, but the excerpt omits purpose/steward and the fixed first-three reads miss it. Admission/selection alone is insufficient.
- **Remaining conservative bypasses:** Patchbay master and Millrace log include natural-language `not`; Relay ambiguity includes `river-watch`. Existing constraint detection bypasses supplementation and their packets remain empty. Relay therefore provides a no-regression control, not successful live shared-alias retrieval. A separate deterministic test covers shared aliases without constrained syntax. Two-stewards recognizes multiple names and retains its missing explicit Millrace coordinator evidence.

A reviewer who authored neither policy nor fixture inspected all 19 newly complete packets, five other unit-change cases, every required phrase across all 140 paired packets, and all required-source exposure changes. Fresh gains retain named subjects, permissions and uncertainty. Handbook/scheduling gains retain their operating restrictions. **Ledger rationale was already answerable from its control decision and brief** despite lacking a gold research source; its score gain is additional required-source coverage. Some fresh gold also demands a specific source where another page repeats the rationale. Keep these conservative source-specific scores separate from claims about answerability. Different agents in one model-assisted process are not independent human adjudicators.

## Production behavior and local costs

Core owns pure literal title-prefix/alias recognition and metadata matching. The QMD adapter adds up to eight missing matching files at score zero before existing source repair, then stable-partitions matches within the first forty grouped results before diversity/output limits. Existing candidates survive. No extra QMD/model call, index, body-wide scan or response budget is added. A shared alias can match several unrelated sources; names never establish authority or current truth.

The production path runs when no compatible ready semantic model is selected. Constraints, exact-title navigation, explicit temporal options and multiple recognized names retain conservative bypasses. Semantic-ready selection is covered by deterministic integration tests; semantic quality replication is not claimed.

Two quiet local probes warmed six fixed queries and ran twenty alternating pairs on macOS arm64 / Apple M3 Pro, Node 26.7.0, QMD 2.8.3, model-free lexical storage:

| Probe | Control recall p95 | Combined/production p95 | Change | Sampled CPU RSS delta |
| --- | ---: | ---: | ---: | ---: |
| frozen experiment | 1,281.40 ms | 1,281.65 ms | +0.020% | +1.75 MiB |
| actual production port | 1,267.66 ms | 1,285.87 ms | +1.437% | −1.23 MiB |

Both pass <=10% p95 / <=50 MiB extra sampled CPU process-tree RSS. The negative second RSS observation is not evidence of memory savings. OS caches were not flushed; GPU allocations are excluded. Quality and production-parity timings overlapped other runs/checks and are observational. There is no Linux/VPS capacity claim. [Timing records](2026-10-29-discovery-timing.json) retain all pairs and script hashes; the production probe is preserved in the raw archive.

## Verification and reproduction

- Production port: all 140 per-case non-timing scores/costs/source files and all serialized recall/read responses/requests exactly match the frozen combined arm. The control runtime has source/compiled digest `85fd239fee6015dc83bee0f08447fdb0c342dbf88150df3f5ab51398b5a4cb08`; the isolated production snapshot is `7debe8e4a15f5086deb67d823b19d17d27f95a739f8140dab40e3f2d1ff585b7`. All final TypeScript/compiled bytes match that snapshot; one adapter-documentation clarification followed its freeze. The production snapshot also includes already committed UI work absent from the historical control.
- Final `npm test`: 1,462 tests, 1,461 passed, one opt-in skip, zero failures (134.522 s). New policy/adapter/comparison checks pass; the full suite includes architecture, temporal, semantic, read-only and cancellation regressions.
- Nine real lifecycle/transport checks pass: runtime/local-CLI/hosted-CLI parity including named introduction recall, edit/stale handle, incremental repair, rename, deletion and derived-state rebuild. Hosted transport is authenticated localhost. The offline guard allows loopback fetch with redirects refused and keeps external downloads/model resolution blocked.
- Package dry run: 516 paths, all 231 required files validated, zero eval files shipped. No version bump, installation, push or release.
- Operational failures are retained: initial new fixture assertions assumed raw scores instead of existing reciprocal-rank floors and were corrected; an early smoke launch raced the build's replacement of `dist`; its next attempt used a guard that also denied loopback HTTP. Neither smoke attempt is counted as passing. The corrected guarded run passes all nine checks.

```sh
npm run eval:workspace -- --suite discovery-confirmation --arm baseline --runtime-root /absolute/original-runtime --repeats 2 --name discovery-v5-control
npm run eval:workspace -- --suite discovery-confirmation --arm discovery --runtime-root /absolute/original-runtime --repeats 1 --name discovery-v5-only
npm run eval:workspace -- --suite discovery-confirmation --arm discovery-identity --runtime-root /absolute/original-runtime --repeats 1 --name discovery-v5-ordered
npm run eval:workspace -- --suite discovery-confirmation --arm baseline --runtime-root /absolute/production-runtime --repeats 1 --name discovery-v5-production
```

`baseline` on the production snapshot observes its default behavior; it does not turn the new policy off. Use the archived original runtime for the unchanged control. Provision build/eval dependencies and QMD explicitly as described in [the guide](../README.md). Downloads/native source builds are blocked during quality execution. [Compact per-case deltas](2026-10-29-discovery-v5.json) and [full input/runtime identities](2026-10-29-discovery-v5.freeze.json) identify the exact snapshots; complete packets, scripts and failed attempts remain externally archived.

All data is small and fictional. Fresh introductions still put purpose/steward together in the opening paragraph under a canonical-name title; pages are hundreds of words. This is a measured improvement on that authored pattern, not broad named-entity generalization, exhaustive source discovery, optimal follow-up selection, independent answer/abstention accuracy, human usability or large-workspace efficiency. The broader evaluation task stays active.

Final external raw archive: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/workspace-discovery-2026-10-29/2026-10-29-discovery-v5.tar.gz` (18,158,307 bytes), SHA-256 `6e81188f726ce71d00ab6788043052888d74993d14718b5955b96124c48f86d2`. Rebuildable memory/SQLite roots are excluded; exact frozen input bytes and both runtime snapshots are included.
