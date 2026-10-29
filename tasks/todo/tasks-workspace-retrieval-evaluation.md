# Knowledge-workspace retrieval evaluation and baseline

Status: baseline v1 established 2026-10-28; broader evaluation remains active. [Measured scorecard](../../evals/workspace-retrieval/reports/2026-10-28-baseline-v1.md). Original experiments are archived. The [2026-10-29 named-source combination](../../evals/workspace-retrieval/reports/2026-10-29-discovery-v5.md) passed fresh quality/cost and production-parity gates and is adopted for lexical retrieval. Independent answer judgments, larger workspaces/documents, human use and Linux/VPS costs remain open.

## Goal

Build a realistic, reproducible evaluation in this repository for jumpyBrain as an agent-first knowledge workspace: people find and open useful pages, and agents retrieve sufficient, current, source-supported evidence across the same Markdown. Establish where today's product succeeds and fails, then test three small improvements independently against that frozen baseline.

## Scope and decisions

- User direction: keep this focused evaluation **in this repo**, make it realistic for a Notion-like knowledge workspace, and **get a baseline first**. This explicitly supersedes the external-only rule for this product suite in the [earlier architecture decision](../done/2026-07-04_tasks-repository-architecture-cleanup.md). [Product vision](../../docs/product-vision.md) now records the narrower boundary; historical decisions remain historical.
- Proposed home: `evals/workspace-retrieval/` for the versioned protocol, fictional corpus, cases, rubrics and small runner; `evals/workspace-retrieval/README.md` for the supported command and interpretation; compact frozen reports under the eval directory. Generated roots, SQLite/vector/model state, logs and large packets are ignored or externally archived with hashes. No private memories, credentials, transcript imports or cross-vendor harness.
- Measure the supported knowledge workspace: project briefs, decisions, meeting notes, research, operating instructions, customer context and current-state pages. Include personal planning/research so success is not synonymous with coding-agent performance. No requirement to build Notion databases, permissions, formulas or other unsupported features to run this eval.
- Search and recall have different jobs and scorecards. Finding the right page is useful to a human; an agent additionally needs the subject, dates, qualifications and supporting evidence. Do not turn rank, lexical phrase coverage or source-handle availability into a claim of answer correctness.
- Markdown stays canonical; derived state remains rebuildable. Keep evaluation outside runtime imports and distribution artifacts. Add a deliberate opt-in eval command; normal builds, installs and `npm test` must not invoke models, download assets or run the full corpus.
- Use current public CLI/runtime seams. Hosted agents use the CLI transport. Keep pure policy in core, use-case composition in app, QMD-specific work in its adapter and HTTP routes thin. Read architecture and co-located docs before changing any source module.
- Run experiments separately in order: **1 evidence completeness, 2 bounded local reranking, 3 explicit relationship neighbors**. Do not combine arms or retune baseline ranking before recording its failures. A measured no-adoption decision is a valid experiment outcome.

## Workload to freeze

Start with approximately **160 substantive fictional Markdown pages and 80 evaluation cases**, small enough to inspect and rerun. Adjust once during fixture review if necessary, recording the reason before baseline collection. Use several overlapping projects and non-project topics, realistic page lengths and uneven link density; avoid a collection of isolated fact cards or repeated keyword filler.

| Journey | Example task | Required distinction |
| --- | --- | --- |
| Find a known page | "Open the customer migration checklist" | Exact/partial titles, duplicate titles, aliases, punctuation and identifiers |
| Discover a concept | "What have we learned about reducing onboarding drop-off?" | Paraphrases, domain vocabulary, strong but irrelevant lexical matches |
| Get oriented | "What does a new teammate need to know about this project?" | Current overview, relevant decisions, source routes, distracting adjacent projects |
| Reconstruct a decision | "Why did we choose this rollout approach?" | Alternatives, rationale, conditions and evidence across meeting/decision/research notes |
| Establish current state | "What launch date is actually confirmed?" | Approved decision versus newer proposal, unresolved disagreement and stale summaries |
| Answer historically | "What was the plan before the pilot failed?" | Evidence time versus import/edit time; declared dates do not imply fact validity |
| Combine knowledge | "Which customer constraint changes the onboarding plan, and why?" | At least two necessary sources, sparse wording overlap, useful versus incidental links |
| Recognize limits | "Who approved the exception?" when no approval is recorded | Absent, ambiguous, incomplete or conflicting evidence; appropriate abstention |

