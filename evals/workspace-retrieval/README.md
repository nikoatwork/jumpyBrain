# Knowledge-workspace retrieval evaluation

This opt-in developer suite measures realistic page finding and evidence delivery over fictional Markdown. Read [the protocol](PROTOCOL.md) before interpreting scores. Evaluation assets are excluded from installation; scores do not establish answer accuracy.

```sh
npm ci
npm ci --prefix evals/workspace-retrieval
npm run build
JUMPYBRAIN_QMD_BIN=/absolute/path/to/qmd npm run eval:workspace -- --modes lexical --repeats 2
JUMPYBRAIN_QMD_BIN=/absolute/path/to/qmd npm run eval:workspace -- --modes semantic --model /absolute/provisioned/embedding.gguf --repeats 2
```

QMD 2.8.3 must already be installed with its SDK/native dependencies; semantic models must be provisioned beforehand. The runner does not download models or build native code. `--name <unique-name>` names a run; existing directories are refused. Failed runs remain available for diagnosis. The lexical run needs no model or API credentials. Provisioning dependencies is separate from offline evaluation execution.

The runner prints progress and writes ignored `.runs/<name>/REPORT.json`, a `FREEZE.json`, per-mode packets, scores, index observations and logs. These include local machine paths and should not be published as-is. Commit a compact reviewed report and reproducibility manifest under `reports/`; archive bulky raw records separately with a checksum. Keep baseline failures and operational corrections visible.

The installable runtime already lives in generated, ignored root `dist/`. `package.json` uses an explicit `files` allowlist, and pack validation rejects `package/evals/`. Evaluation code, fixtures, its dependency installation, and run outputs belong to the development checkout and are excluded from the shipped tarball. Git tracking and package inclusion are separate: version the small reproducible suite/report; ignore generated runs. No app relocation is needed. Local build/pack commands do not require committing unfinished evaluation work. The published-release workflow still requires a clean agreed snapshot; use its documented clean-checkout approach when unrelated work is in progress, rather than weakening that safeguard or shipping it.

`build-corpus.mjs` deterministically materializes the authored fixture and rubrics from `scenarios.mjs`. Do not regenerate or edit frozen inputs mid-run. Dataset changes need a new protocol/input version and baseline; they cannot silently improve an old score. Normal `npm test` runs only small pure scoring/data-flow regressions and never this full suite or its tokenizer/model installation.

## Isolated retrieval experiments

[Experiment contract](EXPERIMENTS.md) freezes affected slices and quality/context/resource gates. `--suite augmented` retains v1 and adds six longer operating workflows; `--suite confirmation` additionally includes the fresh ferry/reservoir confirmation cases. `--arm baseline|evidence|rerank|neighbors|identity` selects evaluation-only instrumentation of the real compiled driver and verified compact packet seams. Gold remains scoring-only. A seam mismatch aborts instead of silently changing the experiment. These controls are developer tooling, not installed runtime options.

```sh
npm run eval:workspace -- --suite augmented --arm baseline --repeats 1 --name control-v2
npm run eval:workspace -- --suite augmented --arm evidence --repeats 1 --name evidence-v2
npm run eval:workspace -- --suite augmented --arm rerank --rerank-model /absolute/provisioned/reranker.gguf --repeats 1 --name rerank-v2
npm run eval:workspace -- --suite augmented --arm neighbors --repeats 1 --name neighbors-v2
npm run eval:workspace -- --suite confirmation --arm baseline --repeats 1 --name control-v3
npm run eval:workspace -- --suite confirmation --arm identity --repeats 1 --name identity-v3
node evals/workspace-retrieval/compare-experiments.mjs evals/workspace-retrieval/.runs/control-v2 /tmp/comparison.json evals/workspace-retrieval/.runs/evidence-v2 evals/workspace-retrieval/.runs/rerank-v2 evals/workspace-retrieval/.runs/neighbors-v2
```

A historical comparison requires the exact unchanged product snapshot named in its report, not whatever runtime is currently built. Keep the original v1 fixture intact. The Python builders materialize the separately authored augmentation/confirmation inputs; never regenerate frozen data during a run. Model-cost probes must use the run's `offline-guard.mjs` via `NODE_OPTIONS=--import=/absolute/path/to/offline-guard.mjs`; `rerank-probe.mjs` takes a captured packet, provisioned model, output path, candidate count and repeat count. CPU feasibility uses `QMD_LLAMA_GPU=off`. Quality runs and diagnostic probes may overlap, but their timings cannot pass a quiet-window gate. `time-identity.mjs` is a separate sequential 20-pair timing/RSS probe for a quality-passing identity arm.

[The v2 report](reports/2026-10-28-experiments-v2.md) records why the original three prototypes were rejected. Actual answer accuracy, independent judgments and VPS performance are separate from the canonical required-span diagnostic.

`--runtime-root /absolute/frozen/runtime-root` reads `src/` and built `dist/` from an isolated snapshot and rechecks that full map at completion. It does not rebuild or mutate that source tree. This avoids concurrent checkout edits invalidating a historical comparison. The [identity follow-up report](reports/2026-10-28-identity-v4.md) records both unsuccessful confirmation sets and the final no-adoption decision. Use `--suite confirmation-extra` to retain all 210 pages / 124 tasks; all reserved families are now seen controls.

## Named-source discovery follow-up

[The discovery contract](DISCOVERY-EXPERIMENT.md) tests the next failure stage: a required named source absent from ordinary candidates. `--suite discovery-confirmation` retains all v1–v4 controls and adds separately authored fresh cases. Freeze the complete inputs before running any arm; fresh cases become seen after this comparison.

```sh
npm run eval:workspace -- --suite discovery-confirmation --arm baseline --runtime-root /absolute/frozen/runtime-root --repeats 2 --name discovery-v5-control
npm run eval:workspace -- --suite discovery-confirmation --arm discovery --runtime-root /absolute/frozen/runtime-root --repeats 1 --name discovery-v5-only
npm run eval:workspace -- --suite discovery-confirmation --arm discovery-identity --runtime-root /absolute/frozen/runtime-root --repeats 1 --name discovery-v5-ordered
```

Discovery adds at most eight missing canonical title/alias/tag matches at score zero before the real driver's source repair. Original candidates survive. The combined arm additionally applies the unchanged prior identity policy to the first 40 grouped results. These are separate mechanisms; admission alone does not establish sufficient displayed evidence or an adoption win.

Packets record separate search and compact-recall diagnostics, with canonical candidate files before/after supplementation and complete grouped file paths. Scores bind required-file admission to the scoring rubric only after execution. Comparison rejects mismatched input/product/backend/tokenizer identities and records lost unit labels, including a lost unit masked by a different gained unit. Instrumentation adds no installed API or model.

The [v5 outcome](reports/2026-10-29-discovery-v5.md) rejects discovery alone and adopts the passing combined policy for lexical production retrieval after fresh quality, source review, quiet operating-cost and exact 140-case production parity checks. The eval arm names remain developer-only instrumentation. `--arm baseline` on a newly built production runtime observes its new default; reproduce the unchanged control with the archived original runtime. There is no product flag to disable the new policy. All v5 cases are now seen controls.
