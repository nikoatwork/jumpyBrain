# LongMemEval-S: QMD no-embed first runs

Date: 2026-06-02

## System Under Test

- jumpyBrain memory root materialized per question
- Canonical memory: original Markdown files
- Retrieval: real QMD CLI over original Markdown files
- Local fallback: none
- Embeddings: disabled for these summary runs
- Paid model calls: none

## Commands

```bash
npm run bench:longmemeval:run -- --limit 10 --k 10
npm run bench:longmemeval:score -- --limit 10 \
  --failure-report bench-results/longmemeval/real-run.failures.json

npm run bench:longmemeval:run -- --limit 50 --k 10 \
  --out bench-results/longmemeval/real-run-l50.jsonl \
  --workspace-root .bench-tmp/longmemeval/real-workspaces-l50
node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/score.ts \
  --fixture benchdata/longmemeval/longmemeval_s_cleaned.json \
  --run bench-results/longmemeval/real-run-l50.jsonl \
  --summary-json bench-results/longmemeval/real-run-l50.summary.json \
  --failure-report bench-results/longmemeval/real-run-l50.failures.json \
  --limit 50
```

Typed smoke samples used `--question-type <type> --limit 3` for each non-`single-session-user` type.

## Results

### First 10

```text
questions: 10
question_type: single-session-user
hit@1: 1.0
hit@5: 1.0
hit@10: 1.0
MRR: 1.0
all_evidence@10: 1.0
avg returned chars: 1312.6
returned chars p50/p95: 495 / 3494
avg latency: 1385.3 ms/question
latency p50/p95: 1389 / 1922 ms
failures@10: 0
```

### First 50

```text
questions: 50
question_type: single-session-user
hit@1: 0.88
hit@5: 0.94
hit@10: 0.94
MRR: 0.9017
all_evidence@10: 0.94
avg returned chars: 931.12
returned chars p50/p95: 495 / 2812
avg latency: 4083.24 ms/question
latency p50/p95: 3729 / 6405 ms
failures@10: 3
```

Misses@10:

```text
6b168ec8 -> gold answer_e623ae87, retrieved ultrachat_249928, 33dff20c_3
e01b8e2f -> gold answer_5ca6cd28, retrieved none
19b5f2b3 -> gold answer_5ff494b9, retrieved none
```

### Typed smoke samples (`limit 3` each)

| question_type | hit@1 | hit@5 | hit@10 | MRR | all_evidence@10 | latency p50/p95 ms | failures@10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| multi-session | 0.3333 | 1.0000 | 1.0000 | 0.5111 | 0.6667 | 1887 / 1892 | 1 |
| single-session-preference | 0.3333 | 0.3333 | 0.6667 | 0.3889 | 0.6667 | 1883 / 1895 | 1 |
| temporal-reasoning | 0.3333 | 0.6667 | 0.6667 | 0.5000 | 0.6667 | 1894 / 1987 | 1 |
| knowledge-update | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.6667 | 1862 / 1885 | 1 |
| single-session-assistant | 0.3333 | 0.3333 | 0.3333 | 0.3333 | 0.3333 | 1900 / 1904 | 2 |

## Notes

- Strong first signal for a no-embed, no-paid-call retrieval path on the first 50 `single-session-user` rows.
- Not a full benchmark claim: the first 50 all share one question type, and typed samples are intentionally tiny smoke tests.
- Typed smoke samples expose harder behavior for multi-evidence, preferences, temporal reasoning, and assistant-answer questions.
- The run exposed useful implementation issues:
  - QMD path normalization can differ from filesystem paths.
  - Direct natural-language lexical search can miss morphology like `graduate` vs `graduated`.
  - QMD snippets may land on frontmatter/headings and need repair from original Markdown.
  - Some QMD JSON outputs can be malformed for individual lexical queries, so jumpyBrain now keeps the run alive and merges other QMD candidates.

## Retrieval decisions from this pass

- Keep QMD-only retrieval for the next iteration; do not add a local fallback.
- Keep query relaxation simple and explainable: normalized lexical query plus salient term pairs, merged across QMD `search` and `query` when available.
- Keep snippets bounded and provenance-rich, repairing frontmatter/header-only snippets from original Markdown.
- Add lightweight temporal, memory-strength, and provenance-confidence score components, but treat broader tuning as follow-up work driven by typed failures.
- Keep recall visible/manual by default; do not introduce hidden prompt injection.
- Keep wrapup CLI-mediated for now. Existing dogfood memories were useful for recalling durable QMD-only decisions, while benchmark-reporting recall had no prior note and should be captured in public task/changelog docs instead.

### Typed samples (`limit 10` each)

| question_type | hit@1 | hit@5 | hit@10 | MRR | all_evidence@10 | latency p50/p95 ms | failures@10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| multi-session | 0.5000 | 0.9000 | 0.9000 | 0.6367 | 0.6000 | 1661 / 1747 | 4 |
| single-session-preference | 0.3000 | 0.4000 | 0.6000 | 0.3643 | 0.6000 | 1676 / 1704 | 4 |
| temporal-reasoning | 0.4000 | 0.7000 | 0.7000 | 0.5250 | 0.4000 | 1689 / 1726 | 6 |
| knowledge-update | 0.9000 | 1.0000 | 1.0000 | 0.9200 | 0.7000 | 1330 / 1676 | 3 |
| single-session-assistant | 0.2000 | 0.3000 | 0.3000 | 0.2250 | 0.3000 | 1748 / 1933 | 7 |

## Next Comparison Targets

- Inspect typed failure reports and tune for all-evidence aggregation, preferences, temporal cues, and assistant-answer questions.
- Compare no-embed vs embed on a fixed typed sample.
- Decide whether benchmark scaling needs reusable workspaces or cached QMD indexes.
