# Technical details

This page keeps implementation-oriented details out of the README.

## Architecture boundary

jumpyBrain is one memory system with a lean CLI boundary and an internal runtime app that can be composed locally or in a server process against a server-local Markdown memory root. The current module layout is:

```text
src/index.ts
  -> src/runtime/index.ts                         # package-level runtime surface

src/cli.ts                                      # executable shim
  -> src/cli/index.ts
    -> src/cli/commands.ts                        # top-level command dispatch
    -> src/cli/recipes.ts                         # `run memory:*` recipe dispatch
    -> src/cli/targets.ts                         # local/remote target selection
    -> src/cli/remote-access-policy.ts            # early device-local per-origin read-only classification
    -> src/cli/local-transport.ts                 # CLI command parsing -> local runtime seam, including document show/update
      -> src/runtime/index.ts
    -> src/adapters/http-client/index.ts          # remote HTTP transport for --target-url/--remote-url, including document show/update
    -> src/adapters/package-info/index.ts         # CLI version metadata

src/server/index.ts
  -> src/app/server-memory/index.ts               # server-local memory composition
  -> src/adapters/http-server/index.ts            # opt-in HTTP server/auth/routes for remote memory
  -> src/adapters/package-info/index.ts           # host package version injection for setup

src/runtime/index.ts
  -> src/core/index.ts                            # backend-agnostic core/types/policy
  -> src/app/writing/index.ts                     # local write workflow use cases
  -> src/app/local-memory/index.ts                # QMD-backed index/search plus document read/update use cases
  -> src/app/processing/index.ts                  # memory processing app use cases
  -> src/app/dream/index.ts                       # stateless dream windows and legacy batch compatibility
  -> src/adapters/package-info/index.ts           # host package version injection for setup

src/app/writing/index.ts
  -> src/core/writing/*                           # pure Markdown/rendering/wrapup policy
  -> src/core/canonical/*, src/core/memory-root/* # root resolution and compatibility checks

src/app/local-memory/index.ts / src/app/processing/index.ts
  -> src/core/canonical/*                         # Markdown scanning/parsing and explicit link extraction
  -> src/core/memory-root/*                       # setup/status and index-root policy
  -> src/adapters/qmd/index.ts                    # QMD adapter barrel

src/app/server-memory/index.ts
  -> src/core/memory-root/*                       # server-local setup/status
  -> src/app/local-memory/index.ts                # server-local index/search/document read/update use cases
  -> src/app/writing/index.ts                     # remote write workflow use cases
  -> src/app/dream/index.ts                       # shared dream workflow configured for remote-safe output
  -> src/app/server-memory/dream.ts               # thin remote dream facade, no AI/model calls

src/adapters/http-server/index.ts
  -> src/app/server-memory/index.ts               # protocol routes call server-memory use cases

src/core/index.ts
  -> src/types.ts
  -> src/core/canonical/*
  -> src/core/memory-root/*
  -> src/core/provenance.ts
  -> src/core/retrieval-policy/*                  # QMD-independent retrieval policy
  -> src/core/dream/*                             # pure UTC window/date/limit policy plus legacy batches
  -> src/core/writing/*                           # pure write policy only
```

These are source boundaries inside one package, not separate user-installed npm packages. The package entrypoint `src/index.ts` is intentionally a thin re-export of `src/runtime/index.ts`.

Distribution is source/installer-first for self-hosted use, not npm-package-first. Do not add a restrictive `package.json` exports map or package-manager self-update flow unless the project explicitly decides to publish to npm later. The supported user-facing surfaces are the CLI, installer scripts, documented server deployment flow, and Markdown memory format; internal TypeScript deep imports remain undocumented implementation details rather than a hidden or stabilized SDK. `jumpybrain update` belongs at the CLI/installer edge: it reads the installer manifest and reruns the public installer instead of adding update behavior to core/app/runtime/server memory semantics.

Durable module-level architecture notes live in co-located `*docs.md` files under `src/` module directories. Use these instead of per-module `README.md` files; each module doc should state responsibilities and non-responsibilities. `src/architecture.docs.md` records the target CLI/app/core/adapters dependency direction that boundary tests enforce.

The document-edit runtime boundary is ID-addressed: core owns canonical lookup, exact content hashing, protected metadata merge policy, and atomic replacement primitives; app/local-memory adds root compatibility and optimistic-concurrency precondition checks; runtime re-exports those local operations; CLI and HTTP transports only parse protocol/flags and delegate to local or server-memory app operations. Successful document updates currently return stale/not-indexed state so callers can decide when to rebuild derived search state.

Boundary rules enforced by deterministic tests:

- Property tests run in normal `npm test` with fixed `fast-check` settings from `test/property-helpers.js`. They are limited to pure architecture-edge contracts such as Markdown/frontmatter rendering, slug/path normalization, CLI target selection, retrieval-depth policy, pure QMD path helpers, and package manifest validation. They must not spawn QMD or exercise paid/model-dependent behavior.
- `src/core/index.ts` stays backend-agnostic. It exports types, core canonical Markdown helpers, memory-root setup/status, provenance, pure writing policy, and QMD-independent depth policy helpers only; it must not import CLI command parsing, app orchestration, server code, HTTP/logging/package adapters, targets/client code, or QMD adapter internals.
- QMD adapter internals live under `src/adapters/qmd/` and are imported through `src/adapters/qmd/index.ts` from app local-memory/processing composition. Pre-adapter QMD module paths should not reappear.
- `src/runtime/index.ts` composes core and app writing/local-memory/processing workflows and must not import CLI command parsing.
- `src/cli.ts` is the executable shim. Command dispatch and recipe handling live under `src/cli/commands.ts` and `src/cli/recipes.ts`; CLI submodules handle arguments, stdin/stdout, output shapes, target selection, doctor reporting, serve bootstrap, and usage text. They call local operations through `src/cli/local-transport.ts` and remote targets through `src/adapters/http-client/index.ts`. CLI modules must not import `src/adapters/qmd/` directly.
- `src/server/index.ts` composes app/server-memory calls around one server-local Markdown memory root and re-exports the opt-in HTTP server adapter. Server modules must not import CLI command parsing or implement HTTP route internals directly.
- Final source layout does not keep legacy compatibility directories for canonical, setup, retrieval, processing, or writing concepts. New imports should use `src/core/` for pure domain policy and `src/app/` for use-case orchestration.

