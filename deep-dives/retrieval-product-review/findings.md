# Lean retrieval and shared-deployment review

Reviewed 2026-10-10 against commit `7580f13`. This remains a research snapshot; product direction lives in [the vision](../../docs/product-vision.md). The user subsequently approved creating the five follow-up tickets below; their task lists own execution scope and status.

## Follow-up tickets

1. [Reliable, incremental semantic indexing](../../tasks/done/2026-10-10_tasks-semantic-index-reliability.md)
2. [Budgeted recall and precise evidence expansion](../../tasks/done/2026-10-11_tasks-budgeted-recall-and-expansion.md)
3. [Explicit temporal retrieval and evidence integrity](../../tasks/done/2026-10-11_tasks-temporal-retrieval-correctness.md)
4. [Bounded, responsive retrieval execution](../../tasks/done/2026-10-11_tasks-bounded-retrieval-execution.md)
5. [Evidence-gated contextual indexing](../../tasks/done/2026-10-24_tasks-contextual-indexing-evaluation.md)

Default execution order is 1 → 2 → 3 → 4 → 5. Tickets 2 and the processing repairs in 3 can start independently; coordinate the shared QMD execution seam between 1 and 4. Ticket 5 is deliberately evidence-gated and may conclude with no production change. Deployment/companion fixes are not bundled into these retrieval tickets.

## Bottom line

Keep the architecture. The largest likely gains are incremental indexing, honest backend status, budgeted evidence with selective expansion, and explicit temporal selection. Do not replace Markdown/QMD with a graph platform or add a mandatory model planner.

A trusted team can use the source/systemd VPS path now, with the Mac browser and remote CLI. The native Mac companion is local-only. The checked-in Docker build is missing a required input, and shared browser editing has a known overwrite risk.

## What already exists

- One local memory engine, reused by the authenticated server; the CLI selects local or remote transport.
- QMD lexical plus structured lexical/vector retrieval, exact-title supplementation, bounded candidate pools, and explainable ranking. jumpyBrain explicitly disables QMD neural reranking on its structured query.
- Normal/shallow retrieval groups by file, keeps at most two independently cited passages, and conservatively removes redundant excerpts. Each passage is bounded to 1,000 characters. Deep/source-focused retrieval preserves chunk-level evidence.
- Relevant dream pages receive a preference without replacing raw sources. Stateless UTC dream windows are bounded and source-backed; synthesis happens through the user's agent, not a server-side model dependency.
- Search recency does not use edit timestamps to rejuvenate claims. Explicit time cues currently influence ranking; they are not date filters or a fact-validity model.

Evidence: [QMD contract](../../src/adapters/qmd/qmd.docs.md), [query execution](../../src/adapters/qmd/qmd-query.ts), [ranking](../../src/adapters/qmd/qmd-ranking.ts), [technical design](../../docs/technical.md).

## Recommendations, in priority order

### 1. Make semantic retrieval efficient and observable

**Observed:** `rebuildQmdCliCollection` deletes QMD cache/config on every index run. The installed QMD implementation places its default database under `XDG_CACHE_HOME/qmd/`; jumpyBrain points that variable at the deleted cache. Embedding generation requires `JUMPYBRAIN_QMD_EMBED=1`. Search catches individual lexical and structured-query failures without surfacing degraded mode; all failed calls can resemble no matches. The deployment guide does not enable embeddings.

**Propose:** distinguish routine incremental updates from explicit full rebuilds; preserve unchanged vectors and handle modified/deleted documents and dream snapshots. Persist the embedding policy so an ordinary later index does not silently remove semantic capability. Publish a new manifest only after successful indexing; keep last-good state on failure. Show lexical-only, hybrid-ready, stale, and failed status without returning verbose diagnostics in every hit. Pin/test a supported QMD version rather than relying on moving upstream behavior.

**Why first:** semantic search that silently becomes lexical-only is a product-quality problem. Rebuilding unchanged data is avoidable VPS work. Measure warm update time, embedding work, and read availability before promising savings.

