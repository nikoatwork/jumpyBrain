# Independent retrieval experiments — 2026-10-28

All three requested prototypes were tested independently against the same unchanged runtime on 187 fictional pages / 104 tasks. **None is adopted.** Model reranking improves required-span coverage substantially, but loses previously sufficient evidence and exceeds the diagnostic operating-cost limits. This investigation does not establish answer accuracy.

## Paired scorecard

| Arm | Complete required spans after reads | Macro unit coverage | Initial complete | Total interaction tokens | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| unchanged baseline | 47/104 | 58.49% | 36/104 | 307,070 | frozen control |
| evidence bundles | 47/104 | 58.97% | 42/104 | 351,469 (+14.46%) | reject: no additional complete interaction, token gate fails |
| QMD rerank, up to 40 merged candidates | 65/104 | 72.28% | 49/104 | 301,377 (-1.85%) | reject: three complete-task losses, four unit losses, model costs |
| explicit metadata neighbors | 44/104 | 56.57% | 34/104 | 306,571 (-0.16%) | reject: source displacement, no affected-slice gains |

Two independent clean-root baseline runs have identical per-case non-timing scores and token costs. The first baseline completed before any arm comparison. Production `src/` remained unchanged throughout. Original v1 controls were retained and all gates were frozen in [EXPERIMENTS.md](../EXPERIMENTS.md) before outputs. These augmented numbers must not be compared to v1 as a product change: the indexed workload changed.

| Journey | Baseline | Evidence | Rerank | Neighbors |
| --- | ---: | ---: | ---: | ---: |
| navigation | 10/10 | 10/10 | 10/10 | 10/10 |
| discovery | 6/10 | 6/10 | 8/10 | 6/10 |
| orientation | 0/10 | 0/10 | 2/10 | 0/10 |
| rationale | 7/10 | 7/10 | 8/10 | 4/10 |
| current | 1/10 | 1/10 | 4/10 | 1/10 |
| historical | 6/10 | 6/10 | 6/10 | 6/10 |
| multi-source | 3/16 | 3/16 | 6/16 | 3/16 |
| limits | 1/10 | 1/10 | 5/10 | 1/10 |
| scope | 6/6 | 6/6 | 4/6 | 6/6 |
| ranking | 1/6 | 1/6 | 6/6 | 1/6 |
| protected | 6/6 | 6/6 | 6/6 | 6/6 |

## Mechanisms and source judgments

Evidence added original frontmatter and bounded heading/introduction spans to each verified passage, each with its true source coordinates. The real whole-passage packer charged and retained/dropped each bundle atomically. This improves initial alias/scope visibility, but the fixed first-three guarded reads already recovered all six scope tasks in the baseline. Estuary ranking gains its closed-inlet restriction without its observation instruction: partial improvement, not completion. A 14.46% token increase fails the predeclared <=5% allowance. No production packet field was added.

Reranking used the already provisioned QMD 2.8.3 `LlamaCpp.rerank(query, [{file,text}], options)` on up to 40 final merged grouped candidates, not merely the structured discovery branch. Title/snippet text was unchanged; exact navigation and constrained queries skipped reranking; temporal eligibility/chronological presentation and the same first-three expansion policy remained. Candidate diagnostics show useful sources inside the pool before reranking. The affected slice improves from 11/52 to 26/52 complete required-span tasks (+28.85 points); four fresh reserved tasks improve. Real improvements include Harbor's accepted scope plus explicitly unapproved later proposal, Orbit's venue hours plus operating restriction, and full Vellum/Bracken/Quartz handbook reads. But Harbor rationale loses its accepted reasoning, and Estuary/Mudlark and Saffron/Emberplate lose the entire alias-bound source. Cedar orientation loses a scope unit. These are source-checked failures irrespective of whether an answering agent could guess the right result. Aggregate gain cannot override the frozen no-evidence-loss gate.

Neighbors derived a generation-tagged projection from explicit `sources`, `supersedes` and `conflicts_with` metadata, using canonical target resolution. It seeded three direct hits, inspected at most six unique one-hop targets, reserved slots within the original candidate count, and used unchanged scoring/excerpts. The prototype deliberately excludes ordinary Markdown links, including body-only citation lists: this is the narrow metadata arm, not a test of every possible relationship policy. Newly admitted off-topic neighbors can outrank useful weak direct hits even with score zero because existing metadata/depth scores still apply. Lantern, Ridge and Mosaic rationale lose their research evidence; Harbor orientation loses its brief. The affected slice stays at 3/26. Ordinary links, bidirectional discovery or a new relationship ranking boost were not silently added after the loss.

