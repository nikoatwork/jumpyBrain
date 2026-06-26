# Installation

## Install paths

jumpyBrain is being structured around three install/deploy paths, while still keeping one memory system:

1. **Local runtime install:** run the `jumpybrain` CLI on the same machine as a local Markdown memory root. This path needs the runtime/search adapter locally because indexing and recall happen on that machine.
2. **Hosted client install:** run the `jumpybrain` CLI as a thin client pointed at a deployed jumpyBrain server. This path should not need local QMD once remote targets are implemented, because indexing and recall happen on the server.
3. **Server deploy:** clone or install the jumpyBrain runtime on a VPS/server and run it against a server-local Markdown memory root. This path owns QMD, derived indexes, maintenance jobs, and any future API/daemon.

Today, the source install below is the working path for local use and server-side experimentation. The package layout is intentionally not split into many user-installed npm packages yet: the built tarball contains the CLI plus internal runtime, core, QMD adapter, and server boundary modules.

Remote targets and a hosted HTTP daemon are not implemented in the current CLI. The CLI has a target-selection seam and may recognize remote target flags as explicit placeholders, but local commands still require `--root` or `run memory:*` discovery. The server boundary is a small module for composing the runtime against a server-local Markdown root; use it as a development seam, not as a production API contract.

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

`cli:release:local` runs the project validation gate before packing. The pack/install scripts verify that required built CLI/runtime files are present and stale pre-refactor QMD retrieval paths are absent. See [`local-cli-builds.md`](local-cli-builds.md). A normal npm install path can replace this section after an npm release exists.

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
