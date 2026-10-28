# Knowledge-workspace retrieval evaluation

This opt-in developer suite measures realistic page finding and evidence delivery over fictional Markdown. Read [the protocol](PROTOCOL.md) before interpreting scores. It does not change retrieval behavior or claim answer accuracy.

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
