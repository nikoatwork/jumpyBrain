# Recall quality: useful defaults, metadata, and result diversity

## Completion — 2026-10-08

Implemented general defaults across the shared local/runtime/hosted search path: file-level diversity with two independently cited passages, structurally selected excerpts, labeled metadata, and snippet-first agent guidance. No claims format, token flag, hardcoded topic/heading boost, model dependency, or canonical-memory mutation was added. The user requested end-to-end completion, commit, and push, with real-session testing to follow separately. This finalized implementation is archived under the task-completion workflow.

## Goal

Improve ordinary recall quality and agent use of returned evidence. Prioritize clearer metadata and recovery of relevant documents over a new claims format or speculative token savings.

## Evidence and scope

### User-supplied Claude Code trace audit

The user supplied an audit of four complete Sherpa-arm agent logs; Notion arms were excluded. The underlying logs have not been independently inspected in this repository session. A fresh JSON recall was used only to inspect its schema, not as evidence of historical output.

- Agents received plain-text snippets, paths, line ranges, and scores. Missing snippet exposure was not the problem in these runs.
- Snippets were approximately 450–500 characters and often stopped before a decision's `## Call` content. Useful reasoning sometimes remained in Context, so extracting only Call is not always sufficient.
- The same core finding was absent from Q1's top 8 and both Q4 top-10 lists; grep located it. Duplicate chunks occupied result slots: Q1 had 6 unique files in 8 hits; Q4 had 7 and 8 unique files in its two sets of 10 hits. Whether duplication caused those particular misses remains unproven.
- Q1 read 3 memory files (~3.7k tokens); Q2 read 4 (~1.8k); Q3 read 3 (~1.0k); Q4 read 4 plus targeted Assumptions sections (~6.4k including repeat excerpts). Estimates use characters / 4.
- Audit reports ~46k characters / ~11.5k tokens of memory-file content across 14 file reads, with ~2–3k tokens realistically avoidable across all agents. Q4's additional targeted reads and approximate totals should be kept distinct in any rerun.
- Separate roadmap reads were not jumpyBrain memory. The reported ~39k fixed starting context per agent is outside this ticket.
- Installed version was reported as 0.2.0. The memory skill did not teach snippet-first answers or selective expansion. Project-specific `brain/recall.md` requested claims/Observed dates, and the benchmark prompt permitted broader project reads.
- Audit also reported that `recall --help` ran an empty search. Treat this as a separate CLI bug to reproduce, not a reason to enlarge this ticket.

### Follow-up audit: fresh diagnostics supplied by user

These remain externally reported results, not commands independently run here. Corpus: 51 memories, heavily decision-shaped (41 decisions); no cross-corpus acceptance tests have run.

- Historical calls: Q1 `--topic "async agents" --limit 8`; Q2 `--topic "CRM light visibility auto-share" --limit 8`; Q3 `--topic "MCP" --limit 8`; Q4a `--topic "tasks async agents" --limit 10`; Q4b `--query "riskiest assumption tasks async agent evidence" --limit 10`. All used normal depth/plain output.
- Fresh runs reportedly reproduce all 44 historical top-K hits, order, scores, and snippet prefixes. This is strong reproduction evidence, still distinct from historical logs.
- At limit 50, the missing finding's best chunk/unique-file ranks are Q1 31/19, Q4a 15/10, Q4b 11/9. Grouping the expanded results recovers it for Q4, not Q1. Because requested limit also affects candidate retrieval, this comparison must be repeated on a fixed candidate pool before isolating grouping's effect.
- Direct QMD 2.8.3 lexical searches return the finding and reportedly give every hit a zero score. Its absence is not an indexing failure in these diagnostics. The cause of zero scores and comparability with mixed query-mode scores are not established.
- Three of 44 hits overlap near-identical ranges. Other same-file passages contain distinct evidence, including a `not decided` qualification; keeping only the top chunk loses useful information.
- 31/44 excerpts end in ellipses; 13/44 start with metadata; URL characters reportedly average 22% of excerpt text. Truncation counts alone do not prove all 31 lost an answer, but examples show relevant content cut off. Section sizes in this corpus support testing structural boundaries, not prescribing a universal size or `## Call` rule.
- All 51 memories have creation/edit metadata but none has frontmatter `date`; observation/decision dates are body conventions, and four pages have evidence periods. Document-level dates can miss newer sections. This corpus cannot test observation-versus-write-date divergence because those dates coincide; synthetic fixtures must.
- The proposed ~1,000-character excerpts and two passages per file may increase first-response size. Reported +1.4k tokens per eight-hit call is an estimate, not a validated optimal default.

