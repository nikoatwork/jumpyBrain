# LongMemEval-S: QMD query/snippet tuning and mode comparison

Date: 2026-06-03

## System Under Test

- jumpyBrain memory root materialized per question
- Canonical memory: original Markdown files
- Retrieval default: real QMD CLI over original Markdown files
- Local fallback: none
- Default embeddings: disabled
- Paid model calls: none

## Changes Tested

- High-signal adjacent phrase queries before broad full-question lexical queries.
- Conversational stopword cleanup for benchmark-style recall questions.
- Minimal measured plural normalization only: `ies -> y`, trailing `s`.
- Stricter unhelpful-snippet detection for frontmatter/header-only snippets.
- Body snippet repair around the best query line, with short snippets expanded using following context.
- Repeatable comparison switch: `JUMPYBRAIN_QMD_MODE=search|query|vsearch|merged`.

## Commands

Targeted hard cases:

```bash
for qid in 7161e7e2 89527b6b 4c36ccef gpt4_f49edff3 06878be2 caf03d32; do
  node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/run-retrieval.ts \
    --data benchdata/longmemeval/longmemeval_s_cleaned.json \
    --workspace-root .bench-tmp/longmemeval/qmd-tuning-targeted-2026-06-03 \
    --out bench-results/longmemeval/qmd-tuning-targeted-2026-06-03.jsonl \
    --question-id "$qid" --k 10 --resume
done
```

Typed reruns:

```bash
for type in single-session-assistant single-session-preference temporal-reasoning; do
  node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/run-retrieval.ts \
    --data benchdata/longmemeval/longmemeval_s_cleaned.json \
    --workspace-root ".bench-tmp/longmemeval/qmd-tuning-${type}-l10-2026-06-03" \
    --out "bench-results/longmemeval/qmd-tuning-${type}-l10-2026-06-03.jsonl" \
    --question-type "$type" --limit 10 --k 10

done
```

First-50 single-session-user rerun:

```bash
node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/run-retrieval.ts \
  --data benchdata/longmemeval/longmemeval_s_cleaned.json \
  --workspace-root .bench-tmp/longmemeval/qmd-tuning-real-run-l50-2026-06-03 \
  --out bench-results/longmemeval/qmd-tuning-real-run-l50-2026-06-03.jsonl \
  --limit 50 --k 10
```

QMD mode comparison fixed sample:

```bash
for mode in search query vsearch merged; do
  JUMPYBRAIN_QMD_MODE="$mode" node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/run-retrieval.ts \
    --data .bench-tmp/longmemeval/qmd-mode-compare-2026-06-03.fixture.json \
    --workspace-root ".bench-tmp/longmemeval/qmd-mode-${mode}-fixed-l3-2026-06-03" \
    --out "bench-results/longmemeval/qmd-mode-${mode}-fixed-l3-2026-06-03.jsonl" \
    --k 10

done
```

## Results

### Targeted six-failure sample

- Output: `bench-results/longmemeval/qmd-tuning-targeted-2026-06-03.jsonl`
- Summary: `bench-results/longmemeval/qmd-tuning-targeted-2026-06-03.summary.json`
- Result: 6/6 hit@1 and all_evidence@10 across assistant, preference, and temporal cases.

### Affected typed `limit 10` reruns

| question_type | old hit@1 | new hit@1 | old hit@5 | new hit@5 | old hit@10 | new hit@10 | old all_evidence@10 | new all_evidence@10 | failures@10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| single-session-assistant | 0.20 | 1.00 | 0.30 | 1.00 | 0.30 | 1.00 | 0.30 | 1.00 | 0 |
| single-session-preference | 0.30 | 0.50 | 0.40 | 0.80 | 0.60 | 0.80 | 0.60 | 0.80 | 2 |
| temporal-reasoning | 0.40 | 1.00 | 0.70 | 1.00 | 0.70 | 1.00 | 0.40 | 1.00 | 0 |

Remaining preference misses:

- `75832dbd`: recent publications/conferences
- `195a1a1b`: evening activities

Interpretation: remaining preference failures likely need preference/profile synthesis or broader all-session evidence, not just another lexical phrase tweak.

### First-50 single-session-user rerun

- Output: `bench-results/longmemeval/qmd-tuning-real-run-l50-2026-06-03.jsonl`
- Summary: `bench-results/longmemeval/qmd-tuning-real-run-l50-2026-06-03.summary.json`

```text
questions: 50
question_type: single-session-user
hit@1: 0.92
hit@5: 0.92
hit@10: 0.92
MRR: 0.92
all_evidence@10: 0.92
avg returned chars: 2260.22
returned chars p50/p95: 2526 / 4605
avg latency: 1737.1 ms/question
latency p50/p95: 1905 / 2183 ms
failures@10: 4
```

Interpretation: still above the BM25-class `hit@5 >= 0.86` target for this first-50 sample and faster than the earlier l50 baseline. Not a stable broad claim; the earlier first-50 hit@5/hit@10 was 0.94, so typed gains came with a small first-50 regression.

### QMD mode comparison fixed sample

Fixed sample:

- `7161e7e2`: `single-session-assistant`
- `06878be2`: `single-session-preference`
- `gpt4_f49edff3`: `temporal-reasoning`

| mode | output | hit@1 | hit@5 | hit@10 | all_evidence@10 | avg latency |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| QMD `search` only | `bench-results/longmemeval/qmd-mode-search-fixed-l3-2026-06-03.summary.json` | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1876 ms |
| QMD `query --no-rerank` lex-only | `bench-results/longmemeval/qmd-mode-query-fixed-l3-2026-06-03.summary.json` | 0.6667 | 1.0000 | 1.0000 | 1.0000 | 636 ms |
| QMD `vsearch` embeddings | `bench-results/longmemeval/qmd-mode-vsearch-fixed-l3-2026-06-03.summary.json` | 1.0000 | 1.0000 | 1.0000 | 0.6667 | 33647 ms |
| Current merged lexical path | `bench-results/longmemeval/qmd-mode-merged-fixed-l3-2026-06-03.summary.json` | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 2132 ms |

## Decisions

- Keep the current no-embed merged lexical path as the default because it preserved full evidence on the hard sample at ~2.1s/question.
- Do not make embeddings default for scaling: QMD `vsearch` was ~15-50x slower than lexical modes and missed one temporal all-evidence session despite hit@1 = 1.0.
- Keep QMD embeddings optional/experimental; revisit only after lexical failure modes plateau or cached embedding runs become practical.
- `query --no-rerank` lex-only is promising for speed, but its lower hit@1 on this sample makes it a future optimization rather than the default.
- For repeated benchmark sweeps, cache/reuse materialized workspaces and QMD indexes because Markdown is canonical and indexes are derived/rebuildable.

## Scaling Estimate

- Current no-embed merged lexical reruns measured ~1.7-2.1s/question on the sampled runs.
- A 500-question sweep is roughly 15-20 minutes at the measured average.
- Conservative planning band: 20-30 minutes for local variability.
- Earlier untuned l50 averaged ~4.1s/question, which would put 500 questions around 34 minutes.
- QMD `vsearch` at ~33.6s/question would put 500 questions around 4.7 hours and still did not improve all-evidence recall on the fixed sample.