Target ten cases per journey, with 24 development and 56 reserved comparison cases overall. Split by scenario/entity family where practical, not just paraphrases of the same question. Include human search and agent recall cases explicitly; some journeys exercise both. Treat committed reserved cases as regression holdouts, not permanently secret data. Once used for tuning, they are seen; add fresh cases for later confirmation.

## Measurement contract

- **Human search:** intended-page success at 5/10, reciprocal rank and judged graded relevance; count opens needed to reach the intended source in a small representative search/open walkthrough. Record actual surface limits/options; do not assume the CLI and UI request identical candidate pools.
- **Agent evidence:** macro required-evidence coverage and fully supported-task rate, requiring subject/scope binding, qualifications, applicable time and all necessary sources. Record unsupported/conflicting/missing evidence separately. A file being discovered, a matching phrase or a usable expansion token is not evidence that the complete answer was shown.
- **Answers:** if an answer model/agent is evaluated, pin its version, prompt, tool policy and generation settings, use the same configuration for every arm, and score source support plus abstention. Answer quality is a separate measured result; no-model packet evaluation cannot claim autonomous answer performance.
- **Full interaction cost:** count serialized recall/search metadata and all follow-up reads, expansion envelopes, repeated content, retries and tool errors with one pinned tokenizer. Distinguish agent-visible context from backend inference tokens, ingestion work and model costs. Do not rely on byte counts as token counts.
- **Operations:** cold/warm p50/p95, process/model startup, peak process-tree RSS, index size, initial/incremental/no-op indexing and bounded hosted contention. Report local macOS and Linux/VPS evidence separately; loopback parity is not a VPS capacity result.
- **Diagnosis:** classify missing candidate, low ranking, excerpt/scope omission, packet-budget omission, bad follow-up selection, stale/degraded retrieval and answer-generation failure separately. Diagnostic rich/candidate calls are not free agent-visible evidence.
- Freeze an initial agent budget of five compact results / 8,192 serialized bytes plus at most three 8,192-byte guarded expansions, 32,768 bytes total. Pin depth per case and count all tokens independently. Use a fixed, documented follow-up policy based only on returned evidence; never choose expansions using gold IDs, source contents or expected answers. Larger-budget curves are separate arms.
- Judge query-bound entailment against the displayed packets and original evidence. Require review separate from corpus/implementation authors where available; otherwise disclose same-author judgment. Automatic clause checks are diagnostics, not independent semantic validation. Report per-journey paired outcomes and uncertainty, not only an aggregate score.

## Tasks

- [/] 1.0 Design and review a credible workspace fixture and evaluation protocol.
  - [x] 1.1 Inspect current search/recall/expansion, temporal policy, linked-page/source-check behavior, package exclusions and existing test conventions. Reuse supported operations without adding alternate evaluation-only product paths. Document the in-repo ownership boundary in the eval guide.
  - [/] 1.2 Author the fictional corpus with stable canonical IDs, original source notes, current-state pages and claim-adjacent citations. Include ordinary human writing, long/nested sections, aliases, near-duplicate titles, changed terminology, low-relevance neighbors and uneven topical coverage. Review plausibility and file lengths before writing the final query set.
  - [x] 1.3 Author natural tasks across the eight journeys without copying source sentences as the default query. Label search versus recall, required clauses and sources, acceptable alternatives, prohibited inferences, expected ambiguity/abstention and depth/date options. Do not make every answer discoverable from a title or one tiny paragraph.
  - [x] 1.4 Review corpus/questions/rubrics for circularity, accidental shortcuts and information absent from the sources. Freeze scenario-family development/reserved splits and permitted tuning. Keep corpus and gold/rubric directories separate; index only the corpus, never answers, task lists, runner files or reports.
  - [x] 1.5 Add small versioned mutation scenarios: external edit, renamed/deleted source, changed decision, stale synthesis and index removal/rebuild. Pin source snapshots and an explicit reference clock; gold supports each snapshot rather than pretending dates establish truth. Keep protected correctness/lifecycle cases separate from quality averages.

