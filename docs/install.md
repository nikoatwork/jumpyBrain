# Installation

## Prerequisites

jumpyBrain is intentionally QMD-first. Install QMD before using `index`, `search`, or `recall`:

```bash
npm install -g @tobilu/qmd
qmd --version
```

QMD currently requires a recent Node runtime. This package declares Node `>=22` to match that dependency.

## Current local/dev install

This package is not published yet. From the repo root:

```bash
npm install
npm run build
npm link
```

After linking, the CLI should be available as:

```bash
jumpybrain --help
```

## Basic use

Pick a folder that will hold your canonical Markdown memories:

```bash
mkdir -p ./memory
```

Write notes manually, or use the CLI:

```bash
echo "Markdown remains canonical; indexes are rebuildable." \
  | jumpybrain note --root ./memory --type decision --title "Memory storage rule"
```

Build the derived QMD index before searching:

```bash
jumpybrain index --root ./memory
```

Then search/recall:

```bash
jumpybrain search --root ./memory --query "memory storage rule"
jumpybrain recall --root ./memory --topic "memory storage" --limit 5
```

If you add or edit Markdown memory files, run `jumpybrain index --root ./memory` again.

## QMD behavior

- QMD is required. There is no local keyword fallback.
- jumpyBrain creates isolated, rebuildable QMD config/cache files under `<memory-root>/.jumpybrain/`.
- QMD indexes the original Markdown memory files directly and owns retrieval chunking/snippets.
- Markdown memory files remain canonical and editable by hand.

If your local QMD runtime supports embeddings, indexing can ask QMD to embed with:

```bash
JUMPYBRAIN_QMD_EMBED=1 jumpybrain index --root ./memory
```
