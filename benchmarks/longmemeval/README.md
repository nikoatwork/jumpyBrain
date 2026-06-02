# LongMemEval benchmark scaffold

This directory contains a minimal, retrieval-only scaffold for measuring jumpyBrain against LongMemEval-shaped tasks. It is fixture-first: contributors can run the synthetic benchmark without downloading LongMemEval data and without making model calls.

## Data policy

- `benchmarks/longmemeval/fixtures/mini-longmemeval.json` is the only committed benchmark data in this scaffold. It is synthetic and tiny.
- Real LongMemEval data must be downloaded locally into `benchdata/longmemeval/` and must not be committed.
- Raw benchmark outputs must be written under `bench-results/longmemeval/` and remain local-only unless explicitly approved for sharing.
- Curated benchmark summaries can be written under `benchmarks/results/longmemeval/`.
- Generated Markdown workspaces must be written under `.bench-tmp/longmemeval/` and are rebuildable.

## Fixture run

From the repository root:

```bash
npm run benchmark:longmemeval:materialize:fixture
npm run benchmark:longmemeval:fake-run
npm run benchmark:longmemeval:score:fixture
```

Or run the end-to-end fixture path:

```bash
npm run benchmark:longmemeval:fixture
```

The fixture path materializes one Markdown memory workspace per question, writes fake retrieval JSONL, and scores it deterministically.

## Materialization shape

`materialize.ts` converts LongMemEval-like rows into one temp Markdown workspace per question:

```text
.bench-tmp/longmemeval/workspaces/
  <question_id>/
    sessions/
      01-<session_id>.md
      02-<session_id>.md
```

Each Markdown file contains frontmatter with:

- `source: "longmemeval"`
- `question_id`
- `session_id`
- `date`

User and assistant turns are preserved as readable Markdown sections. Benchmark-only gold labels such as `has_answer` and `answer_session_ids` are not written to the generated memory files.

## Metrics

`score.ts` reads retrieval JSONL and computes retrieval-only metrics:

- `hit_at_1`
- `hit_at_5`
- `hit_at_10`
- `mrr`
- `all_evidence_at_10`
- average, p50, and p95 returned character count when snippets/text are present
- average, p50, and p95 latency when the runner records `latency_ms`

It prints overall metrics and per-`question_type` breakdowns. Pass `--summary-json <path>` to save a JSON summary next to raw output, and `--failure-report <path>` to save compact misses with question id, type, gold sessions, retrieved sessions, score breakdowns, and top snippets.

## Retrieval JSONL contract

The scorer accepts one JSON object per question with either `results` or `retrieved_session_ids`:

```json
{"question_id":"q-single-release-notes","results":[{"session_id":"s-alpha","path":"...","snippet":"..."}]}
```

`results[].session_id` is the primary provenance field. `results[].provenance.session_id` is accepted as a fallback.

## jumpyBrain CLI contract

The benchmark-facing CLI contract is:

```bash
jumpybrain index --root <memory-root>
jumpybrain search --root <memory-root> --query "<question>" --limit 10 --json
```

`search --json` returns a JSON object with `results`; each result includes `id`, `score`, `snippet`, `provenance.file`, line range, and `provenance.session_id` when present. A benchmark runner should materialize each question workspace, call `jumpybrain index`, call `jumpybrain search`, normalize results into the JSONL contract above, and then call `score.ts`.

Benchmark smoke tests use the real QMD CLI. Install `qmd` before running real jumpyBrain retrieval tests.

## Real LongMemEval-S data

No real LongMemEval data is required for scaffold tests. For local real-data runs:

```bash
npm run bench:longmemeval:download

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

Useful filters:

```bash
npm run bench:longmemeval:run -- --question-type multi-session --limit 5 \
  --out bench-results/longmemeval/type-multi-session-l5.jsonl \
  --workspace-root .bench-tmp/longmemeval/type-multi-session-l5
npm run bench:longmemeval:score -- --question-type multi-session --limit 5 \
  --run bench-results/longmemeval/type-multi-session-l5.jsonl \
  --summary-json bench-results/longmemeval/type-multi-session-l5.summary.json
```

Use `--resume` on `bench:longmemeval:run` to skip question ids already present in the output JSONL.

## Comparing runs

Keep raw JSONL under `bench-results/longmemeval/` and curated summaries under `benchmarks/results/longmemeval/`. To compare two runs, score both with the same fixture/data path, `--limit`/filters, and `--k`, then compare:

- `overall.hit_at_1`, `hit_at_5`, `hit_at_10`, `mrr`, and `all_evidence_at_10`
- latency p50/p95 and returned chars p50/p95
- `by_question_type` changes
- `failures_at_10` overlap and top snippets

Do not commit downloaded data, expanded workspaces, or raw results unless explicitly approved. Curated summaries may be committed when they omit raw benchmark data.