- [/] 2.0 Implement the smallest reproducible runner and scoring/report format.
  - [x] 2.1 Add a documented opt-in command that creates disposable roots, indexes the exact corpus and exercises real supported search, compact recall and guarded expansion. No production/personal/shared-brain writes; fixture setup is not part of query latency.
  - [x] 2.2 Support distinct lexical and provisioned-semantic runs with verified readiness, pinned QMD/model identity and network/model downloads disabled. Missing models or failed branches are unavailable/degraded outcomes, not passing semantic scores. A clean lexical run must remain possible without API credentials.
  - [x] 2.3 Implement bounded non-oracle interaction replay, canonical citation/range/hash checks, evidence diagnostics, pinned token accounting and per-case raw records. Keep gold access confined to scoring; an evaluated agent cannot inspect the fixture tree or rubric outside its allowed tools.
  - [x] 2.4 Produce a concise machine-readable and Markdown report with per-journey results, failure examples, actual read coverage and full-interaction costs. Keep manual/adjudicated labels distinct from automatic proxies; add a fixed optional answer-agent runner only if it can be reproduced without coupling the product to one provider.
  - [/] 2.5 Separate quality runs, quiet-window timing and small local/hosted parity/lifecycle checks. Record repeat count, cache state and full hardware/runtime details; do not benchmark under unrelated contention or infer shared-server capacity from one request.
  - [x] 2.6 Add only meaningful deterministic runner/scoring regressions, including budget/invalid-source/error accounting and exclusion of gold from retrieval. Verify normal tests/build/pack/install do not depend on the eval corpus or introduce model/network work.

- [/] 3.0 Run, inspect and freeze the unchanged-product baseline — prerequisite for all experiments.
  - [x] 3.1 Freeze source/compiled artifact identity, corpus/query/rubric/runner hashes, QMD and model hashes, tokenizer, settings, clock and interaction policy. Evaluation tooling may change before this freeze; retrieval behavior must remain the current product. Record any unavailable runtime/model/environment explicitly.
  - [x] 3.2 Run development and reserved cases against the unchanged product, recording lexical and verified-semantic results separately. Retain representative real search/open and local/hosted parity observations; record unsupported/untested surfaces honestly.
  - [/] 3.3 Adjudicate full query-bound evidence, inspect every failure category and a sample of successes, and record practical user impact. Specifically retain quoted-identifier/relaxation failures and missing alias/ancestor context as known controls rather than silently fixing them during baseline creation.
  - [x] 3.4 Commit a compact baseline report, exact rerun commands and immutable input manifest; archive bulky raw outputs outside tracked files with location/checksums. Prove a second clean run reproduces deterministic quality/cost outputs, documenting timing/model nondeterminism separately.
  - [x] 3.5 Publish the baseline scorecard and failure inventory before implementing any experimental retrieval change. Predeclare each experiment's target cases, effect size, protected regressions, context/latency/RSS limits and judgment procedure. If the baseline does not show the hypothesized failure, record a no-go or diagnostic-only pilot rather than expanding scope to manufacture a win.

- [ ] 4.0 Publish and finalize the baseline deliverable.
  - [x] 4.1 Document the scorecard, failure inventory, reproducibility, model/environment availability and limits; do not claim answer accuracy without an evaluated answer agent.
  - [x] 4.2 Verify packaging excludes evaluation assets while preserving the existing `dist/` runtime, and document tracked reproducible inputs versus ignored generated runs. No runtime relocation is required merely to exclude development tooling.
  - [/] 4.3 Run remaining broader checks, record exact tested snapshots and archive/commit the completed parent task under [the task workflow](../../docs/task-workflow.md). The original experiment lists are already archived; their completion does not satisfy the open parent checks.

## Follow-up experiment lists

- [Ordering and follow-up selection boundaries](../done/2026-10-29_tasks-retrieval-selection-boundaries.md) — full-pool ordering fails fresh/effect-size gates; rank-spread reads lose substantive evidence; production unchanged.
- [Bounded named-source candidate discovery](../done/2026-10-29_tasks-retrieval-candidate-discovery.md) — adopted lexical combination after separate admission/ordering, fresh confirmation, quiet cost and production-parity checks.
- [Evidence completeness in recall packets](../done/2026-10-28_tasks-retrieval-evidence-completeness.md) — isolated comparison after baseline publication.
- [Bounded local reranking](../done/2026-10-28_tasks-retrieval-bounded-reranking.md) — isolated comparison after baseline publication.
- [Explicit relationship neighbors in recall](../done/2026-10-28_tasks-retrieval-relationship-recall.md) — isolated comparison after baseline publication.