QMD is owned by the app local-memory/search adapter boundary. CLI command parsing and HTTP routes should not shell out to QMD or manage QMD cache/config paths directly. Local mode and server mode both execute the same app concepts: canonical Markdown files live at the selected memory root, while QMD indexes/cache files remain derived state under `.jumpybrain/`.

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

## Setup compatibility

`jumpybrain init --root <memory-root>` creates a committed `jumpybrain.json` with the current memory-root schema version plus standard memory directories. Current commands allow legacy/manual roots without this file, but if the file exists they refuse to write or index a root whose schema version is newer than the installed CLI. This keeps first-repo dogfooding safer while the package evolves.

## Retrieval depth

`recall` accepts `--depth shallow|normal|deep`.

Depth is a jumpyBrain policy layer: `shallow` favors compressed pages/decisions, `normal` balances maps with evidence, and `deep` keeps raw evidence accessible. Strict boolean `dream: true` adds a relevance-gated normal/shallow preference, explained in score breakdown and provenance; deep and explicit source/historical queries omit it. An unrelated map must not win on its marker alone. Dream creation/update timestamps do not make its historical claims recent.

The QMD adapter supplements ordinary candidates with a bounded lexical dream-candidate collection, merged/deduplicated before ranking; it does not load every page body per query. Reindex after marker/content edits or an upgrade to populate that derived collection. Everyday retrieval reduces repeated map chunks and near-identical echoes without hiding distinct raw details; deep retains evidence. No dream pages is a valid root, not a retrieval failure.

## Temporal retrieval

Explicit [CLI temporal options](cli-commands.md#explicit-temporal-retrieval) compose the same runtime/server search: resolve a UTC half-open evidence interval once, filter manifest metadata before candidate repair/limits, and retain date provenance. Date-only upper bounds include the day; timestamp upper bounds are exclusive (millisecond precision). Relative `t-Nd` inputs require a pinned `referenceDate`. Natural-language hints remain ranking hints, not filters.

QMD 2.8.3's supported search interfaces provide collection scoping but no canonical frontmatter-date filter. A bounded manifest-aware backfill adds at most **64** in-range files absent from ordinary/dream/title candidates, prioritizing title relevance then canonical path. Each prefix read is at most **128 KiB plus one byte**; no corpus-wide body scan is added. Backfill without backend relevance requires every meaningful query token in its repaired title/excerpt, or an exact title. This conservative lexical rescue is not semantic/exhaustive retrieval; a dated source absent from both pools can still be missed. Existing fusion/query counts stay unchanged.

Explicit temporal results always report `temporal_bounded_discovery` and partial status. Coverage counts describe eligible/excluded/visited **manifest documents**, not known matching evidence. Exhausting the backfill budget, stale indexes and excluded invalid/undated metadata are visible; zero hits cannot prove historical absence. Temporal repair checks complete current prefix frontmatter and body-start coordinates against the manifest, omitting changed/malformed/unreadable-source candidates with diagnostics. Reindex after edits; repair malformed headers before retrying. This is not an atomic filesystem snapshot, and newly eligible files require reindexing.

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

Failed pre-commit updates roll back, retaining the previous committed generation. SQLite commits its own generation manifest before atomic publication of `.jumpybrain/index.json`; pending publication is recovered on the next search/index. Publication and multi-call reads use a PID lock with a five-second busy timeout, **not cross-process reader snapshots**. Run one server process per root. Canonical edits outside indexing are not a global snapshot: writes detected during a run leave readiness stale.

Recovery choices:

- Retry ordinary `index` after fixing a failure; use `index --rebuild` for explicit lexical/model/vector regeneration (local or remote).
- Physically corrupt SQLite is **not** repaired by in-place `--rebuild`. Stop server/index/search operations, back up Markdown plus `jumpybrain.json`, remove the selected root's derived `.jumpybrain/`, then index again and restart. This also discards derived logs, replay receipts, and legacy support state; do not confuse it with the installation directory `~/.jumpybrain`.
- Deleting derived state retains persisted indexing policy and canonical memory. Keep the provisioned model available; do not reset configuration with `init --force`.

SQLite uses FULL synchronization, but atomic JSON replacements do not explicitly fsync files/directories. Process-interruption recovery does not establish power-loss, filesystem-failure, or disk-corruption durability. Keep canonical backups. Implementation ownership and limits: [QMD lifecycle](../src/adapters/qmd/qmd.docs.md#index-lifecycle-and-readiness).

## Advisory code-quality report

Run `npm run quality:report` for an informational size/export hotspot report across `src/`, `test/`, and `scripts/`. The report is intentionally non-gating: use it to pick low-risk refactor candidates, not as a strict CI threshold.

Remaining source-size hotspots are intentionally documented at their module boundaries: the HTTP server adapter owns protocol/auth/response handling while delegating memory behavior, and app processing owns deterministic lint/synthesis orchestration while keeping CLI and HTTP concerns out. If either grows further, split by sub-workflow without moving protocol behavior into app modules or processing behavior into CLI/server adapters.
