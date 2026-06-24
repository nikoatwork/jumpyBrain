# Technical details

This page keeps implementation-oriented details out of the README.

## Architecture boundary

jumpyBrain is intended to be a standalone package. Other products can consume it through integrations or adapters, but the core package should not depend on external product internals.

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
