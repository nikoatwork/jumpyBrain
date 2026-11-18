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

## Outcome (2026-11-17, worktree t3/hosted-index-location)

Supported scope decided conservatively: **index on a separate local disk, canonical files under the existing supported local-filesystem contract**. No SMB/NFS write support is claimed; those guarantees are untested here (see 1.2). The index-free in-memory mode (option 2) stays deferred — the requester preferred option 1 and 1.3 showed the index location alone answers the ask.

- [x] 1.0 Map what must stay with the canonical root
  - [x] 1.1 Classification recorded below in `Index-state classification`.
  - [x] 1.2 Canonical write guarantees inventory: exclusive `.<file>.replace.lock` creation, same-directory temp + required file fsync + atomic `rename`, title renames via `link()` + `unlink()` (a hardlink move), guarded reads rejecting `nlink !== 1`, and collaboration recovery storage under `.jumpybrain/recovery/`. Which of these hold on SMB/NFS is **untested and marked uncertain**; no empirical verification was possible here, so no SMB/NFS claim is made anywhere.
  - [x] 1.3 Decision: the supported target is "index on a separate local disk". Canonical files on a network share remain unsupported.
- [x] 2.0 Configurable derived-state location
  - [x] 2.1 `JUMPYBRAIN_INDEX_DIR` (name matches the request) moves the rebuildable index and caches out of the root: manifest `index.json`, QMD SQLite `qmd-cache/qmd/index.sqlite`, `qmd-cache` (QMD XDG_CACHE_HOME), `qmd-config`, `qmd-home`, and the publication lock/diagnostics (`index.lock`, `index-pending.json`, `index-failure.json`) all resolve through the new `indexStateRoot` in `src/adapters/qmd/qmd-cli.ts`. Default (unset/empty value) is byte-identical to the prior layout.
  - [x] 2.2 Rebuild-on-start already works through `ensureMemoryIndexed` (readiness "missing" when the manifest or database is absent); an empty or missing configured directory is rebuilt by ordinary maintenance and by non-read-only search. One index per root by construction: the location is `<value>/index/<sha256(root)>`, so two roots cannot share one index accidentally.
  - [x] 2.3 `test/hosted-index-location.test.js`: default path unchanged, custom path used (root `.jumpybrain` untouched), missing/emptied index directory rebuilt, per-root separation, canonical files byte-identical before/after.
- [x] 3.0 Dependency footprint (evaluation, not a promise)
  - [x] 3.1 Recorded in [docs/build-footprint.md](../../docs/build-footprint.md) (`2026-11-17 hosted image QMD dependency evaluation`): 178 locked packages; tree-sitter family (6) and MCP server + core (2) are hard `dependencies` of `@tobilu/qmd@2.8.3`, published at about 75.6 MB and 7.6 MB unpacked respectively; no install flag can remove them; a clean sandbox install confirmed `node-llama-cpp` needs the image toolchain. No dependency surgery performed; the recorded path is an upstream ask, with before/after image measurement deferred to the hosted container gate.
  - [x] 3.2 Option 2 (index-free in-memory search) remains deferred and unnecessary for this request.
- [ ] 4.0 Verify and finalize
  - [ ] 4.1 **Blocked in this environment:** the Docker restore/rebuild check from [coolify-deploy](../../docs/coolify-deploy.md) could not run — the Docker client is installed (29.6.1) but the current user is denied the daemon socket and no credentials are available. This gate stays open for an authorized environment; no podman/nerdctl alternative exists on the machine.
  - [x] 4.2 Docs updated: [vps-deploy.md](../../docs/vps-deploy.md) (derived-state bullet + safety checklist), [coolify-deploy.md](../../docs/coolify-deploy.md) (env var + storage guidance), [memory-format.md](../../docs/memory-format.md) (layout and access/recovery clarifications), [technical.md](../../docs/technical.md) (index relocation sentence), [build-footprint.md](../../docs/build-footprint.md). Per parent instruction, the shared `tasks/feedback.md` email rows, `tasks/todo/release-next.md` note, `tasks/CHANGELOG.md` entry and the archive move stay with the parent.