Evidence: `src/adapters/qmd/qmd-cli.ts:18–33,46–64`, `qmd-driver.ts:39–54`, `qmd-query.ts:47–62`; installed `/opt/homebrew/lib/node_modules/@tobilu/qmd/dist/store.js:509–525` confirms the default cache database location. [memsearch](https://github.com/zilliztech/memsearch) demonstrates content-hash-based reuse; borrow the principle, not its backend.

### 2. Budget the whole response and add selective source expansion

**Observed:** per-passage character caps and result limits are not an aggregate token budget. JSON includes frontmatter and score metadata; multiple passages add context. Hosted `show` retrieves the full document, leaving a gap between a short hit and an entire file.

**Propose:** a compact recall packet with a total output budget, canonical document ID, exact line provenance, evidence date/date basis, and explicit partial/omitted markers. Make diagnostic score detail optional without breaking existing consumers. Add ID-addressed, bounded line/section expansion through the same local/remote seams, with a source hash to detect changed coordinates. Keep full-document reads for editing. Any proposed token limit must name its tokenizer or clearly label an estimate; a character cap is not an exact token cap.

**Why:** save context across the whole recall → expand interaction, not just the first response. Retain negations and qualifications; do not meet a quota by silently cutting evidence. Reuse the existing structural excerpt selector rather than add model-generated query-time summaries.

Evidence: `src/core/retrieval-policy/excerpts.ts`, `src/adapters/qmd/qmd-driver.ts`, `src/cli/document-edit.ts`; [memsearch progressive disclosure](https://zilliztech.github.io/memsearch/architecture/). [LongMemEval](https://arxiv.org/abs/2410.10813) found that replacing original evidence with compressed summaries/facts can lose answer-critical information.

### 3. Make time explicit, without building a temporal graph

**Observed:** before/after hints only rerank. Search and dream windows use different date fallback policies. Deterministic `process --mode synthesize` passes `since` into direct selection but not QMD supplementation, replaces existing metadata without retaining `date`/`dream`, and summarizes the first useful line to 240 characters. It should not be mistaken for the richer agent-driven dream workflow.

**Propose first:** repair processing scope/metadata integrity; reuse structural evidence selection. Document date basis across workflows instead of forcing modification time and evidence time to mean the same thing.

**Then:** explicit recall date bounds and chronological presentation, with visible handling of undated evidence. Apply bounds during candidate selection or bounded backfill—not only to the final top-k. Relative dates need an explicit reference date/timezone. For current-state questions, preserve links to superseded decisions and conflicting sources; start with reviewed Markdown metadata, not automatic fact invalidation. A document timestamp cannot fully represent a multi-period synthesis.

**Why:** “what was decided before launch?” and “what is the current decision?” are different retrieval tasks. Newness alone solves neither.

Evidence: `src/adapters/qmd/qmd-ranking.ts:52–78,103–132`, `src/core/dream/window.ts`, `src/app/processing/processor.ts:39–60,117–162,189–201`. [LongMemEval](https://arxiv.org/abs/2410.10813) supports time-aware narrowing; [Graphiti](https://github.com/getzep/graphiti) illustrates validity time versus recording time, but adopting its graph database/LLM extraction stack is not justified here.

### 4. Bound backend latency before adding smarter ranking

**Observed:** ordinary retrieval can execute eight lexical subprocesses plus one structured query; dream supplementation adds up to two lexical calls. Calls use synchronous spawning without a timeout, blocking the server event loop. Current max-across-variants fusion intentionally avoids counting correlated variants as independent evidence; synthetic RRF comparisons show tradeoffs, not a clear replacement.

**Propose:** deadlines, cancellation, bounded async execution, and per-request reuse of canonical source reads. Evaluate fewer/adaptive query variants against evidence coverage before changing defaults. Only experiment with a small optional reranker for difficult queries after establishing baseline costs. Keep retrieval depth separate from computational effort: requesting raw evidence should not automatically require extra model calls.

**Why:** a shared VPS must remain responsive while one agent searches or indexing runs. Do not multiply parallel model processes without a resource cap.

Evidence: `src/adapters/qmd/qmd-query.ts:12–65`, `qmd-cli.ts:46–70`, [fusion contract](../../src/adapters/qmd/qmd.docs.md#candidate-fusion-decision). [Upstream QMD](https://github.com/tobi/qmd) already has hybrid/reranking capabilities; validate those against the supported version rather than implement another ranking stack.

### 5. Try contextual indexing only if remaining misses justify it

**Propose:** first test cheap, derived retrieval context—document title, heading ancestry, aliases, and explicit evidence date—alongside the original passage. Preserve a lossless mapping to canonical Markdown; never present added indexing text as a source quotation. Inspect what the supported QMD version already indexes before duplicating it. Model-generated key expansion is a later, opt-in ingestion experiment, not a mandatory query-time service.

**Why:** a passage saying “we rejected it” needs its subject. Index enrichment can improve retrieval without adding the whole document to agent context. It is more invasive than the preceding fixes because QMD currently owns production chunking over original files.

External support: [Anthropic contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval) reported lower retrieval failure with contextual lexical/vector indexing; [LongMemEval](https://arxiv.org/abs/2410.10813) supports expanded retrieval keys while preserving original values. Their measured gains are not forecasts for jumpyBrain.

## Measure before retuning

Use a small independently judged external query set covering exact identifiers, paraphrases, dated events, changed decisions, contradictions, multi-source answers, and questions with no answer. Keep private corpora and broad benchmark infrastructure outside this repo, per the [existing architecture decision](../../tasks/done/2026-07-04_tasks-repository-architecture-cleanup.md).

Compare lexical, current hybrid, and proposed variants at matched output budgets. Track supporting-evidence coverage, correct/qualified answers, abstention, total tokens including follow-up reads and tool metadata, cold/warm p50/p95 latency, and incremental-index work. Separate fixed-candidate ranking comparisons from end-to-end candidate discovery. Retain only changes that improve the quality/cost tradeoff; tiny synthetic fixtures are regressions, not proof of general search superiority.

## VPS and Mac: current support

| Path | Assessment |
| --- | --- |
| Full checkout + Node 22+/QMD + systemd + HTTPS proxy | Supported implementation path for one trusted shared brain; follow the [VPS guide](../../docs/vps-deploy.md). No deployment was performed in this review. |
| Remote agents using installed CLI | Supported via `--target-url`/`--remote-url` and private `JUMPYBRAIN_API_KEY`. No direct agent HTTP integration needed. |
| Mac browser opening the VPS URL | Supported web-editor path; the VPS serves the editor. No local memory replica needed. |
| Native macOS companion selecting a VPS | Not implemented. It starts and controls a local loopback server; remote CLI configuration does not change this. |
| Current Docker/Coolify recipe | Build-input blocker: Docker copies `src/` but not `scripts/build-editor.mjs`, now required by `npm run build`. Fix and validate a clean image before recommending this path. |

Minimal read-only client check, after supplying the key privately:

```sh
jumpybrain status --target-url https://memory.example.com
jumpybrain recall --target-url https://memory.example.com --topic "current project decisions" --limit 5
```

For semantic search, configure embedding generation on the **server**, not merely on the client. Current indexing is rebuild-oriented; a one-off embedding run followed by an ordinary non-embedding rebuild is not a durable hybrid setup. Test actual QMD model availability and CPU/RAM/latency on the chosen VPS; this review establishes no minimum VPS sizing.

### Before relying on shared use

- Use one server process and persistent local disk, HTTPS, private keys, reverse-proxy limits, and tested backups/restores. Do not horizontally scale the current in-process write queue.
- Every valid server key currently has the same access. Device-local read-only configuration is advisory, not server authorization. A trusted private team is different from mutually untrusted tenants or a public writable service. Server-enforced read/write scopes are a lean follow-up if mixed permissions are needed.
- **Shared-edit risk:** browser autosave retries a stale-hash conflict once using the local body over fresh server metadata. It can overwrite another person's or agent's changes. Visible conflict handling is more important than a remote companion feature; meanwhile avoid concurrent same-note editing.
- Auto-index checks stale state every five minutes, not immediate read-after-write search. Manual remote index is available with authorization. `/health` proves liveness, not retrieval readiness.
- Lean companion extension: explicit local/remote mode, opening the existing remote editor; never start/stop a local server for a remote target or silently fall back to another brain. Add remote credentials only if native authenticated actions are needed, using secure storage. Do not build offline sync as part of this feature.

Evidence: [companion](../../integrations/macos-companion/README.md), `Companion.swift:47,166–197,274–299`, [Dockerfile](../../Dockerfile), [package build](../../package.json), `src/adapters/http-server/graph-page.ts:527–557`, [operator limits](../../docs/cloud-shared-memory.md), [active public-sandbox hardening](../../tasks/todo/tasks-public-sandbox-hardening.md).

## External sources and limits

Primary sources consulted through Exa:

1. [LongMemEval paper and code](https://github.com/xiaowu0162/LongMemEval): temporal reasoning, updates, abstention, evidence granularity, and retrieval-key expansion.
2. [Anthropic contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval): contextual lexical/vector indexing and reranking. Published results are workload-specific.
3. [QMD](https://github.com/tobi/qmd): reuse existing backend capabilities, but upstream documentation can differ from the version tested by jumpyBrain.
4. [memsearch](https://github.com/zilliztech/memsearch): Markdown-canonical storage, incremental hashing, progressive expansion. No recommendation to migrate to Milvus or adopt automatic capture.
5. [Graphiti](https://github.com/getzep/graphiti): temporal validity and source lineage as concepts, not a proposed infrastructure dependency.
6. [HyMem](https://arxiv.org/pdf/2602.13933): summary/raw dual-granularity and adaptive retrieval. Its deep path adds substantial latency in reported experiments; borrow selective expansion, not its multi-model pipeline or headline savings.

These sources motivate experiments; none establishes jumpyBrain's comparative quality or token savings.

## Validation performed

- Clean application rebuild: `npm run build` passed.
- 73 tests passed across `recall-excerpts`, `recall-diversity`, `recall-fusion`, `search-ranking`, `http-client`, `server-auto-index`, and `server-http`.
- Those suites validate deterministic behavior and disposable HTTP workflows; retrieval tests use fixtures/fake QMD where configured. They do not certify production semantic quality, VPS load capacity, or GUI behavior.
- No Docker build, Linux deployment, real-model benchmark, Mac GUI launch, production configuration change, or global/team memory write was performed. Docker and companion findings are source-inspection conclusions.
