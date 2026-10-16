# Deterministic QMD lifecycle double

Used by `test/semantic-index-lifecycle.test.js` through the real runtime, SDK
resolver, isolated worker, root lock, and publication/recovery paths. Run:

```sh
npm run build && node --test test/semantic-index-lifecycle.test.js
```

The test installs these files into a disposable `@tobilu/qmd@2.8.3` package:
`bin/qmd` is the executable, `sdk/*.js.fixture` becomes `dist/*.js`, and
`sqlite/` becomes `node_modules/better-sqlite3/`, and `database.cjs.fixture`
becomes `database.cjs`. Template suffixes avoid Node test discovery executing
fixture modules. No package install is needed.

`database.cjs.fixture` recognizes only the worker's SQL statements and fails on unknown
SQL. The database is JSON, committed by atomic rename; changes remain in memory
until COMMIT, and rollback restores the transaction snapshot. Content is keyed
by SHA-256, metadata and actual vector IDs are separate, and blank content is
not embedded. Each nonblank hash has one fake chunk. Counters record committed
embedding/clear work; the external JSONL audit also captures rolled-back work.
The tiny `model.gguf` has the exact magic/bytes required by production hashing,
but is deliberately **not a usable model**.

Fixture-only controls (inherited by child processes):

- `FAKE_QMD_CONTROL`: JSON file with optional `fail` and `gate` fields.
- `FAKE_QMD_EVENTS`: append-only JSONL event output.
- `fail`: `open`, `ingest`, `embed`, `embed-result`, `coverage-vector`,
  `coverage-metadata`, `model-replaced`, `dispose`, `commit`, `search`, or `query`.
- `gate`: embedding creates `<gate>.entered` and waits for `<gate>.release`
  (bounded to ten seconds), enabling deterministic cross-process contention.

The fake LLM rejects unpatched model resolution and native build/download
permission. All fixture controls live here; production contains no fixture
branches. This verifies lifecycle contracts, not real SQLite locking, QMD
chunking/ranking, native model inference, or hard-crash durability. Pending
publication tests reconstruct the commit-before-publication crash state rather
than killing a real QMD process. Real-QMD smoke remains separately provisioned.