### Index-state classification (1.1)

Everything the server writes under `<root>/.jumpybrain` and beside the root, as of `950fd6a`:

| State | Path(s) | Class | Moved by `JUMPYBRAIN_INDEX_DIR` |
| --- | --- | --- | --- |
| Published index manifest | `.jumpybrain/index.json` | derived, rebuildable | yes |
| QMD SQLite index + caches | `.jumpybrain/qmd-cache/` (incl. `qmd/index.sqlite`, QMD `XDG_CACHE_HOME`) | derived | yes |
| QMD config | `.jumpybrain/qmd-config/index.yml` | derived | yes |
| QMD scratch home | `.jumpybrain/qmd-home/` | derived | yes |
| Publication lock/diagnostics | `.jumpybrain/index.lock`, `index-pending.json`, `index-failure.json` | index coordination state | yes |
| Obsolete dream copies | `.jumpybrain/qmd-dreams/` | removed after migration | yes (path only) |
| Access credentials | `.jumpybrain/access.json` | **canonical** (private) | no |
| Collaboration recovery | `.jumpybrain/recovery/<id>/<recoveryId>` | private user data | no |
| Replace locks | `.<file>.replace.lock` beside each canonical file | lock state, root-owned | no |
| Server logs/diagnostics | `.jumpybrain/logs/` | operational | no |
| Backend support | `.jumpybrain/backend/` | operational | no |
| Remote dream/idempotency state | `.jumpybrain/remote/`, `.jumpybrain/dream/` | operational (legacy for dreams) | no |
| Lint reports | `.jumpybrain/reports/` | operational | no |

### Verification (2026-11-17, Linux x86-64, Node 22.23.1, base `950fd6a`)

- `npm run build` passes; editor bundle unchanged (185,285 gzip, 15 packages).
- `test/hosted-index-location.test.js` — 5/5 pass (paths, custom dir, rebuild-on-missing, per-root separation, default layout).
- Focused regression: `qmd-lock` + `semantic-index-lifecycle` + `qmd-read-only` + `semantic-index-seams` + `qmd-execution` — 73/73 pass (fake QMD).
- With the real `@tobilu/qmd@2.8.3` installed from `scripts/engine/package-lock.json` (`npm ci --ignore-scripts` + source rebuild of native modules): `auto-index-scheduling`, `server-auto-index`, `automatic-index-cli`, `memory-cli` — 47/47 pass; manual end-to-end index + search + ensure into a custom `JUMPYBRAIN_INDEX_DIR` directory verified with the real engine (fresh, searchable, no rewrite work on re-run, root `.jumpybrain` absent).
- Full suite with the same engine override: **2,080 tests, 2,061 passed, 18 skipped, 1 failed**. The single failure (`test/lexical-bundle.test.js`, "review editor weight if the production bundle exceeds 185 KB gzip") is pre-existing and unrelated: this checkout's base `950fd6a` builds the same 185,285-byte editor bundle on this Linux/Node 22.23.1 machine and fails the same assertion there; the gate was last calibrated on macOS ARM64 (see [build-footprint.md](../../docs/build-footprint.md)).
- Limits: Docker daemon unavailable (4.1 open); `node-llama-cpp` cannot build in this sandbox, so real-engine semantic indexing is unverified here (fake-QMD semantic lifecycle tests cover the seam, and the read-only/immutability paths are exercised by their suites); the sandbox's older bundled `libstdc++` shadowed npm prebuilds until unset, which is an environment artifact, not a product issue.

## Integration review (2026-11-18)

The staged snapshot combines the hosted index implementation with the optional `npm run smoke:hosted -- --separate-index` fixture. The integration build and all 78 focused tests passed. A real QMD 2.8.3 check removed the complete separate index directory, rebuilt it with ordinary maintenance, verified strict read-only recall and matched the canonical Markdown bytes exactly.

Docker daemon access is still denied. The separate-volume fixture passes syntax and argument checks. The required Docker run, feedback bookkeeping, release note and archive remain open under the [task workflow](../../docs/task-workflow.md).
