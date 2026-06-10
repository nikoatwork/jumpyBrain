# LongMemEval-S memsearch comparison partial

Date: 2026-06-03
Status: partial / local smoke only

## Framing

This is a retrieval-only pressure test over materialized LongMemEval-S Markdown session workspaces. It compares context/source loading, not generated answer quality or agent context-packet usefulness. No capture, summarization, or paid LLM calls were used.

## memsearch local mode

- CLI: `memsearch 0.4.6` in local virtualenv
- Embeddings: local ONNX provider (`--provider onnx`)
- Vector/index backend: Milvus Lite, isolated per-question state under `.bench-tmp/longmemeval/`
- Runner: `benchmarks/longmemeval/run-memsearch.ts`
- Scorer: existing `benchmarks/longmemeval/score.ts`

## Smoke results

| adapter | question_type | limit | hit@1 | hit@5 | hit@10 | MRR | all_evidence@10 | avg returned chars | avg latency |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| memsearch | single-session-user | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 5330 | 571,964 ms |
| memsearch | multi-session | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 7344 | 131,428 ms |

Relevant raw local outputs:

- `bench-results/longmemeval/memsearch-single-session-user-l3.jsonl`
- `bench-results/longmemeval/memsearch-single-session-user-l3.summary.json`
- `bench-results/longmemeval/memsearch-multi-session-l1.jsonl`
- `bench-results/longmemeval/memsearch-multi-session-l1.summary.json`

## Comparison context

Existing jumpyBrain no-embed typed `--limit 10` baselines from 2026-06-02:

| adapter | question_type | limit | hit@1 | hit@5 | hit@10 | MRR | all_evidence@10 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| jumpyBrain/QMD | single-session-user | 50 | 0.88 | 0.94 | 0.94 | 0.9017 | 0.94 |
| jumpyBrain/QMD | multi-session | 10 | 0.50 | 0.90 | 0.90 | 0.6367 | 0.60 |
| jumpyBrain/QMD | single-session-preference | 10 | 0.30 | 0.40 | 0.60 | 0.3643 | 0.60 |
| jumpyBrain/QMD | temporal-reasoning | 10 | 0.40 | 0.70 | 0.70 | 0.5250 | 0.40 |
| jumpyBrain/QMD | knowledge-update | 10 | 0.90 | 1.00 | 1.00 | 0.9200 | 0.70 |
| jumpyBrain/QMD | single-session-assistant | 10 | 0.20 | 0.30 | 0.30 | 0.2250 | 0.30 |

The memsearch smoke results are promising but not yet comparable to typed `--limit 10` QMD baselines because only 3 easy and 1 hard item have run.

## Operational finding

Local memsearch ONNX indexing is expensive when indexing one LongMemEval workspace per question. An attempted harder-type `--limit 3` loop saturated CPU on an M3 MacBook Pro with 32 GB RAM and was stopped. A throttled one-item run with thread caps and `nice` completed cleanly.

Recommended local command shape for future memsearch runs:

```bash
export OMP_NUM_THREADS=2
export OPENBLAS_NUM_THREADS=2
export VECLIB_MAXIMUM_THREADS=2
export MKL_NUM_THREADS=2
export NUMEXPR_NUM_THREADS=2
nice -n 10 node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/run-memsearch.ts \
  --data benchdata/longmemeval/longmemeval_s_cleaned.json \
  --workspace-root .bench-tmp/longmemeval/memsearch-<type>-l1 \
  --state-root .bench-tmp/longmemeval/memsearch-state-<type>-l1 \
  --out bench-results/longmemeval/memsearch-<type>-l1.jsonl \
  --question-type <type> --limit 1 --k 10 \
  --memsearch-bin .bench-tmp/memsearch-venv/bin/memsearch
```

## Current decision

Continue memsearch evaluation one question/type at a time or redesign the comparison to avoid per-question full re-embedding before attempting typed `--limit 10` runs. Do not treat full typed memsearch evals as cheap default validation.
