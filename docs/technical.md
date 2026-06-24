# Technical details

This page keeps implementation-oriented details out of the README.

## Architecture boundary

jumpyBrain is one memory system with a lean CLI boundary and an internal runtime app that can be composed locally or in a server process against a server-local Markdown memory root. The current module layout is:

```text
src/index.ts
  -> src/runtime/index.ts                         # package-level runtime surface

src/cli.ts
  -> src/cli/local-transport.ts                   # CLI command parsing -> local runtime seam
    -> src/runtime/index.ts

src/server/index.ts
  -> src/runtime/index.ts                         # server-local runtime composition, no HTTP/auth yet

src/runtime/index.ts
  -> src/core/index.ts                            # backend-agnostic Markdown/setup/writing/types
  -> src/retrieval/index.ts                       # QMD-backed index/search composition
  -> src/processing/index.ts                      # memory processing over canonical Markdown

src/retrieval/index.ts / src/processing/index.ts
  -> src/qmd/index.ts                             # QMD adapter barrel

src/core/index.ts
  -> src/types.ts
  -> src/canonical/*
  -> src/setup/*
  -> src/writing/*
  -> src/retrieval/depth-policy.ts                # QMD-independent retrieval policy
```

These are source boundaries inside one package, not separate user-installed npm packages. The package entrypoint `src/index.ts` is intentionally a thin re-export of `src/runtime/index.ts`.

Boundary rules enforced by deterministic tests:

- `src/core/index.ts` stays backend-agnostic. It exports types, canonical Markdown helpers, setup, writing, and QMD-independent depth policy helpers only; it must not import CLI command parsing, server code, targets/client code, or QMD adapter internals.
- QMD adapter internals live under `src/qmd/` and are imported through `src/qmd/index.ts` from retrieval/processing/runtime composition. Stale `src/retrieval/qmd-*` module paths should not reappear.
- `src/runtime/index.ts` composes core plus QMD-backed retrieval/processing and must not import CLI command parsing.
- `src/cli.ts` handles arguments, stdin/stdout, and output shapes. It calls local operations through `src/cli/local-transport.ts`; CLI modules must not import `src/qmd/` directly.
- `src/server/index.ts` composes runtime calls around one server-local Markdown memory root. It intentionally does not implement HTTP, auth, daemon lifecycle, or CLI command parsing.

QMD is owned by the runtime/search adapter boundary. CLI command parsing should not shell out to QMD or manage QMD cache/config paths directly. Local mode and server mode both execute the same runtime concepts: canonical Markdown files live at the selected memory root, while QMD indexes/cache files remain derived state under `.jumpybrain/`.

The intended install paths are:

- local runtime install: install/run the CLI plus local runtime on the same machine as the memory root;
- future hosted client install: install the CLI and point it at a deployed jumpyBrain server once remote targets exist;
- server deploy/experimentation: clone or install the runtime app on a VPS/server and compose it against a server-local Markdown memory root.

Other products can consume jumpyBrain through integrations or adapters, but jumpyBrain should not depend on external product internals.

## CLI contract

```bash
jumpybrain instructions
jumpybrain init --root <memory-root>
jumpybrain status --root <memory-root> --json
cat memory.md | jumpybrain remember --root <memory-root> --type finding --title "<title>"
jumpybrain recall --root <memory-root> --query "<question>" --limit 10 --depth normal --json
jumpybrain recall --root <memory-root> --topic "<current topic>" --limit 5 --depth shallow
jumpybrain process --root <memory-root> --mode lint --topic "<topic>" --apply
jumpybrain process --root <memory-root> --mode synthesize --topic "<topic>" --apply
cat wrapup.md | jumpybrain wrapup --root <memory-root> --title "Session wrapup" --topic "current session"
```

`--root` is canonical for the memory root.

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

- `--mode synthesize` creates or updates a topical page under `pages/` for `--topic`.
- `--mode lint` writes a deterministic support report under `.jumpybrain/reports/`, currently checking stale pages, missing page provenance, duplicate finding/decision titles, explicit `conflicts_with` metadata, and open questions that appear answered elsewhere.

Processing is local/server-side code. In hosted/shared deployments, scheduled processing should run inside the server against its local memory root; API or CLI triggers can be added later.

## Indexing

Markdown files are canonical. The derived manifest, QMD cache, and QMD config live under:

```text
<memory-root>/.jumpybrain/
```

This directory is rebuildable and safe to delete.

jumpyBrain owns Markdown discovery, frontmatter parsing, CLI output, and provenance mapping. QMD indexes the original Markdown files directly and owns production retrieval chunking/snippets.

QMD is required; there is no local retrieval fallback. Set `JUMPYBRAIN_QMD_EMBED=1` during indexing to ask QMD to generate vector embeddings when your local QMD runtime is ready.
