# Workspace retrieval protocol v1

Frozen before the first full comparison run. This is an authored fictional product workload, not an independently sampled user study or a public memory leaderboard.

## Inputs and separation

- 160 Markdown documents: ten distinct project/personal scenarios with 16 document roles each. The domains include onboarding, exhibitions, food service, hiking, scholarships, tutoring, venue bookings, gardening, conferences and invoicing. Shared document-role scaffolding and some explanatory prose are deliberate and disclosed; differing entities do not make these independent task designs.
- 80 questions: ten per journey (navigation, discovery, orientation, rationale, current state, historical, multi-source and limits). Harbor/Lantern/Juniper are development scenarios (24 cases); the other seven are reserved (56). All eight journeys share scenario templates; this is not evidence of generalization to unseen workflow structures.
- `corpus/` is the only indexed input. `queries.json` holds public queries/options, and `gold/rubric.json` holds scoring-only sources and complete required clauses. Expected evidence never selects follow-up reads. The executor receives no rubric. This process separation is a code-level data-flow contract, not an adversarial filesystem sandbox.
- Every file has a stable valid canonical ID and explicit evidence/writing dates. Proposals follow accepted decisions, original plans survive, old drafts have new edit times, and topical maps link to sources. All query reference dates are fixed by explicit case options; no moving clock determines a gold answer.
- Fixture author, question author and first scorer are the same. Reserved cases are committed and available to developers, not secret. Once inspected or used to tune, they are seen and require fresh scenarios before a later confirmation claim.

## Frozen retrieval behavior

Use the unmodified product source at the `FREEZE.json` commit and SHA-256 file map. Index a fresh disposable copy through the public runtime. Run the real pinned QMD 2.8.3 backend, never a fake. Lexical is a separate arm from semantic, which requires a provisioned absolute local embedding model. Downloads/native source builds are blocked; fresh readiness and the requested mode are required. Partial branches remain labeled and are included in the denominator.

For each question:

1. Run rich search at limit 10 with the case's fixed depth/temporal options. This is the page-finding track and a separate diagnostic view; its results are not supplied to the recall interaction or used to choose reads.
2. Run compact recall at limit 5 and 8,192 serialized UTF-8 bytes with the same depth/date options.
3. In returned passage order, choose the first three distinct documents with available verified expansion handles. Read from canonical line 1 with the current hash and an 8,192-byte cap per document. Do this for every case, regardless of whether a gold clause was already shown. Do not retry errors, follow gold links or add hidden file reads. A failed expansion consumes one slot and its error output is charged.
4. Total response bytes must not exceed 32,768; each response is at most 8,192. Requests are additionally tokenized and reported, outside the product's response-byte budget. Initial and post-expansion evidence are scored separately.

The whole-document follow-up policy is deliberately simple and potentially wasteful. It is not a claim about how a real agent would choose reads. It gives later experiments an explicit, reproducible interaction baseline rather than an oracle that expands only when expected evidence is missing.

## Scores and interpretation

- Search: required-page hit at 5/10 and reciprocal rank at 10. Navigation cases are the primary human page-finding score; all-query page reachability is a diagnostic. Multiple required files additionally receive file coverage at 10. This does not measure browser recognition or human opens/time.
- Evidence: for each rubric unit, every complete required clause must occur in verified displayed source spans from an allowed source. Clauses may occur in separate reads of the same source; unrelated files cannot supply partial text. Multiple alternatives are supported but no automatically inferred equivalent wording earns credit. Report macro unit coverage and the count of cases with all units present, initially and after reads.
- A canonical file or matching keyword is not enough. Each recall excerpt must match its current cited source range using the production whitespace/omission-marker verifier; expansion bytes/ranges and hashes must match exactly. Invalid provenance earns no unit credit and is reported separately.
- Required-span coverage is a conservative mechanical diagnostic of supplied evidence, **not semantic entailment, fully supported-answer accuracy, or autonomous abstention**. It can miss a valid differently worded source and does not detect every misleading juxtaposition. Manual review must retain this distinction.
- Limits questions have an explicit unknown-approver record. Finding it supports bounded uncertainty in this workspace, not a universal proof that approval never occurred. No answer agent runs in v1, so unsupported answer generation and actual abstention are unmeasured.
- Context cost: exact product response JSON+LF, all request JSON+LF and expansion errors, tokenized with pinned `js-tiktoken@1.0.21`, `cl100k_base`. Agent recall cost excludes the independent human rich-search call. Backend inference/index work is separate, not free agent context and not included in visible token counts.
- Operations: separate initial/no-op index time and DB size, first versus later query times, whole interaction p50/p95 and sampled descendant-process RSS. Sampling at 500 ms can miss short peaks and omits GPU allocations; timing includes sampling overhead and uncontrolled OS cache/background activity. These observations cannot pass quiet-window latency/RSS adoption gates by themselves.

## Repetition and output

Default to two complete clean-root runs per selected mode. Keep query order fixed; the first query is process/model cold, later calls still launch QMD children. Do not call all repeated calls warm or flush OS caches implicitly. Compare per-case rank/evidence/cost outputs excluding timings, and record nondeterminism rather than hiding it. Content hashes, not source commit alone, identify the runtime and eval.

Generated roots, SQLite/embeddings, full packets, logs and resource samples live under ignored `.runs/`. Commit this protocol, corpus, runner, questions/rubric, dependency lockfile, input/runtime hash manifest and a compact dated scorecard. Preserve selected raw run records in an externally archived hashed file. A second command must reproduce the diagnostic score without private data or a paid API in lexical mode.

## Experiment gates

No production retrieval change is part of this baseline. The three separate task lists own evidence-context, local reranking and explicit-neighbor experiments. Select their affected development slices from documented failure mechanisms; freeze numeric quality/context/resource gates before new outputs. Reusing this baseline's reserved cases is a paired regression comparison, not fresh blind replication. Add new scenario structures before a production-quality generalization claim.

Lifecycle, CLI/loopback transport parity, human browser usability, Linux/VPS capacity and independently judged answer quality are separate checks with their own coverage. The scorecard must identify which actually ran. No single overall "accuracy" combines them.
