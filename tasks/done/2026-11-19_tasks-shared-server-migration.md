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
- [x] **Local/remote diff and migration.** `jumpybrain diff --root --target-url [--all] [--json]` and `jumpybrain migrate remote --root --target-url [--dry-run | --apply] [--json]`. Server: `GET /memories/all/files?hashes=1` adds `contentHash`, `bodyHash` and declared `editedAt`; new `copy-in` file operation (batches of up to 100 exact no-clobber copies with per-note results, unused IDs required, folders created inside the bucket, imported vault notes with ignored-pattern names such as `goldpan` accepted as discovery shows them). Pure comparison/plan in `core/sync`; inventory and guarded apply in `app/sync`. `--apply` copies missing notes/drawings and pushes local-newer notes with the server's hash as If-Match; it never deletes, moves, or overwrites remote-newer or unordered work, and re-reads local items so changes since planning are skipped.

## Decisions

- Only declared `updated_at` (else creation date) orders notes. File mtimes are ignored: a git checkout resets them and would make stale local copies look newer and get pushed. Differing drawings have no declared date, so they are always `differs` and never pushed.
- Drawings compare by parsed scene: the server pretty-prints stored scenes, so compact versus pretty JSON is not a difference.
- `metadata` (same body, different frontmatter) is not a difference to migrate; a pushed update gets the server's own edit metadata and then shows as `metadata`.
- Package file ceiling (780) kept: the CLI parts live in `migrate.ts` and `connections.ts`, and sync is exported from `runtime/index.ts`, instead of four new files. Measured 780 files, 3,236,180 B packed, 8,956,410 B unpacked.

## Verification

Snapshot: working tree on `d8c395c0` plus this change; `npm run build`, then:

- New `test/sync-cli.test.js` (3/3, also covering the batch copy-in per-note results and an imported `goldpan` note): strict parsing; comparison policy (ID beats path, metadata-only, moved notes, path taken); against a real HTTP server: every status incl. CRLF bytes, a note with no dates and a future mtime (`differs`), formatting-only drawing; dry run writes nothing; device read-only origin allows diff and dry run, refuses `--apply`; wrong key explained against the server; apply copies byte for byte into new nested folders, pushes the newer note, leaves remote-newer/unordered notes and a differing drawing untouched; re-diff `same`/`metadata`; second plan empty; server refuses copy-in over an existing path, a duplicate ID, an escaping path and a missing ID; an X-API-Key request gets the Bearer hint. Ran three times in a row.
- `test/cli-connections.test.js` (7/7, 2 new): remote add via `--key-env` (single stored copy, `KEYREF` line), test `connected`, CLI `status --target-url` resolves `app-connection` → `JUMPYBRAIN_API_KEY`; stdin key with `--allow-writes` stored as its own copy, `test` reports rejection without the key; remote remove deletes its key line; deleted local folder flagged in JSON and text, `test` offline, folder not recreated; `status --all` with the app closed and running (CLI remote target and key source, remote profile health and read-only, stale root warning, no key in output).
- `test/env-file-credentials.test.js` (8/8, 1 new), `test/diagnostics.test.js` + `test/logging.test.js` (15/15, 1 new: anchored store and logger after deletion), `test/backend-host.test.js` (removed-brain case now also asserts the folder stays gone), `test/document-edit-smoke.test.js` (`body`), `test/canonical-metadata-read.test.js` (`exactMarkdownBody` cases).
- Affected selection, 29 files (help/validation, architecture boundaries, source graph, gateway and connection store, server HTTP, HTTP client, remote auth diagnostics, drawings, policy, baseline contracts, entrypoints, RPC contracts, instructions, package footprint, vault migrations, admission errors, memory CLI): 261/261 pass.
- `npx --package=playwright node scripts/companion-env-credentials-smoke.mjs`: PASS after repairing a pre-existing stale assertion (a `--json` failure prints its JSON error on stdout since the 2026-11-14 change; the smoke still read stderr).
- Standalone repro (`ensureRootBackend`, delete root, wait 4 s): before the fix the root came back with `.jumpybrain/logs/diagnostics/events-*.jsonl`; after, it stays deleted and the backend exits.
- `git diff --check` clean. Full `npm test` not run (reserved for the release gate).

### Real Mac app (owner's setup, 2026-11-19)

The dev build was packaged into a separate app in the session scratch folder (the installed 0.3.25 app was not modified) and launched against the owner's real support folder, `~/.config/jumpybrain/.env`, Local brain and VPS brain (the owner's shared test server, 0.3.23). `connections.json` and `.env` were backed up first and restored byte-identically afterwards (SHA-256 checked).

- `status --all` and `connections list`/`test`: both real connections reported `connected` with their write permissions; the CLI's VPS key source shown as the app connection without the key; adding the VPS again was refused as a duplicate.
- Temporary remote (loopback dev server): `connections add --key-env` with the key placed under a temporary variable in the real `.env` stored a `JUMPYBRAIN_KEYREF_` line and one copy of the key; the app's own state listed it; `test` connected; CLI `status --target-url` described the reference. Removal deleted the reference and URL lines and kept the variable. A second one via `--key-stdin --allow-writes` with a wrong key: `allowWrites` true, `test` reported the rejected key, removal deleted its key line.
- Throwaway local brain: added, selected in the app (its engine started), switched back, folder deleted. The engine exited within seconds and the folder stayed gone; `connections list`, `test` and `status --all` flagged it.
- `diff` against the VPS (0.3.23) stopped with the upgrade message. Not deployed: the VPS was only read.
- Real data: the 1,668-item Local brain (1,667 notes, 1 drawing) migrated into an empty loopback server. The first run found two problems, both fixed: `notes/goldpan.ai.md`, an imported Logseq page, was refused because of the `gold` ignore pattern, and the run took 3 min 42 s because each copy rescanned both brains. After the fixes the apply took 12 s, copied all 1,668 items, a re-diff reported all same, and the local brain's file checksums were unchanged. `show --json` on a real note: `content` ends with `body`, which has no frontmatter.
- Afterwards the app was quit, the dev engine stopped, the installed app's engine restarted from its own runtime (same executable as before), and all scratch apps, servers, brains and backups deleted. The app's bounded diagnostics in its support folder keep the test session's events.

## Limits

- The Settings UI does not show the new `available` flag. The app was checked through its gateway and CLI, not by clicking through Settings.
- `diff`/`migrate remote` were not run against the real VPS, which runs 0.3.23 without the hashed listing; it needs this version deployed.
- `migrate remote` is local → server only; it never merges bodies, resolves `differs`/`remote-newer` items, migrates boards or attachments, or moves notes to match paths. Notes over the 1 MiB request limit cannot be copied in. Each copy batch scans the server once for IDs; 1,668 items took 12 s locally.
- Drawing differences are never ordered or pushed; update them with `jumpybrain drawings update`.
- `diff` reads every note on both sides and every drawing once; no pagination.
- Existing duplicate key copies in `.env` are converted only when the key is saved again.
