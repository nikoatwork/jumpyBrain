# Moving a team from a local brain to a shared server

Status: done 2026-11-19.

Source: the 2026-11-19 16:23 UTC feedback email ([index](../feedback.md)), agent-written on 0.3.26 while moving a git-tracked local root to a shared server. The owner asked for all seven points end to end.

## Tasks

- [x] **Deleted-root recreation (P1).** Reproduced: after `rm -rf` of a brain, its detached backend noticed the lost lease and stopped, but its shutdown diagnostics recreated `<root>/.jumpybrain/logs/diagnostics/events-*.jsonl` (the store `mkdir`ed every path component, the root included; the text logger used `mkdir -p`). Server diagnostic stores now pass `createBelow: root` and the text logger refuses a missing root, so neither ever creates the memory folder. The gateway's `/companion/connections` marks local profiles `available: false` when the folder or `jumpybrain.json` is gone; `connections list` prints a removal hint; `connections test` reports `offline`. The gateway already refused to open such a folder.
- [x] **CLI remote profiles.** `connections add --name --url (--key-stdin | --key-env VAR) [--allow-writes] --revision` and `connections test --id`. The gateway's native-only route now accepts a remote add (name, url, key, optional allowWrites) and removing remote profiles; remote selection stays in Settings. The key is read before contacting the app, never accepted as an argument and never printed; `--key-env` reads the environment, then that variable in `~/.config/jumpybrain/.env`.
- [x] **One copy of a key.** The `.env` credential adapter stores `JUMPYBRAIN_KEYREF_<REF>=<VARIABLE>` when an unmanaged variable (JUMPYBRAIN_API_KEY first) already holds the identical key; app `get`, CLI resolution and diagnostics follow the reference; removal never deletes the referenced variable; other connections' keys are never referenced. Existing duplicates stay until the key is saved again.
- [x] **`show --json` body.** Added `body`: the exact text after the frontmatter (`exactMarkdownBody`, line endings preserved). `content` documented as the whole file, which `contentHash` covers.
- [x] **HTTP auth for agents.** The 401 `auth_required` message names `Authorization: Bearer <key>` and says X-API-Key/query parameters are not accepted. The protocol doc has an "agents calling HTTP directly" section (prefer the CLI; header; main routes).
- [x] **`status --all`.** CLI target with key source and health (local compatibility or remote reachability), every app connection (kind, health via `/companion/test`, writes allowed, active, availability) and `staleLocalRoots`; `app.running: false` when the app is closed. `run memory:status` rejects `--all`.
- [x] **Local/remote diff and migration.** `jumpybrain diff --root --target-url [--all] [--json]` and `jumpybrain migrate remote --root --target-url [--dry-run | --apply] [--json]`. Server: `GET /memories/all/files?hashes=1` adds `contentHash`, `bodyHash` and declared `editedAt`; new `copy-in` file operation (exact no-clobber copy, unused ID required, folders created inside the bucket). Pure comparison/plan in `core/sync`; inventory and guarded apply in `app/sync`. `--apply` copies missing notes/drawings and pushes local-newer notes with the server's hash as If-Match; it never deletes, moves, or overwrites remote-newer or unordered work, and re-reads local items so changes since planning are skipped.

## Decisions

- Only declared `updated_at` (else creation date) orders notes. File mtimes are ignored: a git checkout resets them and would make stale local copies look newer and get pushed. Differing drawings have no declared date, so they are always `differs` and never pushed.
- Drawings compare by parsed scene: the server pretty-prints stored scenes, so compact versus pretty JSON is not a difference.
- `metadata` (same body, different frontmatter) is not a difference to migrate; a pushed update gets the server's own edit metadata and then shows as `metadata`.
- Package file ceiling (780) kept: the CLI parts live in `migrate.ts` and `connections.ts`, and sync is exported from `runtime/index.ts`, instead of four new files. Measured 780 files, 3,236,180 B packed, 8,956,410 B unpacked.

## Verification

Snapshot: working tree on `d8c395c0` plus this change; `npm run build`, then:

- New `test/sync-cli.test.js` (3/3): strict parsing; comparison policy (ID beats path, metadata-only, moved notes, path taken); against a real HTTP server: every status incl. CRLF bytes, a note with no dates and a future mtime (`differs`), formatting-only drawing; dry run writes nothing; device read-only origin allows diff and dry run, refuses `--apply`; wrong key explained against the server; apply copies byte for byte into new nested folders, pushes the newer note, leaves remote-newer/unordered notes and a differing drawing untouched; re-diff `same`/`metadata`; second plan empty; server refuses copy-in over an existing path, a duplicate ID, an escaping path and a missing ID; an X-API-Key request gets the Bearer hint. Ran three times in a row.
- `test/cli-connections.test.js` (7/7, 2 new): remote add via `--key-env` (single stored copy, `KEYREF` line), test `connected`, CLI `status --target-url` resolves `app-connection` → `JUMPYBRAIN_API_KEY`; stdin key with `--allow-writes` stored as its own copy, `test` reports rejection without the key; remote remove deletes its key line; deleted local folder flagged in JSON and text, `test` offline, folder not recreated; `status --all` with the app closed and running (CLI remote target and key source, remote profile health and read-only, stale root warning, no key in output).
- `test/env-file-credentials.test.js` (8/8, 1 new), `test/diagnostics.test.js` + `test/logging.test.js` (15/15, 1 new: anchored store and logger after deletion), `test/backend-host.test.js` (removed-brain case now also asserts the folder stays gone), `test/document-edit-smoke.test.js` (`body`), `test/canonical-metadata-read.test.js` (`exactMarkdownBody` cases).
- Affected selection, 29 files (help/validation, architecture boundaries, source graph, gateway and connection store, server HTTP, HTTP client, remote auth diagnostics, drawings, policy, baseline contracts, entrypoints, RPC contracts, instructions, package footprint, vault migrations, admission errors, memory CLI): 261/261 pass.
- `npx --package=playwright node scripts/companion-env-credentials-smoke.mjs`: PASS after repairing a pre-existing stale assertion (a `--json` failure prints its JSON error on stdout since the 2026-11-14 change; the smoke still read stderr).
- Standalone repro (`ensureRootBackend`, delete root, wait 4 s): before the fix the root came back with `.jumpybrain/logs/diagnostics/events-*.jsonl`; after, it stays deleted and the backend exits.
- `git diff --check` clean. Full `npm test` not run (reserved for the release gate).

## Limits

- Not run on the real Mac app (Electron/native shell); the gateway was exercised in-process with real HTTP, a real `.env` file and a real server. The Settings UI does not show the new `available` flag.
- `migrate remote` is local → server only; it never merges bodies, resolves `differs`/`remote-newer` items, migrates boards or attachments, or moves notes to match paths. Notes over the 1 MiB request limit cannot be copied in.
- Drawing differences are never ordered or pushed; update them with `jumpybrain drawings update`.
- `diff` reads every note on both sides and every drawing once; no pagination.
- Existing duplicate key copies in `.env` are converted only when the key is saved again.
