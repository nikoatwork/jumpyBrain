# Remote access keys in a shared .env file

## Completed — 2026-11-12

Remote-connection access keys moved from macOS Keychain to one owner-only plaintext file, `~/.config/jumpybrain/.env`, shared by the Mac app and the CLI (owner decision: replace Keychain for everyone). Keys now survive app updates and re-signing. The CLI uses the key the app saved for the same `--target-url` when `JUMPYBRAIN_API_KEY` is unset. The Swift host no longer contains Keychain code. Connections saved by older builds report a missing key once and are repaired by re-entering it in Settings. Not released or installed.

## Goal

Saved remote-connection access keys must survive app updates. Report: [November 11 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=40a4d331-9fb9-4855-9027-b3b88776b351) ([index](../feedback.md)).

## Design

- **File**: `~/.config/jumpybrain/.env`. The app's gateway runs with a scrubbed environment (`HOME` only), so `XDG_CONFIG_HOME` is ignored to keep the app and CLI on the same file. `JUMPYBRAIN_ENV_FILE` overrides it for the CLI and tests only.
- **Format**: per connection `JUMPYBRAIN_KEY_<REF>` and `JUMPYBRAIN_URL_<REF>`, where `<REF>` is the existing opaque `credentialRef` UUID (upper case, underscores). Comments, unrelated lines and an optional `JUMPYBRAIN_API_KEY` default are preserved.
- **CLI precedence**: environment `JUMPYBRAIN_API_KEY`, then the app key for the same origin and path, then the file's `JUMPYBRAIN_API_KEY`. The missing-key error explains both options.
- **Safety**: atomic temp+rename writes (following a symlinked file), serialized per process, `0600` file in a `0700` directory. Reads refuse group/other-accessible or foreign-owned files with a `chmod 600` hint, and a write repairs the mode. Errors never contain key values. Keys stay out of profile JSON, support files, diagnostics and the page.
- **Code**: `src/adapters/credentials/env-file.ts` (infrastructure adapter, docs co-located); `appCredentials` in `gateway.mjs` composes it with the native bridge, which now only selects folders; `connections.mjs` passes the URL on save; CLI `memory-target.ts`/`collaborate.ts` use `remoteApiKey(url)`; the Swift `get/set/delete` operations, Security/LocalAuthentication imports and build frameworks were removed.
- **Copy**: Settings, onboarding, setup errors and menu status say "Access key unavailable" and name the file instead of Keychain. Docs (FAQ, install, gateway/connections/electron/browser/CLI/architecture) were updated. Historical release notes and eval reports are unchanged.

## Tasks

- [x] 1.0 Design: Keychain inventory (code, UI copy, docs), file format, path, precedence.
- [x] 2.0 Implement: adapter, gateway wiring, Swift removal, CLI read path, UI/setup/menu copy.
- [x] 3.0 Verify (below).
- [x] 4.0 Docs, feedback outcome, release note, changelog, archive, commit.

## Verification

Snapshot: branch `feat/env-file-credentials` from `fd42bd79`, `npm run build`.

- `node --test` over the 22 affected files (new `env-file-credentials`, gateway, connections, connection UX, companion browser/live gateway, CLI connections, architecture boundaries, remote-access policy, install scripts, bounded retrieval, CLI error contracts, memory CLI, temporal transport, Logseq/Obsidian migration, recall formatting, CLI help, collaboration CLI, electron setup, package footprint/entrypoints): **263 pass, 0 fail**.
- New unit coverage: parser, `0600`/`0700`, concurrent serialized writes, rotation in place, hand edits preserved, no temp files left, newline key rejected without echo, insecure file refused then repaired by write, symlinked file kept, CLI precedence, and the connection store against a real file (save → CLI sees key → rotate → rename → reopen as after an update → remove).
- Gateway integration: Settings-equivalent save writes the file, support files hold no key, an authenticated remote request succeeds, a fresh adapter re-reads the key, and an insecure file yields 503 `credential_unavailable` with `chmod 600` and no key.
- `npx --package=playwright node scripts/companion-env-credentials-smoke.mjs` (new; production gateway + Chromium + real CLI): Settings shows the file, not Keychain; a key entered in the UI lands in a `0600` file; the page never contains it; a gateway restart on the same port keeps the connection `connected`; `jumpybrain status --target-url` authenticates with no `JUMPYBRAIN_API_KEY`; an unknown URL fails with "No access key for" and no key leak; a Keychain-era profile (key lines removed) reports `credential_unavailable`, and re-entering the key in Settings returns it to `connected`. **PASS.**
- `python3 -B integrations/macos-companion/test_connections_native.py`: Swift copy compiles (AppKit only), menu shows "Access key unavailable", 16 malformed/removed-operation frames (including `get`/`set`/`delete`) fail closed. **PASS.** The production `Companion.swift` also compiles standalone with no `SecItem`/`SecKeychain` symbols.
- CLI tests that run without a key now pin `JUMPYBRAIN_ENV_FILE` to a nonexistent path, so a developer's real key file can never affect them.
- `scripts/companion-gateway-smoke.mjs` fails at "real overlapping live edit blocks UI and native switches", **identically on an untouched master build**. That is pre-existing, from the November 10 merge-on-overlap change, and involves no credentials; its later remote-repair checks therefore did not run here, and the new smoke covers that path.

## Limits

- Plaintext by design: any process running as the user can read the file. No encryption or OS secret store.
- Not run in a packaged/installed app or across a real Sparkle/updater update; continuity is shown by a gateway restart with a fresh adapter on the same file.
- Old Keychain items are neither read nor deleted; users re-enter each remote key once. Hand-written files with duplicate definitions keep the last value on read; a write collapses duplicates of the changed name.
