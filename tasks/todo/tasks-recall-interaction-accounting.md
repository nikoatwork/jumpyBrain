# Recall format and follow-up interaction accounting

## Goal

Retain small reproducible regressions that account for complete agent-visible recall and follow-up output, distinguish metadata cost from evidence size, and prevent unsupported compact-versus-text efficiency claims.

## Notes

- User authorized implementation after production feedback that small-limit compact packets can exceed text output and truncated excerpts trigger full reads.
- Existing external evaluation compared compact with rich JSON plus whole-document reads, not text. It was small, synthetic, and oracle-assisted; do not present it as production or universal superiority evidence.
- Keep broad corpora/harnesses external. In-repository work is small deterministic synthetic tests using existing engines/seams, no new runtime dependencies or benchmark framework.
- Count actual serialized UTF-8 bytes including framing, envelope, metadata, and follow-ups. Token measurements require an available named tokenizer; if unavailable, report that explicitly rather than estimating characters/4.
- Navigation must derive handles/ranges from agent-visible packets/citations, not fixture-secret source coordinates. Equal budget is not evidence of equal answer quality; explicitly check needed clauses/qualifications.
- Ownership: new `test/recall-interaction-cost.test.js` plus this task. Do not modify existing excerpt/compact tests, product source, shared docs, package files, or external benchmark artifacts without parent approval.
- No memory writes, commits, or archiving. A documented limited/no-go result is acceptable; no metadata schema redesign in this task.

## Relevant Files

- `test/recall-interaction-cost.test.js` — new bounded deterministic accounting regressions.
- `test/{compact-recall,bounded-retrieval-cli,canonical-expansion,recall-evidence-eval}.test.js` — existing fixture/engine patterns.
- `src/cli/formatting.ts`, `src/core/retrieval-policy/compact.ts` — human rendering and exact compact serialization (inspect).
- `src/core/canonical/expansion.ts`, `src/app/local-memory/{compact,expansion}.ts` — guarded selective output (inspect).
- `tasks/done/2026-10-11_tasks-budgeted-recall-and-expansion.md` — existing evaluation reference and limitations (do not rewrite history).

## Tasks

- [x] 1.0 Establish matched deterministic cases
  - [x] 1.1 Read module contracts and existing fixture patterns; cover small-limit sufficient excerpts, missing qualification with selective follow-up, and oversized whole-line expansion limits.
  - [x] 1.2 Define what each case can prove; retain clause-complete evidence checks and distinguish text, rich JSON, and compact baselines.
- [x] 2.0 Implement total-output accounting regressions
  - [x] 2.1 Count exact visible bytes and metadata overhead; demonstrate that compact need not beat text while always respecting its configured cap.
  - [x] 2.2 Include actual selective expansion/full-read follow-up packets in totals, deriving navigation from visible output and checking evidence coverage.
  - [x] 2.3 Check source-version protection and long-line limitations without bypassing required hashes or silently falling back to a full document.
- [x] 3.0 Record results without overclaiming
  - [x] 3.1 Run focused tests. If a named tokenizer is already available, measure the same outputs without adding dependencies; otherwise record token accounting as an explicit evaluation limitation.
  - [x] 3.2 Record findings, commands, fixture limitations, and complexity review. State whether metadata redesign merits separate versioned work; do not ship one here.

## Case contract

- Three synthetic single-result cases: sufficient short evidence, missing late qualification in an enclosing section, and an indivisible oversized line. Capture actual compiled CLI stdout/stderr, including text banners/warnings, rich pretty JSON, compact JSON+LF, expansion packets, and full-read output.
- Needed literal clauses are evidence checks, not agent answer/quality judgments. Selective navigation uses emitted expansion handles, section anchors, and continuation bounds only. Text full-file navigation uses its emitted citation; rich show uses emitted canonical metadata ID, never QMD hit ID.
- Existing external rich-JSON+show comparison is not a text baseline. These fixtures demonstrate costs/limits only; no universal ratio, production advantage, or quality superiority.

## Scoped completion and results

Implemented only `test/recall-interaction-cost.test.js` plus this task. Three tests use the existing fake-QMD lifecycle/manifest fixtures and compiled CLI/runtime/core seams. No production changes were needed; no new dependency, corpus, runtime tokenizer, schema, benchmark framework, or external-file changes.

### Observed output costs

Named-tokenizer run below used the **same captured stdout/stderr strings** for bytes and tokens: external **js-tiktoken 1.0.21 / cl100k_base**. These are observations from current `dist`, not pinned universal thresholds. Rich JSON contains random temporary-root components, so its token count can vary between runs even when byte length is unchanged.

