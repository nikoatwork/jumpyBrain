# Adapted Letta LoCoMo retrieval pilot

Completed 2026-11-07. The explicitly authorized local comparison ran end to end through existing Codex subscription access, coordinated by T3. It is an adapted LoCoMo pilot, not a reproduction of Letta's published score. The broader [retrieval evaluation](../todo/tasks-workspace-retrieval-evaluation.md) remains active; the [feedback index](../feedback.md) records partial resolution of the November 6 request.

## Outcome

The strongest observed baseline was indexed lexical search. Optional vector discovery did not demonstrate an accuracy increment. Retain lexical default and optional embeddings while improving evidence completeness and gathering broader evidence; this pilot does not justify backend removal or establish that vectors reduce accuracy. No jumpyBrain runtime, installation or release changed.

| Arm | Reference match | Source-supported after coverage audit |
| --- | ---: | ---: |
| File listing, grep and reads | 29/39 | 28/39 |
| Same file tools plus BM25 | 32/39 | 32/39 |
| Same file tools/BM25 plus optional vectors | 28/39 | 26/39 |

All 117 corrected-run answers, 117 primary blind grades and 33 predeclared repeat grades completed, with no execution failures or native-tool attempts. All answer/grade calls requested GPT-6.1 Sol at medium reasoning. Local vectors used provisioned EmbeddingGemma 300M Q8_0, 768 dimensions. These are subscription usage results, with no separate API-key/billing flow; immutable server model revision is not exposed.

The semantic arm used vectors in five of 39 questions. None demonstrated a paired accuracy gain over the lexical baseline. Five of its six source-supported losses against that baseline occurred without a vector call. Observed differences include missed evidence, omissions despite retrieved evidence, abstention, conflicting temporal facts and reference ambiguity. They are not isolated embedding-model effects.

## Completed work

- [x] Audit/pin upstream source and public dataset; separate corpus, questions and grading answers; freeze 39 pilot questions across ten conversations and four eligible categories.
- [x] Implement a bounded adaptive three-arm retrieval gateway and subscription model transport with fresh per-decision contexts, disabled native execution, corpus allowlists and trace audits. Validate on synthetic fixtures before benchmark answers.
- [x] Freeze and run all 117 cases, with shared model/budgets, seeded interleaving and local-only embedding inference. Retain the initial aborted infrastructure attempt separately.
- [x] Grade blind, repeat the predeclared disagreement subset, inspect every differing question triple and vector-use trace, and record source/citation and reference limitations.
- [x] Preserve exact commands, identities, failures, raw traces, aggregate costs, reports and visualization in the external research repository. Commit scoped tooling/results there.
- [x] Parent review: inspect model controls, retrieval gateway, protocol, grading, report and paired evidence; rerun the completed-run audit. Record the scoped completion here and update parent/email ownership.

## Cost and verification

Corrected answering/grading recorded 5,469,357 input tokens (2,344,832 cached, included in input) and 46,806 output tokens. Answer generation took 830.2 seconds at concurrency three. All retained CLI phases recorded at least 6,099,400 input tokens; interrupted requests and one overwritten pre-freeze synthetic trace make all-attempt consumption incomplete. Parent/controller chat usage is excluded. Fresh per-decision calls resend history, so these figures do not predict a persistent agent's cost.

Embedding preparation took 27.2 seconds and the five semantic-query embeddings totaled 0.211 seconds. Existing model provisioning cost is excluded; memory/installation savings from removing QMD were not measured.

External research commit: `f8c8ae4f35eee291193fec03f07f59281982f3d0`. Artifacts: `REPORT.md`, `SUMMARY.json`, `REVIEW.md`, `COSTS.json`, `AUDIT.json`, `CITATION_AUDIT.json`, `ORDER_DIAGNOSTIC.json`, `FREEZE.json`, `PROTOCOL.md` and `pilot-scores.html`. Broad benchmark code/data and raw traces remain outside this product repository.

- Twenty-one focused preparation/gateway/analysis tests passed in the research checkout. No broad product suite was needed for this documentation-only integration.
- Parent reran `python3 audit_run.py`: exact source/data/model identities, 117-case matrix, 579 distinct model-call threads, 117 primary and 33 repeat grades, zero identity errors and zero native-tool attempts verified.
- Documentation integration: local links/anchors reviewed and `git diff --check` passed.
- V2 freeze: `4ab13167573c9e70c9d28bc1ebcb714566fa2234cce3daf66a64a52e538af2ad`.
- Dataset SHA-256: `79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4`.
- Embedding SHA-256: `b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63`.

## Limits and retained follow-up

Default parallel grep ordering changed bounded excerpts for identical searches. The frozen citation gate wrongly required a citation to fit inside a single excerpt; a disclosed deterministic union-of-excerpts audit corrected the metric without changing answers or primary grades. One holiday question received asymmetric source-support judgments. Same-model grading, only ten conversation clusters, one answer per arm/question, public-data contamination risk, excluded adversarial questions and incomplete image context limit generalization. Original scores, failed attempts and diagnostic variants remain visible.

A fresh confirmation must fix ordering and citation coverage, predeclare consistent ordinary-knowledge rules and repeat answering before stronger causal claims. Broader knowledge-worker and human-search tasks belong to the active parent. No full-dataset run, embedding-model sweep, human-search result, jumpyBrain backend equivalence, non-inferiority or removal verdict is claimed.
