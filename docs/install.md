# Installation

## Prerequisites

jumpyBrain is intentionally QMD-first. Install QMD before using `remember`, `recall`, or maintenance indexing:

```bash
npm install -g @tobilu/qmd
qmd --version
```

QMD currently requires a recent Node runtime. This package declares Node `>=22` to match that dependency.

## Install from source

jumpyBrain is not published to npm yet. Clone the repo, then from the repo root:

```bash
npm install
npm run build
npm link
```

After linking, the CLI should be available as:

```bash
jumpybrain --help
```

For local dogfooding in another repo, prefer a versioned local tarball over `npm link`:

```bash
npm run cli:release:local
npm run cli:install:local -- /path/to/first-repo
```

See [`local-cli-builds.md`](local-cli-builds.md). A normal npm install path can replace this section after an npm release exists.

## Basic use

Pick and initialize a folder that will hold your canonical Markdown memories:

```bash
jumpybrain init --root ./memory
jumpybrain status --root ./memory
```

`init` creates the standard Markdown directories, writes a small committed `jumpybrain.json` setup file, and ensures derived `.jumpybrain/` state is ignored. By default, indexing covers the memory root recursively. For repo-wide dogfooding, set `"indexRoot": ".."` in `memory/jumpybrain.json` to index workspace Markdown while keeping new memories in `memory/`.

Remember writes memory; recall reads memory. Write memories manually, or use the CLI:

```bash
echo "Markdown remains canonical; indexes are rebuildable." \
  | jumpybrain remember --root ./memory --type decision --title "Memory storage rule"
```

`remember` updates the derived QMD index after writing. Then recall memory by topic or specific question:

```bash
jumpybrain recall --root ./memory --topic "memory storage" --limit 5
jumpybrain recall --root ./memory --query "Where is the memory storage rule?" --limit 5 --json
```

When running inside a repo initialized with `memory/jumpybrain.json`, you can use recipe shortcuts that discover the memory root:

```bash
echo "Markdown remains canonical; indexes are rebuildable." \
  | jumpybrain run memory:remember --type decision --title "Memory storage rule"
jumpybrain run memory:recall --topic "memory storage" --limit 5
```

If you manually add or edit Markdown memory files, run `jumpybrain index --root ./memory` again.

## QMD behavior

- QMD is required. There is no local keyword fallback.
- jumpyBrain creates isolated, rebuildable QMD config/cache files under `<memory-root>/.jumpybrain/`.
- QMD indexes the original Markdown memory files directly and owns retrieval chunking/snippets.
- Markdown memory files remain canonical and editable by hand.

If your local QMD runtime supports embeddings, indexing can ask QMD to embed with:

```bash
JUMPYBRAIN_QMD_EMBED=1 jumpybrain index --root ./memory
```