### Pre-change repository verification

- `src/cli/formatting.ts` already prints snippets and source line ranges; it omits descriptive metadata available through `provenance.metadata`.
- `src/adapters/qmd/qmd-snippets.ts` compacts and truncates snippets at 500 characters. Actual excerpt selection also includes repair/neighbor logic; do not generalize the audited chunk-start behavior to all queries.
- `src/adapters/qmd/qmd-driver.ts` deduplicates result IDs, applies `diversifyResults`, then slices to the requested limit. Inspect the existing diversification policy before proposing a replacement.
- Formatter-only grouping cannot recover candidates already removed by the result limit. Any document-diversity fix must affect selection before that limit, not merely display.
- `qmd-query.ts` uses `max(upstreamScore, reciprocalRank) * weight`, retains the highest score per chunk across variants, and limits the merged candidate pool. It also attempts mixed lexical/vector query mode at weight 0.9. Final driver ranking includes other boosts, so “ranking is list position alone” overstates the finding. There are both candidate-stage and final-output cutoffs to inspect.

## Decisions / Corrections

- Supersedes the original claims-extraction and token-budget proposal. Do not build `--format claims`, `--max-tokens`, or a new claims schema. Add match-centered, structurally bounded excerpt evaluation based on the follow-up; blanket snippet enlargement is not the fix.
- Withdraw the suggestion that this would halve retrieval tokens. The supplied logs do not support it; token savings are secondary and modest.
- Improve instructions and plain-text metadata; separately evaluate excerpt selection, file diversity, and rank fusion. Use isolated comparisons before combining changes.
- Do not assume upstream score rounding or BM25 length normalization is the cause without reproducing the score contract. Rank-based fusion is a valid strategy; compare normalized upstream scores (where meaningful), current fallback, and robust fusion such as reciprocal rank fusion. An unnormalized sum across correlated query variants is not an approved fix.
- Do not reward document length or repeated keywords as a proxy for relevance. Use independently judged relevant passages, distractors, precise-phrase queries, and duplicated variants to test ranking across topics.
- Treat two passages per file and ~1,000 characters as experimental settings, not product constants. Preserve complete evidence/qualifications where possible, exact source ranges, and an explicit expansion path when omitted. Define limit semantics and assess existing JSON/search/deep consumers before changing from chunk counts to file counts.
- Link compaction, if justified, must preserve identity and resolvable provenance. Basenames can collide and URLs can be the evidence; do not impose an arbitrary URL-percentage target. Written dates, evidence periods, and observation dates remain distinct; a page is not automatically undated.
- Prefer answering from sufficient snippets, then targeted range/section expansion. Permit whole-file reads when the question requires broad context; do not impose a rigid rule based on memory type or assume filenames prove a decision.
- Proposed plain header: title, type, and honestly labeled date, alongside existing provenance. Use available metadata with graceful fallbacks. A creation date must not be labeled Observed; missing dates remain unknown. Confidence metadata, if displayed later, is not a guarantee of truth.
- Preserve distinct useful passages, qualifications, conflicting evidence, and retrieval-depth semantics when grouping a document. One file-level hit must not silently mean keeping only an arbitrary first chunk.
- Preserve local/hosted behavior, explicit recall, canonical Markdown, JSON compatibility, and existing access/write controls.

