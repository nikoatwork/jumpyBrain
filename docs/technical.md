# Technical details

This page keeps implementation-oriented details out of the README.

## Architecture boundary

jumpyBrain is intended to be a standalone package. Other products can consume it through integrations or adapters, but the core package should not depend on external product internals.

## CLI contract

```bash
jumpybrain instructions
jumpybrain init --root <memory-root>
jumpybrain status --root <memory-root> --json
jumpybrain index --root <memory-root>
jumpybrain search --root <memory-root> --query "<question>" --limit 10 --json
jumpybrain recall --root <memory-root> --topic "<current topic>" --limit 5
cat wrapup.md | jumpybrain wrapup --root <memory-root> --title "Session wrapup" --topic "current session"
```

`--root` is canonical for the memory root.

Search JSON returns:

```json
{
  "root": "/absolute/memory-root",
  "query": "...",
  "mode": "search",
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
      "scoreBreakdown": {}
    }
  ]
}
```

## Setup compatibility

`jumpybrain init --root <memory-root>` creates a committed `jumpybrain.json` with the current memory-root schema version plus standard memory directories. Current commands allow legacy/manual roots without this file, but if the file exists they refuse to write or index a root whose schema version is newer than the installed CLI. This keeps first-repo dogfooding safer while the package evolves.

## Indexing

Markdown files are canonical. The derived manifest, QMD cache, and QMD config live under:

```text
<memory-root>/.jumpybrain/
```

This directory is rebuildable and safe to delete.

jumpyBrain owns Markdown discovery, frontmatter parsing, CLI output, and provenance mapping. QMD indexes the original Markdown files directly and owns production retrieval chunking/snippets.

QMD is required; there is no local retrieval fallback. Set `JUMPYBRAIN_QMD_EMBED=1` during indexing to ask QMD to generate vector embeddings when your local QMD runtime is ready.
