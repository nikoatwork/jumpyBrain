# Drawings in the CLI and tree

Status: done 2026-11-19.

## Problem

Reported against jumpyBrain 0.3.26: the CLI had no drawings support. `tree`, `show` and `search` never surfaced `.excalidraw` files and there was no `drawings` command, so agents dug HTTP routes out of `dist/` and guessed auth headers (`x-api-key` gets 401; the server expects `Authorization: Bearer`). Expected `jumpybrain drawings list|show|update --if-match` with `--target-url`, plus drawings in `tree`. The 2026-11-10 drawings task had deliberately shipped without CLI commands ([limits](2026-11-10_tasks-excalidraw-drawings.md)).

## Tasks

- [x] `drawings list|show|update` CLI namespace with strict parsing, usual target selection and one explicit `--root`/`--target-url` at most; `--json` failures use the shared error object.
- [x] Local reads call the runtime directly (no backend startup); local `update` goes through a new root-backend `saveDrawing` operation (canonical admission); remote uses new HTTP client `listDrawings`/`readDrawing`/`saveDrawing` with receipt validation over the existing routes.
- [x] `show` prints element counts by type, non-deleted text labels (bounded) and the content hash; `--json` returns the full scene. `update` accepts an Excalidraw file or a saved `show --json` packet and requires `--if-match`.
- [x] Device read-only policy: list/show are reads; update is refused before credentials or input file.
- [x] `tree`/overview adds `drawings: {count, skipped, names}` (newest first, bounded by `limit`), local and hosted; text tree prints a `drawings/` branch.
- [x] Help metadata, agent `instructions --topic board` line, CLI/protocol/memory-format/architecture/module docs, pending release note.

## Decisions

- Drawings stay out of `search`/`recall`/`show --id`: they remain workspace files, not recallable memory. `tree` and `drawings list` are the discovery path.
- Scope is the requested list/show/update. Create, rename (with mention rewrite) and delete remain in the app/browser editor and HTTP API.
- Auth: no server change. The CLI already sends the bearer key; docs now point clients at the CLI instead of raw routes.

## Verification

Snapshot: working tree on `cc0ff264` plus this change; `npm run build` once, then:

- `node --test test/drawings-cli.test.js` (new): strict parsing, help, full local and hosted list/show/update/tree workflow including stale-hash `drawing_conflict`, missing `drawing_missing`, skipped entries, no host path in hosted packets, and read-only policy ordering — 5/5 pass.
- `cli-help-validation`, `cli-baseline-contracts`, `instructions-topics`, `overview`, `remote-access-policy`, `architecture-boundaries`, `source-graph-contracts`, `drawings`, `boards-cli`, `http-client`, `package-entrypoints` — 71/71 pass.
- `backend-rpc-contracts`, `server-http`, `package-footprint` — 22/22 pass.
- Manual smoke on a disposable root: list, show (text labels, deleted label hidden), tree branch, update from a `show --json` packet, repeated stale update refused with a JSON error.
- `git diff --check` clean.
- Full gate `npm test` (build + all Node tests): 2,119 tests, 2,117 pass, 2 optional skips, 0 fail.
- Served smoke: `jumpybrain serve` on a disposable root; raw `x-api-key` → 401, `Authorization: Bearer` → 200; CLI `drawings list/show/update` and `tree` via `--target-url` succeeded; a wrong key produced the standard access-key explanation.

## Limits

- Not run: Mac app/gateway proxy path (the gateway proxies the same HTTP routes; not exercised here), installed/packaged CLI.
- `update` replaces the whole scene; no element-level patching or merge. Concurrent editor autosaves are detected only by the hash check.
- `skipped` counts unsupported `.excalidraw` entries only; other files in `drawings/` are ignored silently.
