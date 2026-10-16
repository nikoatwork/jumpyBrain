# Technical details

This page keeps implementation-oriented details out of the README.

## Architecture boundary

jumpyBrain runs the same Markdown-native app locally and on a server-local root. The CLI selects local runtime operations or remote HTTP transport; indexes remain rebuildable.

[Source architecture](../src/architecture.docs.md) owns dependency direction and module documentation conventions. Start there for source changes, then use the co-located contracts: [canonical storage](../src/core/canonical/canonical.docs.md), [local memory](../src/app/local-memory/local-memory.docs.md), [QMD](../src/adapters/qmd/qmd.docs.md), [server use cases](../src/app/server-memory/server-memory.docs.md), and [HTTP/browser](../src/adapters/http-server/http-server.docs.md).

Distribution is source/installer-first for self-hosted use, not npm-package-first. Do not add a restrictive `package.json` exports map or package-manager self-update flow unless the project explicitly decides to publish to npm later. The supported user-facing surfaces are the CLI, installer scripts, documented server deployment flow, and Markdown memory format; internal TypeScript deep imports remain undocumented implementation details rather than a hidden or stabilized SDK. `jumpybrain update` belongs at the CLI/installer edge: it reads the installer manifest and reruns the public installer instead of adding update behavior to core/app/runtime/server memory semantics.

The intended install paths are:

- local runtime install: use the installer script to place the CLI/runtime under `~/.jumpybrain` by default and run on the same machine as the memory root;
- hosted client install: install the CLI and point it at a deployed jumpyBrain server with `--target-url`/`--remote-url` plus `JUMPYBRAIN_API_KEY`;
- server deploy/experimentation: clone or install the runtime app on a VPS/server and run `jumpybrain serve` against a server-local Markdown memory root.

Other products can consume jumpyBrain through integrations or adapters, but jumpyBrain should not depend on external product internals.

## CLI contract

```bash
jumpybrain instructions
jumpybrain doctor [--root <memory-root>] [--json]
jumpybrain init --root <memory-root>
jumpybrain status --root <memory-root> --json
JUMPYBRAIN_API_KEY=... jumpybrain status --target-url https://memory.example.com --json
jumpybrain tree --root <memory-root> --connections --show-files --limit 25 --json
JUMPYBRAIN_API_KEY=... jumpybrain tree --target-url https://memory.example.com --connections
cat memory.md | jumpybrain remember --root <memory-root> --type finding --title "<title>"
jumpybrain recall --root <memory-root> --query "<question>" --limit 10 --depth normal --json
jumpybrain recall --root <memory-root> --topic "<current topic>" --limit 5 --depth shallow
jumpybrain show --root <memory-root> --id <mem_id> [--json]
cat revised.md | jumpybrain update --root <memory-root> --id <mem_id> --if-match <contentHash> [--json]
JUMPYBRAIN_API_KEY=... jumpybrain show --target-url https://memory.example.com --id <mem_id> [--json]
cat revised.md | JUMPYBRAIN_API_KEY=... jumpybrain update --target-url https://memory.example.com --id <mem_id> --if-match <contentHash> [--json]
jumpybrain dream --root <memory-root> --from t-0d --days 3 --out packet.json
jumpybrain dream --root <memory-root> --from 2022-05-01 --days 3 --date-basis evidence --json
JUMPYBRAIN_API_KEY=... jumpybrain dream --target-url https://memory.example.com --from t-1d --days 3 --json
jumpybrain remember --root <memory-root> --type page --dream --title "Topic map" < body.md
jumpybrain process --root <memory-root> --mode lint --topic "<topic>" --apply
jumpybrain process --root <memory-root> --mode synthesize --topic "<topic>" --apply
jumpybrain process --root <memory-root> --mode ensure-ids --apply
cat wrapup.md | jumpybrain wrapup --root <memory-root> --title "Session wrapup" --topic "current session"
```

`--root` is canonical for local memory roots. `--target-url`/`--remote-url` selects a remote V1 server and requires `JUMPYBRAIN_API_KEY`; remote responses use `root: "remote:all"` instead of exposing server filesystem paths.

