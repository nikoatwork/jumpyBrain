# 3 — Explicit temporal retrieval and evidence integrity

Status: completed and archived with user approval 2026-10-11. Delivered bounded temporal recall across local/hosted workflows, evidence-safe processing and date provenance; 740 tests pass. External validation is synthetic regression evidence, not general temporal-answer correctness.

## Goal

Answer time-scoped and changing-knowledge questions using explicit evidence dates and bounded chronological retrieval, without treating edits as new evidence or introducing a temporal graph. Repair existing processing scope/metadata problems first.

## Notes

- Approved for planning on 2026-10-10. Direction: [product vision](../../docs/product-vision.md); evidence: [retrieval review](../../deep-dives/retrieval-product-review/findings.md#3-make-time-explicit-without-building-a-temporal-graph).
- Processing repairs can start independently. Own and agree the date-provenance field contract early so [ticket 2](2026-10-11_tasks-budgeted-recall-and-expansion.md) need not wait for temporal-filter implementation. Temporal recall later integrates with ticket 2's packet and [ticket 1](2026-10-10_tasks-semantic-index-reliability.md)'s index metadata.
- Reuse ticket 2's external versioned judged suite and shared output accounting, adding a temporal slice rather than another harness; record thresholds before final comparison.
- Start with explicit CLI/runtime/HTTP date bounds; natural-language temporal hints remain hints, not silently inferred filters. UTC is the default. Relative bounds require a pinned reference date and visible resolved interval.
- Keep evidence time, creation time, modification time, and fact validity distinct. Preserve intentional differences in dream-window and search policies rather than applying one fallback indiscriminately.
- No body-wide event extraction, automatic contradiction resolution, fact invalidation, graph database, or model planner. Multi-period syntheses must not acquire an invented single fact-validity date.

## Bigger picture and simplification

- Optimize the whole local/shared memory system: correct evidence per token, temporal trust, responsiveness, and easy operation—not feature count.
- Give explicit credit for fewer independent code paths, duplicated policies, configuration knobs, dependencies, and maintenance steps. Prefer replacing obsolete machinery to layering another system beside it; no arbitrary lines-deleted target or unrelated cleanup campaign.
- Preserve supported contracts, recovery, security, and useful regression coverage. Remove genuinely dead code and stale docs; do not call a safety check or necessary compatibility path dead without checking callers.

## Acceptance criteria

- Completion includes a short complexity review: what was removed/consolidated, what new machinery remains and why, and any retained compatibility debt. Added complexity must earn its place by meeting the goal; net simplification is a positive outcome alongside correctness and efficiency.
- Processing applies `since` to every source path, including QMD supplementation; retains existing IDs and applicable date/dream metadata; excludes strict dream outputs as primary evidence regardless of directory.
- Processing excerpts preserve source qualifications and dates rather than using the first 240 characters as an asserted complete summary.
- Explicit recall date bounds apply before final result limits, with bounded candidate discovery/backfill and clear incompleteness reporting. Filtering only an unscoped top-k is insufficient.
- Undated/invalid dates follow an explicit documented policy, never silently satisfying a strict time range. Edit times do not rejuvenate evidence.
- Chronological output orders the selected relevant evidence predictably; current/historical results retain explicit conflicts or supersession provenance without asserting that recency alone settles truth.

## Relevant files

- `src/app/processing/processor.ts`, `processing.docs.md` — source selection, deterministic synthesis, metadata preservation.
- `src/core/dream/window.ts`, `src/core/retrieval-policy/` — existing UTC/date and source-focused policies.
- `src/adapters/qmd/{qmd-ranking,qmd-driver,qmd-query}.ts` — dates, candidate coverage, backend capabilities.
- `src/types.ts`, `src/runtime/index.ts`, local/server-memory app modules — typed temporal options/results.
- CLI and HTTP adapters — explicit options, validation, date provenance and chronological presentation.
- `test/search-ranking.test.js`, `test/dream-window-policy.test.js`, `test/processing-lint.test.js`, retrieval parity tests — regression patterns.
- Added `src/core/retrieval-policy/temporal.ts`, `src/cli/temporal.ts`, `src/adapters/http-client/temporal-response.ts`, `test/temporal-{retrieval,transport}.test.js`; extended `test/processing-safety.test.js`.
- Updated compact packet/core/app/client validation, canonical/dream date validation docs, CLI/protocol/memory-format/technical contracts and `glossary.md`.

## Contract and completion evidence

- CLI/runtime/HTTP search and recall accept optional `temporal: { from?, to?, referenceDate?, order? }` / `--from`, `--to`, `--reference-date`, `--order relevance|chronological`, including recipes and compact output. Validate before credentials/backend access; malformed types (including null), impossible/reversed bounds and unknown/repeated temporal flags fail. Relative `t-Nd` requires a pinned real UTC reference day. Day upper bounds include the whole day; timestamp uppers are exclusive, timezone-explicit, at most millisecond precision. Natural language never silently creates filters.
- Evidence provenance is declared `date`, otherwise a recognized dated session filename, otherwise unknown with reason. Invalid explicit dates block fallback. Dreams/process-owned maps without dates stay undated; creation/import/update/mtime cannot date strict recall. Written-date fields remain separate in compact output. A declared synthesis date does not date every event in its body; no event extraction or fact-validity inference.
- Verified supported QMD 2.8.3 CLI/SDK interfaces offer collection scoping, not canonical metadata-date filtering. Ordinary/dream/exact-title candidates are scoped before final limits. Up to 64 additional eligible manifest files (title relevance, then codepoint path) backfill outside the unfiltered cutoff, with existing 128 KiB bounded canonical prefixes. Unscored backfill requires all meaningful query tokens or exact title; no new backend query/index/body-wide scan. Max fusion and unfiltered query counts/ranking/output remain unchanged.
- Explicit temporal results are always partial with `temporal_bounded_discovery`; budget exhaustion, excluded undated/invalid metadata and stale sources are visible. Counts describe indexed eligible/visited files, not relevant claims or exhaustive evidence. Prefix verification rejects opened-but-unclosed headers and changed frontmatter/body-start coordinates, even without IDs; reindex/repair before retry. Missing/changed evidence is not silently returned as a current dated claim. Canonical writers remain outside a global snapshot.
- Relevance selects first; chronology sorts that same selected set by time/path/line/ID, unknown last for order-only requests. No ordinary recency boost or cross-file map echo suppression on explicit temporal queries. Existing `conflicts_with` plus optional descriptive `supersedes` declarations remain visible in rich/human/compact outputs without reconciliation or automatic historical hiding.
- Optional compact V1 temporal fields remain inside the whole UTF-8 budget, absent on legacy requests. Clients compare resolved intervals against requests and fail against old/mismatched servers instead of falling back unfiltered. HTTP errors are static/path-safe. Runtime/local/remote/CLI/recipe parity and scope mismatch are tested.
- Processing now uses one eligibility pool before direct and QMD limits, enforcing `since`, output exclusion and strict dream exclusion anywhere. Existing ID/date/dream/creation metadata is preserved through protected writes. Structural excerpt selection and partial markers already existed from the maintenance ticket and are reused, not replaced with another summarizer; source date/qualification/relationship declarations now accompany original citations. Processing `since` deliberately remains validated metadata recency, not the strict search evidence-date policy.
- Final **`npm test`: 740/740 passed**, including architecture boundaries; focused temporal/transport/dream validation **16/16 passed**. Independent review found malformed header fallback, stale relationship metadata and null-order acceptance; all fixed with ID-less rich/compact/HTTP regressions. `git diff --check` passed. No real remote deployment, Windows-specific or semantic-model evaluation was run.

### External evaluation and retained failures

Reused the external v1 suite/harness, named tokenizer and full recall-plus-expansion accounting. All broad artifacts remain outside this repository.

1. **v1.1.0 first run retained, primary full-support gate failed:** date precision 17/17, labels 31/31, chronology 5/5, but only 13/15 supported references/abstentions. A generic partial-token backfill admitted an unrelated map; a static timestamp answer asserted an excluded unseen record. No output cap violation. Fixed product backfill to require all meaningful tokens; corrected only that unsupported reference clause under a new freeze, never overwriting first evidence.
2. **v1.1.1 regression confirmation:** real QMD 2.8.3 lexical; 73 synthetic documents, 14 inherited plus 15 temporal questions, limit five/normal depth; paired unfiltered/scoped rich, default8192 and stress1536 arms. Frozen primary thresholds: 100% date/topical precision, required qualification/date support, chronology and scoped supported references/abstentions; no unfiltered quality regression; zero cap violations. Both rich/default scoped arms pass: **16/16** date/topic provenance, **31/31** labels, **5/5** complete chronologies, **15/15** supported references/abstentions. Original unfiltered control remains **14/14**, **28/28** labels; **44/44** compact responses byte-identical to v1.0.0.
3. Scoped temporal default8192 total **21,547 bytes / 6,508 cl100k_base tokens** versus scoped rich **31,624 bytes / 10,035 tokens**; these short temporal cases needed no follow-ups. Inherited control includes eight selective expansions/four full shows; default compact total **21,695 bytes / 6,536 tokens**, unchanged from v1. Costs include full actual stdout framing/metadata/LF and every follow-up, using **js-tiktoken 1.0.21 / cl100k_base**. Do not interpret filtered-vs-unfiltered costs as matched-question efficiency proof.
4. **Stress1536 is not a quality success:** temporal support **11/15**, labels **20/31**, complete chronology **1/5** despite zero cap violations; omitted evidence requires explicit abstention/expansion or more budget. Keep default8192. Supplemental frozen checks report **7/9 machine passes**: two positive-control assertions incorrectly expected normalized timestamps rather than the actual preserved date-only values. Their packets are correct; the failed assertions remain recorded, not silently promoted to passes. Product regression suite independently passes all corresponding cases.

Durable report: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/v1.1.1/REPORT.md`; archive `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/v1.1.1.tar.gz`, SHA-256 `c65f7a37f324a9f2a813667ba465d1c1f89f1cbe425aa031d501d3a65fce86aa`. Main freeze `320047863ec80c6934094a36d864391a1426d5ae5da72a8567e4729baec975ee`; compiled snapshot aggregate `fe0c0e7e0e01a8abe46efdca073118d06dd25b548ae47aa493db6aa89a00bdd5`. Parent independently checked archive hash and all **226** final compiled files against the frozen map after the final build. Prior failure report remains in adjacent `v1.1.0/REPORT.md` (archive hash `3da760263a23ee7a4801aa4aec97c29a84bfc12de9f3fe2bd24a719daca84b39`). The evaluator's return channel closed after writing the final artifact; parent inspected the report and verified its archive/snapshot directly.

Limits: small, already-seen synthetic suite; same author/judge for temporal extensions, separately reviewed inherited cases; oracle-known navigation and static answers, not autonomous answer generation or blinded heldout proof. No model/paraphrase, production throughput or exhaustive historical-recall claim. Broader independent evaluation and non-oracle navigation remain research needs, not silently satisfied gates.

### Complexity review and remaining limitations

- Consolidated direct/supplemental processing eligibility and shared strict ISO-calendar validation with dream windows/processing/compact dates. Reused protected metadata writes, structural excerpts, existing manifest, prefix repair, max fusion and byte packer. There was no remaining first-240-character summarizer to remove; prior maintenance had already replaced it.
- Added one pure temporal policy, one fixed-size manifest backfill branch, optional protocol fields and thin CLI/client validation. No date index/graph, global cache, model extraction, body scan or configuration knob. A supplied prefix is reused within temporal candidate repair; request-wide caching remains ticket 4, not a parallel cache here.
- Retained legacy unfiltered ISO-like recency parsing (including timezone-less UTC), dream creation/mtime import-review fallbacks and processing metadata recency intentionally. They are distinct supported policies, not equivalent fallbacks to combine. Written/evidence/modified/fact-validity meanings remain explicit.
- Bounded prefix/token backfill can miss semantic or later-section evidence and dates outside indexed metadata. Declared relationships/dates are not independently verified truth; chronology only orders a relevant subset. Compact metadata can consume small budgets. Newly dated sources require reindexing; verification is not atomic against hostile concurrent writers. These limits are documented and tested where deterministic.

## Blockers

- None for the implemented bounded contract. Broader independent quality claims and stress-budget sufficiency are explicitly not asserted.

## Tasks

- [x] 1.0 Repair deterministic processing evidence integrity
  - [x] 1.1 Read architecture/affected module docs; add regressions demonstrating QMD supplementation bypassing `since`, dropped date/dream metadata, and dream sources outside `pages/`.
  - [x] 1.2 Apply consistent selection constraints before limiting both direct and supplemental sources; exclude the output itself and strict dream outputs from primary evidence.
  - [x] 1.3 Preserve applicable canonical metadata and identity during synthesis updates, using existing writing/metadata rules where possible. Keep creation/update dates separate from evidence dates.
  - [x] 1.4 Replace first-line truncation with bounded structural evidence and citations; retain visible incompleteness, uncertainty, and conflict qualifications. Keep deterministic processing distinct from agent-authored dreaming.

- [x] 2.0 Define explicit temporal query semantics
  - [x] 2.1 Specify date-basis/provenance fields, validation, stable ties, and missing/invalid-date behavior. Keep existing unfiltered recall compatible; strict evidence-date filtering excludes undated items with a visible diagnostic.
  - [x] 2.2 Define date-only bounds as inclusive UTC days implemented as a half-open interval; validate timezone-explicit timestamps and reject reversed/impossible bounds. Relative inputs resolve once against a supplied or reported reference date.
  - [x] 2.3 Define chronological presentation separately from relevance selection. Expose existing reviewed conflict/supersession relationships where present; only add minimal Markdown metadata if existing conventions cannot represent them. Never manufacture relations or silently hide historical evidence.

- [x] 3.0 Implement bounded time-aware retrieval
  - [x] 3.1 Use supported QMD filtering where verified, otherwise a bounded manifest-aware selection/backfill strategy. Respect explicit bounds across ordinary, dream, and exact-title candidates; no full-corpus body scan per query.
  - [x] 3.2 Report exhausted candidate budgets/partial coverage honestly; do not imply exhaustive historical recall or convert a backend failure into no evidence.
  - [x] 3.3 Wire options and resolved intervals through runtime/CLI/HTTP, retaining date provenance and consistent behavior at all retrieval depths. Unsupported remote capability must fail clearly rather than ignore filters.
  - [x] 3.4 Ensure recently written historical dreams, imported journals, and multi-period maps do not masquerade as new events; document the limits of document-level time metadata.

- [x] 4.0 Validate temporal answers and contracts
  - [x] 4.1 Test interval endpoints, leap days, timezone offsets, relative-date pinning, invalid/missing dates, edited historical evidence, and multiple events within a synthesis.
  - [x] 4.2 Add crowded-candidate cases where in-range evidence lies beyond the original unfiltered cutoff; test chronological order, exact-title constraints, and local/remote parity.
  - [x] 4.3 Evaluate the shared external suite's historical, current-state, changed-decision, and unknown-answer slice; preserve an unfiltered relevance baseline and record the suite version/thresholds. Keep broad corpora/harnesses outside this repo.
  - [x] 4.4 Update memory-format, CLI/protocol, processing/dream/retrieval docs and glossary date terms. Run `npm test` and record results and remaining temporal limitations here.
  - [x] 4.5 Consolidate equivalent date validation and source-selection logic; remove superseded first-line summarization and obsolete temporal branches where replaced. Preserve deliberate evidence/creation/modification policy differences rather than hide them behind one generic fallback. Remove dead helpers and stale docs, record the complexity review, and rerun affected tests after cleanup.