| Synthetic interaction | Captured packets | UTF-8 bytes | Tokens in recorded run |
| --- | ---: | ---: | ---: |
| Sufficient short text recall | 1 | 320 | 95 |
| Sufficient short rich JSON recall | 1 | 1257 | 418 |
| Sufficient short compact recall (cap 1536) | 1 | 856 | 271 |
| Late qualification: text + raw whole-file read | 2 | 7503 | 1470 |
| Late qualification: rich JSON + JSON show | 2 | 9092 | 2144 |
| Late qualification: compact + JSON show | 2 | 8689 | 1995 |
| Late qualification: compact + four bounded selective packets | 5 | 5692 | 1573 |

- Short compact has 91 bytes of encoded evidence-value text and 765 bytes of framing/metadata (including the final LF). The evidence-value accounting includes JSON quotes/escapes; it does not call necessary provenance waste. Compact exceeds text here.
- The late-qualification recall is 1784 bytes: 1012 evidence-value bytes and 772 framing/metadata bytes. An actual CLI cap of 1784 retains the passage exactly; 1783 emits a 316-byte omission packet with no needed evidence. Every successful compact/expansion packet is checked against its exact JSON+LF serialization and its own cap.
- Selective section navigation starts at the emitted handle's anchor and continues only with emitted `continuationLine`/`requestedEndLine`, retaining the supplied hash. Four expansion packets (1002, 1017, 1017, 872 bytes at cap 1024) recover both the approval clause and the late negative/audit qualification. All full-read arms recover the same literal clauses. The rubric decides whether to follow up but supplies no navigation coordinates.
- The selective arm uses fewer bytes than text+raw-file in this padded fixture, **but more measured tokens**. Text and rich JSON are separate baselines, not interchangeable. No efficiency ratio or answer-quality superiority is asserted.
- Text exposes a file/range, not an ID/hash. Its explicit local whole-file follow-up captures a raw Node file reader's stdout using only the citation. Rich show uses the visible canonical metadata ID, never the QMD hit ID. Compact show uses the visible expansion ID. No hidden source/qualification coordinates are used for navigation.
- Oversized-line case: a bounded section prefix emits an explicit continuation; that indivisible next line fails `line_too_large` at both 1024 and 65536. Missing hash fails `precondition_required`; mutation after recall fails `precondition_failed`. Actual CLI error stderr is counted (no success stdout or silent full-document fallback). Required evidence remains missing, so this is explicitly **not** a matched-quality success.

### Checks

- `node --test test/recall-interaction-cost.test.js` — 3/3 passed; default diagnostics explicitly record **tokens not measured**, with no characters/4 estimate.
- `node --test test/recall-interaction-cost.test.js test/compact-recall.test.js test/canonical-expansion.test.js` — 39/39 passed against available compiled output.
- `JUMPYBRAIN_ACCOUNTING_TOKENIZER=/tmp/jumpybrain-retrieval-eval-v1/node_modules/js-tiktoken node --test test/recall-interaction-cost.test.js` — 3/3 passed with optional external named-tokenizer accounting. Nothing was installed or changed externally.
- Child did not run `npm run build`; parent subsequently ran `npm test`, rebuilding final integrated source: **854 passed, 1 skipped, 0 failed** (855 total). Independent read-only review found no actionable issues; `git diff --check` passed. Implementation and integration checks complete; task remains here pending archive approval.
- Parent reran the optional named-tokenizer command against the final build: **3/3 passed**. Text/compact bytes and tokens matched the recorded observations; rich/show token totals varied slightly with temporary paths as expected. Selective recovery remained 5692 bytes / 1573 tokens versus text+raw-file 7503 bytes / 1470 tokens; these are fixture observations, not product-wide efficiency claims.

### Limits and complexity review

- Only three deterministic synthetic cases, one result each; fake retrieval, literal evidence rubric, known-needed clauses, and deliberately unrelated archive padding. No autonomous-agent answers, independent quality judgments, semantic production workload, remote cost study, or universal efficiency conclusion. Existing external rich+show versus compact evaluation is not a text comparison.
- Costs cover complete captured CLI output (including banners, warning/framing, pretty JSON, compact metadata, LF, follow-ups and error stderr) and the explicit raw-file reader stream. Request/command text, host-specific tool wrappers, transport headers, latency and canonical input/scanning costs are not measured. The text raw-file arm is not a CLI `show` arm and must not be described as one.
- No simplification of production code was attempted. New test-local helpers only manage fixtures, capture outputs, partition exact bytes, and execute this bounded follow-up policy. Optional tokenizer loading is measurement-only and never gates correctness. Existing compatibility/full-read/hash/whole-line semantics remain untouched.
- **Metadata redesign is not justified by this evidence alone.** It confirms a real small-limit overhead tradeoff and supports a separate investigation if representative production traces corroborate it; a versioned redesign should first demonstrate clause-complete whole-interaction gains in bytes and named-tokenizer counts, without removing source protection/provenance. Prefer sufficient text and explicit conditional reads over assuming compact is always cheaper. No schema redesign ships in this task.
