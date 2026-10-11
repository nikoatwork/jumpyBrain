# 2 — Budgeted recall and precise evidence expansion

Status: completed 2026-10-10; archived with user approval 2026-10-11. Implemented and verified opt-in compact recall and guarded expansion across runtime, CLI/recipes, and authenticated HTTP; legacy output/editing remains supported.

## Goal

Return the smallest sufficient, source-backed recall packet and let agents expand a specific passage without loading an entire document. Bound total output, not just individual excerpts, across both local and hosted workflows.

## Notes

- Approved for planning on 2026-10-10. Direction: [product vision](../../docs/product-vision.md); evidence: [retrieval review](../../deep-dives/retrieval-product-review/findings.md#2-budget-the-whole-response-and-add-selective-source-expansion).
- Can start independently; integrate [ticket 1](2026-10-10_tasks-semantic-index-reliability.md)'s readiness envelope. Agree the date-provenance field contract owned by [ticket 3](../todo/tasks-temporal-retrieval-correctness.md) upfront, but do not wait for temporal-filter implementation: this ticket can ship with existing date semantics and optional extension fields.
- Own the shared external, versioned judged evaluation suite and recall-plus-expansion accounting used by tickets 2–5. Record a non-secret suite/version reference here; keep corpora and broad harnesses external. Other tickets extend/reuse relevant slices rather than build competing suites.
- Default approach: introduce an opt-in compact, byte-bounded packet first; preserve existing JSON/full-document contracts. Do not advertise a byte/character heuristic as an exact token budget. Any token estimate must identify its method.
- Reuse structural excerpt selection and canonical ID/hash lookup. No LLM summarizer, new index, auto-ID stamping during reads, or change to editing's whole-document contract.

## Bigger picture and simplification

- Optimize the whole local/shared memory system: correct evidence per token, temporal trust, responsiveness, and easy operation—not feature count.
- Give explicit credit for fewer independent code paths, duplicated policies, configuration knobs, dependencies, and maintenance steps. Prefer replacing obsolete machinery to layering another system beside it; no arbitrary lines-deleted target or unrelated cleanup campaign.
- Preserve supported contracts, recovery, security, and useful regression coverage. Remove genuinely dead code and stale docs; do not call a safety check or necessary compatibility path dead without checking callers.

## Acceptance criteria

- Completion includes a short complexity review: what was removed/consolidated, what new machinery remains and why, and any retained compatibility debt. Added complexity must earn its place by meeting the goal; net simplification is a positive outcome alongside correctness and efficiency.
- Compact output has an enforced aggregate serialized UTF-8 byte bound including evidence, metadata, omission markers, and envelope. Budgets too small for the minimum envelope fail clearly rather than overflowing silently.
- Each returned passage retains its actual source coordinates, canonical document identity where available, date basis, and explicit partial/scope markers. Uncertainty and negative qualifications are not silently compressed away.
- Local and remote agents can request a bounded line range or enclosing section with content-hash checking. Stale coordinates trigger an explicit refresh requirement, not the wrong passage.
- Existing clients and full `show`/update workflows continue to work. New clients fail clearly against servers lacking the new capability; no silent full-document fallback.
- Total recall-plus-expansion output is measured at matched evidence/answer coverage; shorter first responses alone do not count as success.

## Relevant files

- `src/core/retrieval-policy/excerpts.ts`, `src/core/canonical/` — pure evidence selection and guarded document reads.
- `src/adapters/qmd/{qmd-driver,qmd-snippets}.ts` — result identity, passages, provenance.
- `src/app/local-memory/`, `src/app/server-memory/`, `src/runtime/index.ts`, `src/types.ts` — shared use cases/types.
- `src/cli/{document-edit,formatting,evidence-links,local-transport,memory-target,remote-access-policy}.ts` — CLI contracts and read classification.
- `src/adapters/http-client/`, `src/adapters/http-server/`, `src/adapters/http-protocol.ts` — remote transport/auth.
- `test/recall-{excerpts,formatting,diversity}.test.js`, document-read/runtime/HTTP tests — evidence and compatibility coverage.
- Added `src/core/{serialized-budget.ts,canonical/{expansion,markdown-structure,metadata-date}.ts,retrieval-policy/compact.ts}`, shared local/server `compact.ts`/`expansion.ts`, `src/cli/bounded-reads.ts`, and `src/adapters/http-client/bounded-response.ts`.
- Added `test/{canonical-expansion,compact-recall,bounded-retrieval-http,bounded-retrieval-cli}.test.js`; updated CLI/protocol/workflow/module docs, distributed memory skill, usage/instructions and glossary.

## Contract and completion evidence

- CLI: `recall`/`search --compact [--max-bytes N] [--diagnostics]`; `expand --id <mem_id> --if-match <hash> [--start-line N --end-line N | --section-line N] [--max-bytes N]`, including `run memory:expand`, local roots and remote targets. Bounded modes emit exactly compact JSON plus LF, even without `--json`; no human banners, pretty printing or late mode envelope. Scoped strict parsing rejects misspelled/repeated/missing budget/range flags before credentials; expansion is read-only allowlisted.
- Version-1 `recall`/`expansion` packets enforce **1024–65536 serialized UTF-8 bytes**, default **8192**, including query/readiness, source identity, escaping, omissions, optional diagnostics and LF. Minimum-envelope overflow fails. No token estimate. HTTP headers and error packets are outside successful-packet caps; new client error bodies have an independent 8192-byte consumption limit.
- Ranking/diversity/excerpts are unchanged. Pack whole passages in existing primary/secondary order, skipping units that do not fit, with deterministic result/passage omissions. Never silently shorten a qualification to meet the aggregate cap. Packet/passage scope is explicitly partial.
- Canonical IDs are distinct from QMD hit IDs. Available tokens require unique guarded canonical lookup, matching source path and excerpt coordinates/text, and raw-byte hash. IDless/invalid/duplicate/unavailable sources remain searchable with an explicit expansion-unavailable reason; reads never stamp or repair IDs. Current verified source metadata supplies written dates, not stale index creation dates.
- Date handoff for ticket 3: `date: {basis: "written", value, field: "created_at" | "createdAt"}` or `{basis: "unknown"}`. Share strict ISO-calendar validation with human formatting. No event/validity inference from written dates, filenames or mtime; evidence-date/temporal extensions remain ticket 3 and must update the versioned client validator explicitly. Existing rich metadata remains intact.
- Expansion reuses guarded editor-root lookup (not retrieval-only `indexRoot`), rejects stale hashes, malformed ranges, invalid UTF-8, ambiguous IDs, symlinks/hardlinks and raced identities. Whole-line prefixes preserve CRLF and exact coordinates; partial results carry `continuationLine` and requested bounds. An indivisible first line that cannot fit fails clearly. Section prefixes need not reach their anchor. `show` remains whole-document for explicit broader reads/editing.
- Additive authenticated POST routes: `/memories/all/recall/compact` and `/memories/all/expand`. Identical local/remote bounded packets, no server-root envelope. New clients validate response version, closed shape, request identity/scope/query/depth, byte cap and actual line count; reject unsupported servers without full-document fallback. Error messages are static and path-safe.
- Verification: **`npm test`: 722/722 passed**, including architecture boundaries; focused bounded recall/expansion/CLI/HTTP/formatting run **63/63 passed** after consolidation. Independent review findings (scope mismatch, unsolicited metadata, stale creation date, unbounded error bodies) were fixed with regressions. CLI tests cover local/remote and recipes, with/without `--json`, continuation, read-only targets, invalid flags, stale hashes, and legacy show/recall. HTTP/core tests cover Unicode/escaping, huge metadata, diagnostics, omitted passages, old servers, ID ambiguity, filesystem races and authorization.

### External evaluation reference and limits

Shared non-secret synthetic suite **v1.0.0**, frozen before comparison: SHA-256 `5484dab8928f7dd4c009e032ab974c1c6140b4a8fc9bcfeb08e6b121aa9ebc82`. Durable external artifact: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/v1.0.0.tar.gz` (archive SHA-256 `a53155f5665fb474e61626852dadbebd93677e40bbbeab3c6dc472a65c265dca`). Working copy: `/tmp/jumpybrain-retrieval-eval-v1/`; archive contains `REPORT.md`, corpus/rubric/config, frozen compiled product snapshot, runner, tokenizer lockfile, full interaction packets, and manual judgments. Nothing broad/private was added to this repository.

- Real QMD **2.8.3 lexical** retrieval; 16 synthetic documents, seven development and seven structurally paired heldout questions. Freeze includes code/configuration and acceptance thresholds before comparisons. Required gates per split: 100% evidence/answer/no-answer support; total interaction bytes and tokens each ≤90% legacy baseline; zero compact cap violations.
- Complete CLI recall-plus-conditional-expansion accounting uses actual UTF-8 output and **js-tiktoken 1.0.21 / cl100k_base**, not characters/4. Legacy rich JSON + conditional full show: **54,479 bytes / 14,257 tokens**, 14/14 supported answers/abstentions, four follow-ups. Default compact8192 + selective expansion: **21,695 bytes / 6,536 tokens**, same 14/14 support and 28/28 required labels, eight follow-ups. Both splits pass frozen primary gates; no cap violations.
- The 1536-byte stress arm is **not** a matched-quality success: manual review rejected two reference answers mentioning omitted temporal drafts despite automatic label coverage. Preserve the failed answer-support gate; smaller first packets alone are not success. Retain opt-in/default8192, not a lower default.
- This is a small synthetic, mirrored, oracle-assisted evaluation with static reference answers and same-author semantic review, not blinded heldout or autonomous-agent efficacy evidence. Known source coordinates make navigation optimistic; long archive padding favors selective reads. No semantic/paraphrase or production efficiency claim, and HTTP parity is covered separately by deterministic tests. The frozen compiled snapshot predates final flag/validator cleanup; final regressions cover those changes. Tickets 3–5 should reuse/extend the artifact with a newly frozen version, clause-complete answer rubrics, independent/non-mirrored material and non-oracle navigation rather than build competing harnesses.

### Complexity review and retained limits

- Consolidated heading/fence recognition between excerpt selection and section expansion; shared strict date parsing between human and compact output; one core JSON-plus-LF budget validator/accountant across recall, expansion and transports. Reused editor-root identity/snapshot safeguards, existing ranking/diversity/excerpts, and shared CLI handlers for recipes.
- New machinery is two small app operations, one pure passage packer and exact-line expander, additive transport methods, and bounded-response validation. The latter earns its cost by rejecting unsupported/mismatched/path-bearing packets without silent full reads. No summarizer, new index, ranking fork, ID migration, tokenizer runtime dependency or persistent cache.
- Legacy rich search/show remain intentionally separate compatibility envelopes over existing use cases; do not remove editing's full read. Canonical scans/full input reads remain unbounded (output is bounded), with per-request ID lookup reuse only. Guarded snapshots are not atomic against hostile external writers. No claim of temporal completeness, fully supported answers from omissions, or exhaustive recall. These are documented limits, not hidden completion blockers.

## Tasks

- [x] 1.0 Define a compact, compatible evidence contract
  - [x] 1.1 Read architecture/affected module docs and map current runtime, human CLI, JSON, and remote packet shapes. Specify proposed flags and additive/versioned transport fields before implementation.
  - [x] 1.2 Define aggregate byte accounting, minimum/maximum budgets, deterministic packing/ties, omission counts, and optional diagnostics. Include result framing and readiness/date metadata in the budget.
  - [x] 1.3 Keep document IDs distinct from QMD hit IDs. Define safe behavior for legacy ID-less/duplicate-ID hits: searchable provenance remains valid, but expansion must not guess an identity or mutate memory.

- [x] 2.0 Implement budget-aware evidence packing
  - [x] 2.1 Select bounded existing evidence units under a total budget after appropriate ranking/diversity. Reuse qualification-preserving excerpt logic and explicitly mark incomplete source context.
  - [x] 2.2 Keep compact provenance sufficient for exact expansion; omit arbitrary frontmatter and score breakdown unless requested. Apply the budget even when diagnostics are requested.
  - [x] 2.3 Preserve current unbudgeted contracts initially; wire compact mode through local and hosted CLI with consistent output semantics. Do not let formatting/JSON escaping push serialized output beyond the bound.

- [x] 3.0 Add guarded line/section expansion
  - [x] 3.1 Add a bounded canonical read operation addressed by document ID, line range or section-around-anchor, and expected content hash. Validate ranges, UTF-8 boundaries, symlink/root safety, oversized units, and missing/changed documents.
  - [x] 3.2 Return exact independent citations, source hash, and continuation/omission indicators. A large section remains bounded; expansion must not widen citations over unread source.
  - [x] 3.3 Compose through app/runtime and authenticated HTTP/CLI seams. Classify expansion as read-only in the CLI policy allowlist; do not expose server paths or bypass target authorization.
  - [x] 3.4 Preserve full-document `show` for editing. Document clear unsupported-server and stale-source behavior without unbounded fallback reads.

- [x] 4.0 Verify efficiency without sacrificing evidence
  - [x] 4.1 Test aggregate caps with huge metadata, Unicode, escaping, second passages, long lines, omission markers, empty/minimal budgets, and all supported output modes.
  - [x] 4.2 Test local/remote expansion parity, changed hashes, duplicate/missing IDs, malformed ranges, authorization, path safety, and compatibility with old clients/servers.
  - [x] 4.3 Establish the shared external judged development/held-out suite, freeze its version and acceptance thresholds before comparisons, and compare full interaction bytes and named-tokenizer counts at matched evidence coverage. Include expansion and “no answer” cases; keep private corpora/broad benchmark infrastructure outside this repo.
  - [x] 4.4 Update CLI/protocol/agent-workflow and skill guidance to expand conditionally; update owning docs and the glossary's recall-passage terminology if the public contract changes. Run `npm test` and record results here.
  - [x] 4.5 Consolidate overlapping excerpt, provenance, document-read, and budget logic rather than create separate local/remote implementations. Keep legacy output as a thin compatibility surface where feasible; remove superseded helpers and redundant fixtures/docs without dropping supported contracts. Record the complexity review and rerun affected tests after cleanup.
