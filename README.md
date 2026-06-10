# jumpyBrain

Markdown-native memory for coding agents.

## Direction

jumpyBrain is intended to be a standalone TypeScript/npm package inspired by memsearch-style architecture:

- install once as a CLI/package
- wire agent hosts through adapters, hooks, MCP, or skills
- store canonical memories as repo/workspace-local Markdown
- keep indexes and recall state rebuildable
- expose explicit search/expand first
- make automatic prompt injection opt-in and bounded

## Prerequisite

Install QMD first:

```bash
npm install -g @tobilu/qmd
qmd --version
```

## First CLI contract

```bash
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

## Indexing

Markdown files are canonical. The derived manifest, QMD cache, and QMD config live under:

```text
<memory-root>/.jumpybrain/
```

This directory is rebuildable and safe to delete.

jumpyBrain owns Markdown discovery, frontmatter parsing, CLI output, and provenance mapping. QMD indexes the original Markdown files directly and owns production retrieval chunking/snippets. QMD is required; there is no local retrieval fallback. Set `JUMPYBRAIN_QMD_EMBED=1` during indexing to ask QMD to generate vector embeddings when your local QMD runtime is ready.

## Docs

- Installation: `docs/install.md`
- Memory format: `docs/memory-format.md`
- Agent workflows: `docs/agent-workflows.md`

## Seed docs

- Research: `tasks/research/2026-05-29-jumpybrain-architecture.md`
- Strategy: `tasks/strategy.md`
- Completed task history: `tasks/done/`

## Relationship to jumpyGoatHq

jumpyGoatHq should eventually consume jumpyBrain as an integration/adapter. jumpyBrain should not depend on jumpyGoatHq internals.
