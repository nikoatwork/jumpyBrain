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
{"question_id":"q-single-release-notes","question_type":"single-session-user","adapter":"jumpybrain","latency_ms":123,"returned_chars":456,"results":[{"session_id":"s-alpha","path":"...","snippet":"..."}]}
```

Required comparison fields are `question_id`, `question_type`, `adapter`, `latency_ms`, `returned_chars`, and `results`; `cli_error` is optional and should explain dependency/runtime skips. `results[].session_id` is the primary provenance field. `results[].provenance.session_id` is accepted as a fallback. Keep snippets and file/line provenance when available so failure reports remain inspectable.

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

## Optional memsearch comparison

The memsearch comparison is optional and is not part of `npm test` or `npm run validate`. It indexes the same materialized LongMemEval-S Markdown session workspaces and performs retrieval only; it does not run capture, summarization, `memsearch compact`, or paid LLM calls.

Current upstream memsearch docs recommend installing the CLI with local ONNX embeddings:

```bash
# Optional dependency, outside normal jumpyBrain tests
uv tool install "memsearch[onnx]"
# or
python -m pip install "memsearch[onnx]"
```

The adapter defaults to local no-paid-call mode: `--provider onnx`, Milvus Lite, and isolated per-question state under `.bench-tmp/longmemeval/memsearch-state/`. If the CLI or provider extras are absent, rows are written with `adapter: "memsearch"`, empty results, and `cli_error` so scoring/skips are explicit.

Local ONNX indexing can saturate CPU on large LongMemEval workspaces. Prefer one type/item at a time and throttle runs on laptops:

```bash
export OMP_NUM_THREADS=2
export OPENBLAS_NUM_THREADS=2
export VECLIB_MAXIMUM_THREADS=2
export MKL_NUM_THREADS=2
export NUMEXPR_NUM_THREADS=2
```

Then prefix the runner with `nice -n 10` if desired. The first local smoke observed good retrieval but high per-workspace indexing latency, so avoid long loops unless runtime is acceptable.

Smoke commands:

```bash
MEMSEARCH_BIN="memsearch" # or .bench-tmp/memsearch-venv/bin/memsearch

node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/run-memsearch.ts \
  --data benchdata/longmemeval/longmemeval_s_cleaned.json \
  --workspace-root .bench-tmp/longmemeval/memsearch-single-session-user-l3 \
  --out bench-results/longmemeval/memsearch-single-session-user-l3.jsonl \
  --question-type single-session-user --limit 3 --k 10 --memsearch-bin "$MEMSEARCH_BIN"
node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/score.ts \
  --fixture benchdata/longmemeval/longmemeval_s_cleaned.json \
  --run bench-results/longmemeval/memsearch-single-session-user-l3.jsonl \
  --summary-json bench-results/longmemeval/memsearch-single-session-user-l3.summary.json \
  --failure-report bench-results/longmemeval/memsearch-single-session-user-l3.failures.json \
  --question-type single-session-user --limit 3
```

Typed comparison pattern:

```bash
TYPE=multi-session
node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/run-memsearch.ts \
  --data benchdata/longmemeval/longmemeval_s_cleaned.json \
  --workspace-root ".bench-tmp/longmemeval/memsearch-${TYPE}-l10" \
  --out "bench-results/longmemeval/memsearch-${TYPE}-l10.jsonl" \
  --question-type "$TYPE" --limit 10 --k 10 --memsearch-bin "$MEMSEARCH_BIN"
node benchmarks/longmemeval/run-script.mjs benchmarks/longmemeval/score.ts \
  --fixture benchdata/longmemeval/longmemeval_s_cleaned.json \
  --run "bench-results/longmemeval/memsearch-${TYPE}-l10.jsonl" \
  --summary-json "bench-results/longmemeval/memsearch-${TYPE}-l10.summary.json" \
  --failure-report "bench-results/longmemeval/memsearch-${TYPE}-l10.failures.json" \
  --question-type "$TYPE" --limit 10
```

Compare memsearch summaries with the existing jumpyBrain typed summaries in `bench-results/longmemeval/type-*-l10.summary.json`. LongMemEval-S remains a retrieval pressure test for source/session recovery and all-evidence loading; it does not prove downstream agent-context packet usefulness, noise, or answer quality.

## Comparing runs

Keep raw JSONL under `bench-results/longmemeval/` and curated summaries under `benchmarks/results/longmemeval/`. To compare two runs, score both with the same fixture/data path, `--limit`/filters, and `--k`, then compare:

- `overall.hit_at_1`, `hit_at_5`, `hit_at_10`, `mrr`, and `all_evidence_at_10`
- latency p50/p95 and returned chars p50/p95
- `by_question_type` changes
- `failures_at_10` overlap and top snippets

Do not commit downloaded data, expanded workspaces, or raw results unless explicitly approved. Curated summaries may be committed when they omit raw benchmark data.
