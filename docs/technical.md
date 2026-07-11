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
  -> src/app/dream/index.ts                       # shared local/remote dream state workflow
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
  -> src/core/dream/*                             # pure dream cursor/limit/path policy
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
jumpybrain dream --root <memory-root> [--out dream-batch.json] [--json]
jumpybrain dream --root <memory-root> --status|--complete <batch-id>|--abandon <batch-id>
jumpybrain dream --root <memory-root> --apply-manifest dream-manifest.json
JUMPYBRAIN_API_KEY=... jumpybrain dream --target-url https://memory.example.com [--out dream-batch.json] [--json]
JUMPYBRAIN_API_KEY=... jumpybrain dream --target-url https://memory.example.com --status|--complete <batch-id>|--abandon <batch-id>
jumpybrain process --root <memory-root> --mode lint --topic "<topic>" --apply
jumpybrain process --root <memory-root> --mode synthesize --topic "<topic>" --apply
jumpybrain process --root <memory-root> --mode ensure-ids --apply
cat wrapup.md | jumpybrain wrapup --root <memory-root> --title "Session wrapup" --topic "current session"
```

`--root` is canonical for local memory roots. `--target-url`/`--remote-url` selects a remote V1 server and requires `JUMPYBRAIN_API_KEY`; remote responses use `root: "remote:all"` instead of exposing server filesystem paths.

Remote read-only policy belongs entirely to the CLI boundary. Dispatch parses arguments, identifies a target-aware semantic operation, loads strict schema-v1 device config from `JUMPYBRAIN_CLI_CONFIG` or `~/.jumpybrain/cli-config.json`, normalizes the target to its HTTP(S) origin, and rejects protected mutations before `commandMemoryTarget()` can resolve the API key or create an HTTP transport. The read allowlist is explicit, so new target-aware operations fail closed for protected origins until classified. Invalid existing config also fails closed for remote commands; missing config preserves read/write behavior. Core, app, runtime, HTTP adapters, and server code do not import or enforce this advisory policy.

`tree`/`overview` scans canonical Markdown metadata plus derived index manifest state. With `--connections`, it extracts explicit Markdown links and Obsidian-style wiki links as labeled edges, reports unresolved links/orphans/top hubs, and does not return memory body content. Remote overview routes use `root: "remote:all"` and relative file paths only.

`dream` works against local roots and hosted/shared targets with the same CLI flags. It selects a bounded batch of changed canonical Markdown contexts, prints local-agent instructions, and leaves consolidation edits to the user's local agent/model through existing `show`/`update` flows or `--apply-manifest`. Local state lives under `.jumpybrain/dream/state.json` and `.jumpybrain/dream/batches/`; remote server state remains under `.jumpybrain/remote/dream-state.json` and `.jumpybrain/remote/dream-batches/`. Dream state stores metadata only and never stores full memory bodies, schedules dreaming, or calls an AI provider. Batch retrieval/resume does not advance the cursor; `--complete` does, and `--abandon` does not.

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

Depth is a jumpyBrain policy layer applied after QMD returns candidates from the full index. The policy currently reranks by file/frontmatter bucket: `shallow` prefers compressed/current memory such as pages and decisions, `normal` balances pages/decisions with evidence, and `deep` lets raw sessions surface with little or no penalty. The policy is implemented as a shapeable function so future memory directories can be included or excluded without changing the command concept.

## Processing

`jumpybrain process` is the umbrella command for memory work over existing canonical Markdown. It requires `--apply` for mutating runs.

- `--mode synthesize` creates or updates a topical page under `pages/` for `--topic` and preserves an existing page document ID.
- `--mode lint` writes a deterministic support report under `.jumpybrain/reports/`, currently checking stale pages, missing page provenance, duplicate finding/decision titles, explicit `conflicts_with` metadata, and open questions that appear answered elsewhere.
- `--mode ensure-ids` stamps missing `mem_<uuid>` file-level IDs in canonical buckets before document edit workflows; already-IDed files must remain byte-identical.

Processing is local/server-side code. In hosted/shared deployments, scheduled processing should run inside the server against its local memory root; API or CLI triggers can be added later.

## Indexing

Markdown files are canonical. The derived manifest, QMD cache, and QMD config live under:

```text
<memory-root>/.jumpybrain/
```

This directory is rebuildable and safe to delete.

jumpyBrain owns Markdown discovery, frontmatter parsing, CLI output, and provenance mapping. QMD indexes the original Markdown files directly and owns production retrieval chunking/snippets.

QMD is required; there is no local retrieval fallback. Runtime resolution order is:

1. `JUMPYBRAIN_QMD_BIN`
2. package-local/bundled `node_modules/.bin/qmd` when present
3. `qmd` on `PATH`

Set `JUMPYBRAIN_QMD_EMBED=1` during indexing to ask QMD to generate vector embeddings when your local QMD runtime is ready.

## Advisory code-quality report

Run `npm run quality:report` for an informational size/export hotspot report across `src/`, `test/`, and `scripts/`. The report is intentionally non-gating: use it to pick low-risk refactor candidates, not as a strict CI threshold.

Remaining source-size hotspots are intentionally documented at their module boundaries: the HTTP server adapter owns protocol/auth/response handling while delegating memory behavior, and app processing owns deterministic lint/synthesis orchestration while keeping CLI and HTTP concerns out. If either grows further, split by sub-workflow without moving protocol behavior into app modules or processing behavior into CLI/server adapters.