Remote read-only policy belongs entirely to the CLI boundary. Dispatch parses arguments, identifies a target-aware semantic operation, loads strict schema-v1 device config from `JUMPYBRAIN_CLI_CONFIG` or `~/.jumpybrain/cli-config.json`, normalizes the target to its HTTP(S) origin, and rejects protected mutations before `commandMemoryTarget()` can resolve the API key or create an HTTP transport. The read allowlist is explicit, so new target-aware operations fail closed for protected origins until classified. Invalid existing config also fails closed for remote commands; missing config preserves read/write behavior. Core, app, runtime, HTTP adapters, and server code do not import or enforce this advisory policy.

`tree`/`overview` scans canonical Markdown metadata plus derived index manifest state. With `--connections`, it extracts explicit Markdown links and Obsidian-style wiki links as labeled edges, reports unresolved links/orphans/top hubs, and does not return memory body content. Remote overview routes use `root: "remote:all"` and relative file paths only.

`dream` reads stateless UTC calendar windows of canonical Markdown through the same local/remote app seams. Default `--from t-0d --days 3 --date-basis evidence` includes today and the previous two UTC dates; the anchor is newest, while packet `window.from` is oldest and `window.to` newest. Core resolves dates/limits and evidence-date precedence (frontmatter `date`, dated journal filename, creation metadata, mtime); the app assembles bounded bodies with warnings, hashes, missing-ID path provenance, and truncation. `modified` explicitly selects mtime. Dream-marked pages are excluded as primary evidence; related pages remain available via recall/show.

The authenticated remote route is `GET /memories/all/dream/window`. Reads neither stamp IDs nor write dream state. Optional `nextOffset` is request-local continuation, not a stored queue: concurrent edits can shift pages, so no exact coverage is promised. Pin continuation to the resolved newest date. Clients fail clearly against old servers without this endpoint; no batch fallback occurs.

The agent, not the app, synthesizes through `remember --type page --dream` (body only), or optimistic `show`/`update` (full Markdown), then indexes after successful edits. No provider calls, scheduling, or completion transaction are introduced. Ordinary dreaming preserves source/human-authored notes by instruction, not ACL. Global/team/remote writes require explicit authorization.

CLI batch flags `--status`, `--complete`, `--abandon`, `--force`, and `--apply-manifest` fail with deprecation guidance. Legacy runtime/HTTP batch APIs remain compatible; existing metadata-only state under `.jumpybrain/dream/` or `.jumpybrain/remote/` is untouched and ignored by window reads.

Recall JSON returns:

```json
{
  "root": "/absolute/memory-root",
  "query": "...",
  "mode": "recall",
  "results": [
    {
      "id": "chunk-...",
      "score": 1.0,
      "snippet": "bounded text",
      "provenance": {
        "file": "sessions/example.md",
        "lineStart": 8,
        "lineEnd": 12,
        "sessionId": "s-alpha",
        "session_id": "s-alpha",
        "metadata": {}
      },
      "scoreBreakdown": {
        "depthPolicyBoost": 0.1,
        "retrievalDepth": "normal"
      }
    }
  ]
}
```

## Bounded retrieval execution

Set `JUMPYBRAIN_SEARCH_TIMEOUT_MS` / `JUMPYBRAIN_INDEX_TIMEOUT_MS` in the local or server environment to change operation deadlines (positive integer milliseconds <=2147483647). Defaults are 60 seconds for search/compact recall and 600 seconds for indexing. Queue/lock waits consume that budget; request JSON cannot override it.