## Relevant Files

- `skills/jumpybrain-memory/SKILL.md`, `src/cli/instructions.ts`, `docs/agent-workflows.md` — agent guidance.
- `src/cli/formatting.ts`, `src/cli/memory-commands.ts`, `src/types.ts` — plain output and structured metadata contracts.
- `src/adapters/qmd/qmd-driver.ts`, `src/adapters/qmd/qmd-snippets.ts`, `src/core/retrieval-policy/` — candidate selection, snippet behavior, and existing diversification policy.
- `src/app/local-memory/`, `src/app/server-memory/` — local/server orchestration if selection contracts change.
- `test/memory-cli.test.js`, `test/cli-baseline-contracts.test.js`, `test/qmd-helper-properties.test.js`, `test/http-client.test.js` — relevant regression coverage.
- External benchmark's `brain/recall.md` — project-specific follow-up, not assumed to be part of this repository.

## Tasks

- [x] 1.0 Capture both supplied audits and narrow scope to general retrieval quality.
- [x] 2.0 Improve agent guidance.
  - [x] 2.1 Distributed skill and CLI instructions teach conditional snippet-first answers, preserving qualifications and justified broader reads.
  - [x] 2.2 Document actual local/hosted fallback: narrow recall, local range tools, then ID-addressed whole-document `show` as needed. No invented range flags or hosted API bypass.
  - [x] 2.3 Verify distributed guidance and installer tests; document rerender/restart requirements and external `brain/recall.md` follow-up.
  - [~] 2.4 Do not overwrite users' installed skill copies or unavailable external benchmark instructions from this checkout; they require an updated install/integration refresh.
- [x] 3.0 Add useful metadata to default plain output.
  - [x] 3.1 Show bounded single-line title/type, Written date, and explicit frontmatter Evidence date when present; preserve citations. Do not interpret creation time as observation time or expose confidence as certainty.
  - [x] 3.2 Test missing/invalid/multiline metadata, differing dates, secondary citations, omission hints, local/hosted presentation, and unchanged existing JSON fields.
- [x] 4.0 Diagnose score behavior and improve document diversity.
  - [x] 4.1 Independently reproduce zero lexical JSON scores with isolated QMD 2.8.3; inspect raw FTS5 values and output rounding. Record version/commands in owning docs; leave user memory/index untouched.
  - [x] 4.2 Group fixed ranked candidates by canonical file before the final limit, conservatively collapse redundant overlapping excerpts, and retain two distinct passages with omitted-candidate counts. Candidate pools were not enlarged.
  - [x] 4.3 Compare max fusion, score normalization, RRF, and deduplicated RRF on four synthetic topics with explicitly relevant answers and broad distractors. Retain max fusion: counterexamples show tradeoffs, not grounds for a general replacement.
  - [x] 4.4 Verify normal/shallow file limits, deep/source chunk limits, title/map/recency behavior, refreshed metadata/session aliases, and adapter/runtime/HTTP parity including remote-safe provenance.
  - [~] 4.5 Do not publish an upstream issue or claim a mixed-mode fix in this task. A minimal lexical reproduction is documented; actual mixed score comparability and independently judged corpus ranking remain follow-up research.
- [x] 5.0 Verify and document implemented behavior.
  - [x] 5.1 Run cross-topic fixed-pool diversity/fusion cases, structural evidence tests, real-QMD CLI workflows, and full repository suite.
  - [x] 5.2 Add a six-topic evidence/character ablation, including already-sufficient and cross-section counterexamples. Separately test guidance, metadata, selection, grouping, and fusion; record limitations below.
  - [~] 5.3 The private Sherpa corpus/session replay and live-agent instruction/answer-quality ablation are not available here. User will test after finalization; do not manufacture token savings or claim model-quality validation.
  - [x] 5.4 Update owning docs, public agent workflow, glossary, and a single user-facing changelog highlight. Archive this completed implementation ticket.