## Acceptance criteria

- A new contributor can run the committed fictional-workspace eval from documented commands in disposable roots and reproduce a hash-addressed baseline without private data or paid services for the lexical/evidence path.
- The baseline reports human page-finding and agent evidence sufficiency separately, includes realistic cross-page/time/scope/no-answer tasks, and records complete interaction cost and actual backend readiness.
- Baseline failures are visible and frozen before experimental behavior changes. Separate experiment records own isolated comparisons and adoption decisions; their archived results do not complete this broader parent task.
- Canonical Markdown/provenance, lexical constraints, explicit recall, temporal uncertainty and local/hosted app boundaries survive. The eval is maintainable product tooling, not a second retrieval engine or a broad research platform.

## Relevant files and evidence

- [Product vision](../../docs/product-vision.md), [source architecture](../../src/architecture.docs.md), [technical design](../../docs/technical.md), [CLI reference](../../docs/cli-commands.md) and [memory format](../../docs/memory-format.md) — supported product goals and contracts.
- [Prior retrieval review](../../deep-dives/retrieval-product-review/findings.md), [contextual-indexing evaluation](../done/2026-10-24_tasks-contextual-indexing-evaluation.md), [consolidation field study](../../deep-dives/consolidation-field-study/findings.md), [living-page review](../../deep-dives/living-topic-pages/review.md) — known evidence and its limits; reuse as controls, not fresh acceptance data.
- `src/core/retrieval-policy/{excerpts,compact,temporal}.ts`, `src/core/canonical/`, `src/app/local-memory/{compact,expansion,connections,graph}.ts` and their co-located docs — pure evidence policy, guarded reads and canonical relationship reuse.
- `src/adapters/qmd/{qmd-query,qmd-driver,qmd-ranking,qmd-lifecycle,qmd-worker}.ts`, `qmd.docs.md`, app/server-memory, runtime and CLI seams — supported backend, ranking, generation publication and transport.
- `test/recall-*.test.js`, `test/search-ranking.test.js`, canonical expansion/temporal tests, `scripts/semantic-index-smoke.mjs`, `package.json` and package-file checks — targeted regression/provisioned-model reuse and distribution exclusions.
- External primary sources motivating hypotheses: [Hindsight retrieval](https://github.com/vectorize-io/hindsight/blob/main/skills/hindsight-docs/references/developer/retrieval.md), [Graphiti](https://www.getzep.com/platform/graphiti/), [OpenViking assembly](https://github.com/volcengine/OpenViking/blob/main/docs/en/api/06-retrieval.md), [EverOS retrieval](https://github.com/EverMind-AI/EverOS/blob/main/docs/api.md) and [Letta filesystem evaluation](https://www.letta.com/blog/benchmarking-ai-agent-memory/). Published results do not establish gains in this repository.

## Progress and verification

- 2026-10-28: planning only. Reviewed current product/architecture/task workflow, prior evaluation limits, active testing/property plans and supported retrieval seams. Updated the product-vision evaluation boundary to reflect the user's explicit in-repo request. Baseline and all experiment tasks remain unstarted; no product tests or benchmark runs are claimed. No changelog/release note is warranted for this planning edit.

## Baseline v1 scope and remaining required work

- Implemented 160 fictional Markdown pages / 80 queries (24 development, 56 reserved), a gold-separated public-runtime executor, real QMD lexical/provisioned-semantic arms, deterministic first-three guarded follow-up reads, canonical source verification, pinned token accounting and repeated clean-root runs. Runtime/CLI/hosted-CLI parity and external edit/source-version/rename/delete/rebuild checks passed in a disposable lexical root.
- The fixture is a controlled pilot: pages have 157–192 whitespace-separated words including frontmatter (about 27,600 total), with shared document-role scaffolding. Long documents, genuinely varied page lengths and independent workflow structures are still missing from 1.2. All three experiment lists require a frozen augmented baseline before adoption comparisons.
- Mechanical required-span coverage and same-author source/rubric review establish a reproducible diagnostic score, not independent full query-bound entailment or answer/abstention accuracy. Broader judgment in 3.3 remains open. No answer agent or API credential is required/used for this milestone.
- Timings and sampled RSS are observations; supplemental checks overlapped part of a semantic run. Quiet-window operating-cost evidence and Linux/VPS contention in 2.5 remain untested. Browser recognition/actual human open counts are also unmeasured.
- Preserve these open checks rather than marking the full task complete or archiving it. A scoped baseline milestone may be committed under the existing workflow; the three improvement experiments remain unimplemented.

## 2026-10-28 measured baseline milestone

- Report: [baseline v1](../../evals/workspace-retrieval/reports/2026-10-28-baseline-v1.md), adjacent compact JSON and complete frozen input/runtime map. Product source `0c5b7fa3a99359d9668be2876fdee021a615a0db` remained unchanged. All frozen inputs reverified after execution; model/network downloads and native source builds were blocked.
- Four clean-root quality runs: 80 cases each, lexical twice and provisioned embeddinggemma semantic-enabled twice. Per-case ranks, required-span scores and visible token costs reproduced exactly within each mode. These are diagnostics, not answer accuracy or independent entailment.
- Lexical: 10/10 exact-title navigation, 63.8% any-required-source hit@5 across all queries, 49.6% initial / 54.8% final macro unit coverage, all required spans in 33/80 cases after bounded reads. Semantic-enabled: 10/10 navigation, 67.5% any-source hit@5, 54.0% initial / 58.5% final coverage, all spans in 36/80. Seven semantic-enabled questions deliberately use lexical-only constraint policy; bounded temporal warnings remain visible.
- Per run, lexical 219,791 interaction tokens / 215 expansions; semantic-enabled 227,070 tokens / 219 expansions. Context includes serialized requests, response metadata and guarded reads with pinned js-tiktoken 1.0.21 / cl100k_base; it is not provider billing or backend inference cost. Zero observed citation/range/hash or response-budget violations.
- Supplemental real lexical checks: 8/8 passed, covering runtime/local-CLI/hosted-CLI parity, changed decision/stale handle/source check, incremental repair, rename, deletion and derived-state rebuild. Hosted checks use authenticated localhost, not a live shared server.
- `npm test`: 1,427 tests, 1,426 passed, 0 failed, 1 opt-in skip, 71.832 s. Focused scoring/package checks (36) and architecture boundaries (21) also passed before the full run; these counts are not additional independent product cases. `git diff --check` and local Markdown-link checks passed.
- `npm pack --dry-run --ignore-scripts --json`: 512 files; all 231 required installable files validated; zero eval files. Existing `dist/` compilation and desktop runtime-copy boundaries already separate the app from development tooling. No app move, install, version bump, push or release.
- Full packets, logs, scores and freeze records are retained in ignored `.runs/baseline-v1/` and the externally hashed archive recorded in the report; rebuildable memory/index roots are excluded from that archive. No private memory or API credentials were used.
- This is a scoped baseline milestone commit. Leave this list active because varied/long-page coverage (1.2), quiet-window/shared-server costs (2.5) and broader independent query-bound judgments (3.3) remain required. Each experiment has a separate active list and requires a fresh augmented unchanged-runtime baseline before adoption comparisons.

## 2026-10-28 completed experiment investigations

- All three original investigations are complete and archived, with no product adoption: [paired v2 report](../../evals/workspace-retrieval/reports/2026-10-28-experiments-v2.md). Evidence bundles fail quality/token targets; QMD reranking gains aggregate coverage but loses required evidence and adds model costs; metadata neighbors displace supporting sources.
- A separate fixed-policy identity follow-up also closed without adoption: [v3/v4 results](../../evals/workspace-retrieval/reports/2026-10-28-identity-v4.md), [archived task](../done/2026-10-28_tasks-retrieval-identity-ranking.md). Seen-control gains did not transfer to either fresh confirmation set. All runtime prototype edits were removed.
- The largest retained fixture is 210 pages / 124 tasks, including new independently written operating workflows and 566–596-word nested handbooks. This addresses the short-page pilot limitation for these experiments; very long documents and large-workspace quality remain unmeasured.
- Two clean augmented v2 baselines reproduce per-case non-timing scores/costs exactly. Final v4 quality ran against an isolated original runtime after concurrent unrelated UI edits invalidated a working-tree freeze; artifacts distinguish accepted and excluded runs. A 20-pair quiet local identity probe is recorded separately, not a VPS or adopted-runtime performance claim.
- This broader task remains active: independent/full query-bound judgments, actual answer/abstention evaluation if pursued, larger-document coverage, human open counts and Linux/VPS operations remain unresolved. Do not archive this parent on the strength of the completed no-adoption investigations.

## 2026-10-29 candidate-discovery hill-climb

- [Report and source judgments](../../evals/workspace-retrieval/reports/2026-10-29-discovery-v5.md); [completed focused task](../done/2026-10-29_tasks-retrieval-candidate-discovery.md). Retained all 124 seen controls and added 15 independently authored fictional pages / 16 fresh tasks: 225 pages / 140 tasks total. Policy, corpus and thresholds froze before outputs, with separate model-agent fixture/policy/source-review ownership.
- Discovery alone admits missing sources but completes no additional tasks. The declared discovery + unchanged first-forty identity combination improves 70/140 -> 89/140 source-specific complete packets, fresh 9/16 -> 11/16, interaction tokens +1.117%, with zero lost unit labels/clauses/source qualifications. Quiet experimental and actual production probes pass <=10% p95 / <=50 MiB CPU RSS gates; production p95 +1.437% in one local quiet window.
- Adopted a pure core metadata helper and bounded lexical adapter path. Production reproduces all 140 serialized recall/read responses and requests, per-case scores, costs and source selections exactly. Full tests: 1,461 passed, one skip; 9/9 real lifecycle/CLI checks; 516 package paths, 231 required validated, no eval assets shipped. No release is implied.
- Remaining measured bottlenecks: Copperfin/Mothlight briefs enter at rank 42 but the frozen ordering window stops at forty; Wrenfall's fourth selected source misses first-three expansion; conservative natural-language `not` / hyphen constraints and multiple-name bypasses retain gaps. Investigate each separately with newly frozen confirmation; do not tune on these now-seen cases. The broader independent-answer/human/large-workspace/VPS work stays pending.


## 2026-10-29 selection-boundary hill-climb

- [Paired report](../../evals/workspace-retrieval/reports/2026-10-29-selection-v6.md), [completed focused task](../done/2026-10-29_tasks-retrieval-selection-boundaries.md). Added 15 independently authored pages / 12 fresh tasks with two longer guides, frozen policies and separate source review: 240 pages / 152 tasks. All new cases are now seen.
- Current production baseline: 95/152 complete source-specific packets (8/12 fresh), 439,333 interaction tokens. Full-pool named ordering: 97/152, no fresh gains, affected slice +2.56 points below five; rank-spread: 89/152 with six complete-task losses and eleven lost units across seven cases, including a protected case; combined: 91/152 with the same losses. Reject all three arms; retain current product and default first-three evaluator reads. No adoption-only cost/integration work.
- Independent review confirmed substantive gains/losses and zero range/hash errors over 75 packets / 333 excerpts / 177 expansions. New guide orientation facts already fit snippets; full guides fit 8,192-byte expansions, so genuinely long-file truncation remains untested. Source-specific scoring and independent answer judgments remain distinct.
- Corpus growth exposes separate baseline sensitivity: retained controls 89/140 on 225 pages become 87/140 on 240 pages, with Meadow historical and Ledger orientation losing source/date or purpose/owner evidence despite unchanged retrieval code. Compare experiment arms only at the same corpus/runtime snapshot.
- Two subagents manually tested the private brain strictly read-only, with 14 recalls / eight successful guarded reads and no saved private artifacts. Read spreading sometimes helps but can trade away useful context; targeted late-line expansion restores context that line-one reads may miss. These are usage observations, not exhaustive answer-quality evidence.
- Next separately frozen targets: conservative handling of natural-language negation/hyphenated phrases (four fresh empty pools), query-directed selection/range reads with continuations, and corpus-growth distractor sensitivity. Do not tune on now-seen confirmation cases or relax explicit exclusions/phrases indiscriminately. Larger workspaces, actual agent answer/abstention judgments, human open counts and Linux/VPS operations remain open.