[QMD bounded execution](../src/adapters/qmd/qmd.docs.md#bounded-execution) owns admission, child ceilings, capture limits, cancellation, locking, and platform caveats. [HTTP-client transport](../src/adapters/http-client/http-client.docs.md) owns the separate remote deadline (70 seconds/read, 610 seconds/index); [protocol execution limits](shared-memory-protocol.md#backend-execution-limits) owns wire errors and the separate HTTP receipt timeout. These scopes are not interchangeable. Limits are controls, not measured capacity or recall-speed guarantees.

## Setup compatibility

`jumpybrain init --root <memory-root>` creates a committed `jumpybrain.json` with the current memory-root schema version plus standard memory directories. Current commands allow legacy/manual roots without this file, but if the file exists they refuse to write or index a root whose schema version is newer than the installed CLI. This keeps first-repo dogfooding safer while the package evolves.

## Retrieval depth

`recall` accepts `--depth shallow|normal|deep`.

Depth is a jumpyBrain policy layer: `shallow` favors compressed pages/decisions, `normal` balances maps with evidence, and `deep` keeps raw evidence accessible. Strict boolean `dream: true` adds a relevance-gated normal/shallow preference, explained in score breakdown and provenance; deep and explicit source/historical queries omit it. An unrelated map must not win on its marker alone. Dream creation/update timestamps do not make its historical claims recent.

The QMD adapter supplements ordinary candidates with a bounded lexical dream-candidate collection, merged/deduplicated before ranking; it does not load every page body per query. Reindex after marker/content edits or an upgrade to populate that derived collection. Everyday retrieval reduces repeated map chunks and near-identical echoes without hiding distinct raw details; deep retains evidence. No dream pages is a valid root, not a retrieval failure.

## Temporal retrieval

Explicit [CLI temporal options](cli-commands.md#explicit-temporal-retrieval) compose the same runtime/server search: resolve a UTC half-open evidence interval once, filter manifest metadata before candidate repair/limits, and retain date provenance. Date-only upper bounds include the day; timestamp upper bounds are exclusive (millisecond precision). Relative `t-Nd` inputs require a pinned `referenceDate`. Natural-language hints remain ranking hints, not filters.

QMD 2.8.3's supported search interfaces provide collection scoping but no canonical frontmatter-date filter. A bounded manifest-aware backfill adds at most **64** in-range files absent from ordinary/dream/title candidates, prioritizing title relevance then canonical path. Each prefix read is at most **128 KiB plus one byte**; no corpus-wide body scan is added. Backfill without backend relevance requires every meaningful query token in its repaired title/excerpt, or an exact title. This conservative lexical rescue is not semantic/exhaustive retrieval; a dated source absent from both pools can still be missed. Existing fusion/query counts stay unchanged.

Explicit temporal results always report `temporal_bounded_discovery` and partial status. Coverage counts describe eligible/excluded/visited **manifest documents**, not known matching evidence. Exhausting the backfill budget, stale indexes and excluded invalid/undated metadata are visible; zero hits cannot prove historical absence. Temporal repair checks complete current prefix frontmatter and body-start coordinates against the manifest, omitting changed/malformed/unreadable-source candidates with diagnostics. Ordinary local recall/search automatically indexes edits; nonrepairing/hosted reads need successful maintenance or explicit indexing. Repair malformed headers before retrying. This is not an atomic filesystem snapshot, and newly eligible files require reindexing.

Select relevant files/passages before chronological presentation; chronological ties use path, line and hit ID, with undated items last for order-only requests. Temporal queries disable the ordinary recency boost and cross-file map echo suppression so older conflicting evidence is not hidden by a newer synthesis. Depth still shapes the evidence; declared dates are not fact validity. Protocols carry explicit conflict/supersession declarations without resolving them. See [date semantics](memory-format.md#evidence-writing-and-validity-dates) and [QMD details](../src/adapters/qmd/qmd.docs.md#explicit-temporal-retrieval).

## Processing

`jumpybrain process` is the umbrella command for memory work over existing canonical Markdown. It requires `--apply` for mutating runs.

- `--mode synthesize` creates or safely refreshes a process-owned extractive source map for `--topic`, preserving ID, creation/evidence dates and applicable metadata. Direct and QMD-nominated primary sources share scope/exclusion checks before limits. Structural quotes retain bounded qualifications, source lines and verbatim date/relationship declarations; the map is not reviewed synthesis or a single inferred event date.
- `--mode lint` writes a deterministic support report under `.jumpybrain/reports/`, currently checking stale pages, missing page provenance, duplicate finding/decision titles, explicit `conflicts_with` metadata, and open questions that appear answered elsewhere.
- `--mode ensure-ids` stamps missing `mem_<uuid>` file-level IDs in canonical buckets before document edit workflows; already-IDed files must remain byte-identical.

Processing is local/server-side code. In hosted/shared deployments, scheduled processing should run inside the server against its local memory root; API or CLI triggers can be added later.

## Indexing

Markdown and root `jumpybrain.json` are canonical. QMD **@tobilu/qmd@2.8.3** is required for local/server retrieval: CLI and SDK must come from the same package, not a copied executable. Resolution is `JUMPYBRAIN_QMD_BIN`, then package-local `node_modules/.bin/qmd`, then PATH. There is no alternate local retrieval backend.

### Policy and routine updates

`index` defaults to lexical mode. Use `index --semantic-model /absolute/local/model.gguf` to persist semantic policy under `indexing` in `jumpybrain.json`; `--lexical` explicitly switches back. Provision the embedding GGUF and native runtime beforehand: indexing/recall must not download a model. Existing policy wins over environment settings. For unconfigured legacy roots only, truthy `JUMPYBRAIN_QMD_EMBED` explicitly migrates to semantic mode and requires an absolute local `QMD_EMBED_MODEL`. Bare environment opt-in without that model is an error.

The adapter ingests exactly the core-selected canonical Markdown, including a configured retrieval-only `indexRoot`. Routine SQLite transactions reconcile changes and reuse content hashes/vectors. Dream collection rows share those hashes; there are no dream file snapshots. Explicit `--rebuild` reconstructs documents/content/FTS and clears embeddings/query cache in the same transaction. Older semantic vectors without recorded model identity, or changed model bytes, require explicit rebuild rather than silent reuse.

### Readiness and recovery

Status/index/search expose `readiness`: independent `freshness` (`missing|fresh|stale|unknown`), available `modes`, `embedding` (`disabled|complete|incomplete|unknown`), and optional safe `lastFailure` code/time. Search adds `retrieval: { status: "complete" | "partial", warnings: [...] }`. Intentional lexical-only mode is not a semantic outage; partial backend fallback is labeled, and total backend failure throws instead of returning an empty result. Status/doctor use manifest and filesystem stats, not inference/download or a DB-integrity check. Stats cannot prove unchanged bytes against adversarial replacements.

Failed pre-commit updates roll back, retaining the previous committed generation. SQLite commits its own generation manifest before atomic publication of `.jumpybrain/index.json`; pending publication is recovered on the next search/index. Publication and multi-call reads use a PID lock with a five-second busy timeout, **not cross-process reader snapshots**. Run one server process per root. Canonical edits outside indexing are not a global snapshot: writes detected during a run leave readiness stale. Ordinary local rich/compact recall repairs missing/stale derived state with at most one incremental attempt inside the existing search budget, preserving root policy bytes/absence and ignoring legacy environment migration. Fresh recall runs no indexing worker/models; configured semantic incompatibility never permits silent rebuild. Runtime `refresh:false` / CLI `--no-refresh` disables repair/recovery, but temporary PID-lock coordination still writes. Opt-in runtime `readOnly:true` / CLI `--read-only` forbids derived writes through the same QMD engine's lexical functions on immutable readonly SQLite, refusing locks/pending/nonempty WAL/invalid or changed generations. Semantic omission is explicit; this is optimistic change detection, not a cross-process snapshot. Hosted clients preflight observational status capability before strict reads to avoid legacy cache/coordination writes. Hosted reads use that nonrepairing path and label stale evidence; their joined automatic maintenance checks actual canonical freshness, not just remote stale flags. Historical failure diagnostics do not make verified recovered sources permanently stale.

Recovery choices:

- Retry ordinary `index` after fixing a failure; use `index --rebuild` for explicit lexical/model/vector regeneration (local or remote).
- Physically corrupt SQLite is **not** repaired by in-place `--rebuild`. Stop server/index/search operations, back up Markdown plus `jumpybrain.json`, remove the selected root's derived `.jumpybrain/`, then index again and restart. This also discards derived logs, replay receipts, and legacy support state; do not confuse it with the installation directory `~/.jumpybrain`.
- Deleting derived state retains persisted indexing policy and canonical memory. Keep the provisioned model available; do not reset configuration with `init --force`.

SQLite uses FULL synchronization, but atomic JSON replacements do not explicitly fsync files/directories. Process-interruption recovery does not establish power-loss, filesystem-failure, or disk-corruption durability. Keep canonical backups. Implementation ownership and limits: [QMD lifecycle](../src/adapters/qmd/qmd.docs.md#index-lifecycle-and-readiness).

## Advisory code-quality report

Run `npm run quality:report` for an informational size/export hotspot report across `src/`, `test/`, and `scripts/`. The report is intentionally non-gating: use it to pick low-risk refactor candidates, not as a strict CI threshold.

Remaining source-size hotspots are intentionally documented at their module boundaries: the HTTP server adapter owns protocol/auth/response handling while delegating memory behavior, and app processing owns deterministic lint/synthesis orchestration while keeping CLI and HTTP concerns out. If either grows further, split by sub-workflow without moving protocol behavior into app modules or processing behavior into CLI/server adapters.