- [x] 6.0 Improve excerpts without hardcoded headings.
  - [x] 6.1 Core pure extraction selects matching evidence within its supplied window and bounded structural context, including governing ancestor scope or an explicit omission warning. It does not jump to a stronger match in the next unrelated section.
  - [x] 6.2 Cover long lines, nested lists, heading-free prose, arbitrary/setext headings, metadata/URLs, fences/diff hunks, source-coordinate precision, and beyond/straddling-prefix fallback.
  - [x] 6.3 Use bounded initial defaults (two passages, 1,000 characters each) with no public tuning flag. Test date-label distinctions without modifying recency policy. Broader optimal-size calibration is not claimed.
  - [~] 6.4 Skip URL rewriting: preserve full link identity, query/fragment components, and same-basename distinctions. Query matching ignores link targets but output does not change them.
  - [x] 6.5 Resolve independent review regressions: unmatched-bracket regex cost, genuine diff-line removal, lost beyond-prefix qualifiers, and missing ancestor scope. Add focused tests for every fix.

## Verification and limits

- `test/recall-diversity.test.js` uses fixed pools: chunk/file ranks 15/10 and 11/9 recover at file limit 10; 31/19 still misses limit 8. This proves slot behavior, not a replay of the private corpus.
- `test/recall-fusion.test.js`: four deliberately contrasting labeled scenarios split wins 2/2 between existing max and RRF; repeated variants leave production scores unchanged. Retaining max is conservative, not a claim it solves Q1.
- `test/recall-evidence-eval.test.js`: six different topics/shapes yield literal evidence coverage 3/6 with a 500-character prefix and 5/6 with structural extraction. Initial formatted output: 2,040 versus 1,183 characters. With a simulated whole-file fallback for missing required facts: 5,571 versus 1,300 characters. These hand-authored cases illustrate mechanisms, not model accuracy, actual agent reads, independent benchmark quality, or predicted production savings. The cross-section case still needs expansion.
- Real QMD 2.8.3 fixture: lexical scores approximately −3.628e−6, −2.724e−6, −2.104e−6 become zero after the installed normalization/two-decimal JSON rounding. No model downloads, embeddings, or mixed-query inference were required.
- Normal/shallow `--limit` now counts files. Existing result keys are retained, but clients wanting multiple chunks as separate results should use deep/source-focused retrieval. Additional `passages` each have their own provenance; ignoring them loses evidence.
- Body observation/decision dates and synthesis evidence periods are not automatically parsed into metadata. Header Written/Evidence dates are not passage-level observation claims. Editing timestamps still do not rejuvenate ranking.
- Hosted selective range reads are not a new API: narrow recall first; `show` remains whole-document by canonical ID. Updated integrations must be installed/reloaded by the operator.
- Independent review found and fixed correctness/performance cases beyond the motivating corpus. Final `npm test` passed **588/588 tests**, including build, architecture guards, real-QMD CLI tests, HTTP parity, installer distribution tests, and all new recall regressions. `git diff --check` passed. No skipped tests in the final suite.
- New focused suites: `test/recall-excerpts.test.js`, `test/recall-diversity.test.js`, `test/recall-formatting.test.js`, `test/recall-fusion.test.js`, and `test/recall-evidence-eval.test.js`. Existing dream/parity fixtures now accurately reflect canonical source content and the intentional file-level result contract.

## Acceptance Criteria

- Ordinary recall shows useful existing metadata and precise source references without new flags or invented observation dates.
- Agent guidance favors sufficient returned evidence and selective expansion without preventing necessary context reads.
- Any selection change demonstrably improves document coverage on reproducible cases and does not discard distinct relevant evidence or break depth/local/hosted contracts.
- Results distinguish measured characters from estimated tokens, candidate/ranking failures from excerpt failures, and memory retrieval from unrelated context. No claim of 50% savings or reduction of the separate fixed-start component.
