# Core memory-root docs

## Responsibilities

- Initialize and inspect memory-root configuration, schema compatibility, standard directories, and derived-state ignore policy.
- Resolve configured memory and index roots using filesystem-local rules that runtime, CLI, and server composition can reuse.
- Keep memory-root setup independent of host package metadata by accepting injected version data from callers.

## Persistent indexing policy

Schema-v1 `jumpybrain.json` may contain `indexing: { "mode": "lexical" }` or `{ "mode": "semantic", "model": "/absolute/local/model.gguf" }` (optional `modelHash`). Core validates mode and absolute semantic path; QMD validates model bytes and compatibility. Missing policy defaults to lexical and is persisted on first indexing, including legacy/manual roots. Explicit local index options replace the choice; otherwise existing configuration wins over legacy environment settings. Policy is saved before backend work, so failed indexing may leave a newly requested policy and stale/incomplete readiness.

Legacy `JUMPYBRAIN_QMD_EMBED=1|true|yes` opts an unconfigured root into semantic policy only with `QMD_EMBED_MODEL` set to an absolute provisioned local GGUF. Core receives this migration choice from the adapter rather than reading QMD environment itself. Once configured, environment values no longer change policy. `index --semantic-model` / `--lexical` are the supported explicit controls.

`indexRoot` affects retrieval input only, not canonical writes/editor lookup. Deleting `.jumpybrain/` leaves Markdown and the root's `jumpybrain.json` policy intact. Preserve both in backups; do not use `init --force` as index recovery.

An optional `indexing.modelHash` pins local model bytes by SHA-256. Indexing verifies the digest; a changed configured pin disables semantic readiness/query work until resolved. Core owns the shared policy compatibility check, without importing QMD.

## Non-responsibilities

- Do not own QMD indexing/search execution or derived index state beyond path policy constants.
- Do not parse CLI commands or serve HTTP requests.
- Do not read package metadata, logging adapters, remote API configuration, or secrets.