Every recalled/expanded span was checked against canonical text/range/hash; all arms have zero observed provenance failures and response-budget violations. Same-author packet review inspected all identified coverage losses, changed required-source evidence and the fresh scope/ranking examples. Mechanical aggregate scores remain separate from query-bound support judgments; there is no independently adjudicated aggregate or evaluated answer agent. The observed complete-packet losses suffice to reject adoption without claiming all 65 reranked packets were independently judged correct.

## Local operating costs

Local Node 26.7.0, macOS arm64, Apple M3 Pro, pinned QMD 2.8.3. The lexical baseline/arms required no embedding model or paid API. Download and native-build paths were blocked. The provisioned reranker is `hf_ggml-org_qwen3-reranker-0.6b-q8_0.gguf` (exact bytes/hash in the freeze).

- Quality runs: baseline recall p95 1,328 ms; bundles 1,570 ms; rerank 4,517 ms; neighbors 1,573 ms. CPU process-tree peaks sampled every 500 ms: baseline 283.6 MiB, bundles 274.6 MiB, rerank 1,438.3 MiB, neighbors 272.4 MiB. These runs overlapped and are observational, not quiet-window passes or precise paired RSS deltas. GPU allocations are excluded.
- Explicit 20-candidate QMD probe: model-cold/OS-cache-unspecified Metal call 3,200 ms; two model-warm calls 1,302 and 1,291 ms. Process RSS after calls 1.55–1.61 GiB; `/usr/bin/time -l` maximum RSS 1,988,296,704 bytes. This smallest proposed pool already looks too expensive for the <=750 ms allowance.
- CPU-only probe (`QMD_LLAMA_GPU=off`): 6,469 ms cold, 5,811 ms warm, maximum RSS 2,134,081,536 bytes. The packaged CPU-specific binary was absent; QMD used its packaged backend with GPU offloading disabled. No source build occurred. These probes overlapped baseline quality work, so they are diagnostic observations, not final latency-gate measurements.
- Neighbor projection: 40 edges, 7,482 bytes, 3.08 ms generation/write beside a 1,097,728-byte SQLite index (~0.68% additional derived bytes). Initial lexical indexing observed 185.57 ms plus projection; no-op 117.52 ms. Incremental edit/rebuild costs and projection lifecycle in production were not measured because quality already failed.

No arm earned adoption, so no quiet-window acceptance, Linux/VPS capacity, combined-arm interaction, production cancellation/parity or model-service integration claim is made. Small pure regressions cover real disjoint citations, atomic budgets, ambiguous/unresolved links, bounded cycles/hubs/slots and constrained-query refusal. Losing machinery exists only in opt-in eval tooling, excluded from installation.

## Identity and reproduction

[Compact paired report](2026-10-28-experiments-v2.json) contains all per-case unit/completion/token differences and exact per-run hashes; [shared full runtime/input map](2026-10-28-experiments-v2.freeze.json) identifies the unchanged compiled product and final v2 tooling. The first baseline observer preceded a trailing-empty-line context citation fix and full candidate logging; its mutation-free scores exactly match the second baseline with the corrected observer. Original tooling snapshots are preserved in the raw archive, so this distinction is reproducible rather than hidden.

Run after the documented build/eval dependency setup:

```sh
npm run eval:workspace -- --suite augmented --arm baseline --modes lexical --repeats 1 --name v2-control
npm run eval:workspace -- --suite augmented --arm evidence --modes lexical --repeats 1 --name v2-evidence
npm run eval:workspace -- --suite augmented --arm rerank --modes lexical --rerank-model /absolute/provisioned/reranker.gguf --repeats 1 --name v2-rerank
npm run eval:workspace -- --suite augmented --arm neighbors --modes lexical --repeats 1 --name v2-neighbors
```

All fixtures are fictional; authored questions, evidence judgments and implementations share an author. New handbooks contain 566–596 words versus v1's 157–192, with shorter decisions/source/adversarial notes. This is varied, longer-section coverage, not a large-document/large-workspace claim. The new tasks still share four journey templates. Semantic-mode replication, independent human judgments, optimal follow-up selection, actual answers and broad deployment cost remain unmeasured.

A separate [cheap identity follow-up](../IDENTITY-EXPERIMENT.md) tests canonical metadata names with new confirmation workflows. Its results do not retroactively turn any of these three arms into a winner. Exact raw archive and repository verification are recorded in the finalized task lists.

Final raw archive: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/workspace-experiments-2026-10-28/2026-10-28-experiments-v2-v4.tar.gz` (SHA-256 `365705392392a41555cc2c5a45927c14c6202c282ed21bd1ab424f815bef82d7`). Final clean checks: 1,443/1,444 tests passed with one opt-in skip and zero failures; 8/8 real lifecycle/CLI parity checks; 514 package paths, 231 required validated, zero eval files shipped.
