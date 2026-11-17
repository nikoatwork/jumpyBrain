# Let hosted brains keep their notes on network storage

Priority: proposed P2, to confirm. Status: planned 2026-11-17 from feedback.

## Goal

A self-hosted brain can keep its canonical files (Markdown, boards, `jumpybrain.json`, `.jumpybrain/access.json`) on a network volume such as Azure Files, SMB or NFS. The rebuildable search index lives on fast local disk and is rebuilt when missing. Also decide whether the hosted image can shed dependencies a Markdown brain does not use.

## Evidence

- [Nov 17 request](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=7e049418-9589-44a8-ac5c-8e8db52f3954): a ~270-note, ~26 MB brain in one Docker container. Infra asked for network storage; the docs require local disk because the SQLite index is unsafe on network shares. Asks for either (1) a configurable index location such as `JUMPYBRAIN_INDEX_DIR`, or (2) an index-free in-memory search mode for small brains.
- [Nov 17 follow-up](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=4869826a-f384-4700-999f-41dd1684c3eb): QMD 2.8.3 brings 178 packages, including tree-sitter code grammars and QMD's own MCP server that jumpyBrain does not use, and needs native build tools in the image. The sender would keep SQLite and prefers option 1.
- Today all derived state sits under `<root>/.jumpybrain` (`derivedRoot` in `src/adapters/qmd/qmd-cli.ts`): `index.json`, `qmd-cache/qmd/index.sqlite`, and the QMD `XDG_CACHE_HOME`. [vps-deploy.md:290](../../docs/vps-deploy.md) requires one local-disk memory root.
- Not everything under `.jumpybrain` is derived (`access.json` is canonical). Collaboration recovery state and the `.replace.lock` files also live with the root and depend on filesystem locking and hardlinks, which network shares may not support. Option 1 alone may not make network storage safe.

## Relevant files

- `src/adapters/qmd/qmd-cli.ts`, `qmd-lifecycle.ts`, `qmd-worker.ts`, `qmd-read-only.ts` - index paths
- `src/core/canonical/` and `canonical.docs.md` - locks, hardlink moves, atomic replace
- `src/app/collaboration/` - private recovery storage
- `docs/vps-deploy.md`, `docs/coolify-deploy.md`, `docs/installation-storage.md`, `docs/build-footprint.md`

## Tasks

- [ ] 1.0 Map what must stay with the canonical root
  - [ ] 1.1 List every file under `.jumpybrain` and in the root that the server writes, and classify each as canonical, derived or lock/recovery state.
  - [ ] 1.2 Record which canonical write guarantees (lock files, hardlink moves, rename, fsync) hold on SMB and NFS. Mark untested claims as uncertain.
  - [ ] 1.3 **Clarify:** is the supported target "index on local disk, canonical files on a network share", or only "index on a separate local disk"? Decide after 1.2.
- [ ] 2.0 Configurable derived-state location
  - [ ] 2.1 Add one setting (env var name to decide, e.g. `JUMPYBRAIN_INDEX_DIR`) that moves the rebuildable index and caches out of the root. Default stays unchanged.
  - [ ] 2.2 Rebuild the index on start when the directory is empty or missing. Keep one index per root so two roots cannot share one directory by accident.
  - [ ] 2.3 Tests: default path unchanged, custom path used, missing index rebuilt, canonical files untouched.
- [ ] 3.0 Dependency footprint (evaluation, not a promise)
  - [ ] 3.1 Check whether QMD can run without tree-sitter grammars and its MCP server (optional dependencies, install flags, or upstream ask). Measure the image size and build tools needed before and after.
  - [ ] 3.2 Record the in-memory index-free mode (option 2) as deferred unless 1.3 shows the index location alone cannot meet the need.
- [ ] 4.0 Verify and finalize
  - [ ] 4.1 Run the Docker restore/rebuild check from [coolify-deploy](../../docs/coolify-deploy.md) with the index on a separate volume.
  - [ ] 4.2 Update deploy and storage docs with the supported layout and its limits. Update both [email index](../feedback.md) rows, add a pending release note, and finalize under [task workflow](../../docs/task-workflow.md).
