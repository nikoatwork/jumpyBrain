# Diagnosable remote authentication failures

## Completed — 2026-11-13

When a remote server rejects the access key, the CLI now says which key it sent, where that key came from and how to recover. Before, it printed only `Invalid API key.` It shows a non-secret fingerprint: the length, plus the last four characters for keys of 16+ characters. It also lists other keys it found but did not use, and the key order. The recovery steps are: ask the admin for a key (`jumpybrain access issue` or Access keys in the app), then fix or unset the `JUMPYBRAIN_API_KEY` export or re-enter the key in the app. HTTP 403 `read_only`/`admin_required` name the role that is needed. `status --target-url` is the read-only check, and now prints `Access key: <source> (<fingerprint>), accepted` (JSON: `target.credential`). Live `collaborate` reports a rejected key the same way instead of "Connection lost". Keys with smart quotes or line breaks are refused before sending instead of failing with a `ByteString` error. Not released or installed.

## Goal

Answer the [November 12 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=a447fe5d-fcd8-412a-8ee4-0ff5ee132edf) ([index](../feedback.md)), owned until now by the P2 item in [follow-ups](../todo/tasks-feedback-follow-ups.md). With an API key exported in the shell profile, remote CLI calls failed with an auth error that gave no hint which credential was used or how to recover.

## Findings

Reproduced against a disposable `jumpybrain serve` on 127.0.0.1 with a disposable brain, a temporary `HOME` and only fake keys:

| Case | Before | After |
| --- | --- | --- |
| Unknown key, revoked issued key, key wrapped in literal quotes | `Invalid API key.` (HTTP 401 `invalid_api_key`; the server does not tell these apart) | Source + fingerprint, unused candidates, key order, recovery, `status` check. Quote/space hint for the wrapped key |
| Key with smart quotes | `Cannot convert argument to a ByteString …` | Refused before sending, with source + fingerprint |
| Missing key | `No access key for <url>. Set JUMPYBRAIN_API_KEY, or save this connection …` | Same, plus how to get a key from the admin |
| Reader key writes / non-admin `access list` | `This credential grants reader access.` / `Managing access keys needs an admin key …` | Names the key used and asks for a writer/admin key |
| `collaborate` with a bad key | `Connection lost. A dispatched operation may have committed …` (misleading) | Same 401 explanation |

**Actual precedence** (`resolveRemoteKey`): (1) `JUMPYBRAIN_API_KEY` in the process environment, so an export in `~/.zshenv` silently beats the app's key; (2) the app-saved `JUMPYBRAIN_KEY_<REF>` whose `JUMPYBRAIN_URL_<REF>` has the same origin and path as `--target-url` (`localhost` ≠ `127.0.0.1`); (3) `JUMPYBRAIN_API_KEY` written in `~/.config/jumpybrain/.env`. When (1) is set the file is not read. There is no per-target CLI config.

## Design

- `src/adapters/credentials/env-file.ts`: `resolveRemoteKey` returns `{source, key, variable, file?}`. `remoteKeyForUrl` wraps it, so behavior is unchanged. `remoteKeyCandidates` lists every candidate in order for diagnostics and reports an insecure or unreadable file as `fileProblem`, never throwing. `keyFingerprint` and `credentialsEnvFileDisplay` were added.
- `src/cli/remote-credentials.ts` (new): owns all CLI text, covering the missing/unsendable-key errors, `describeRemoteKey`, the status summary and `remoteAuthFailure`.
- `src/cli/commands.ts`: `runCli` substitutes that explanation for any 401, or 403 `read_only`/`admin_required`, from a remote target. This covers every remote command, including `access`, boards, attention and dream.
- `collaborate.ts`: a 1008 close before `hello` succeeds becomes `{status: 401, code: "invalid_api_key"}`.
- Layer boundaries: text stays in `src/cli/`, key resolution in the credentials adapter, and the HTTP transport is unchanged. `test/architecture-boundaries.test.js` passes.
- Read-only check: we extended the existing `status --target-url`, which already authenticates. `doctor` is local-only by contract and was left unchanged. `status` does not report the key's role (that would need an extra `/capabilities` request), so the 403 text does not offer `status` as its check.

## Tasks

- [x] Reproduce against a disposable local server: unknown, revoked, malformed and missing keys; env var vs `~/.config/jumpybrain/.env` vs per-target config. Document the actual precedence.
- [x] Auth-failure messages name the credential *source* and a short non-secret fingerprint (length / last 4), never the key, and give the recovery step.
- [x] Evaluate a read-only check: extended `status --target-url` (source + fingerprint + accepted; JSON `target.credential`).
- [x] Do not try to prove the reported server-redeploy key loss; recorded below as a separate unproven limit.
- [x] Tests: `test/http-client.test.js`, `test/env-file-credentials.test.js`, new `test/remote-auth-diagnostics-cli.test.js`; no Mac/browser suites.
- [x] Docs: [CLI remote access keys](../../docs/cli-commands.md#remote-access-keys), [shared-memory guide](../../docs/cloud-shared-memory.md#when-the-server-rejects-the-key) (its stale "no local-config fallback" text was replaced), CLI and credentials module docs, CLI help target line. The release note and follow-up/feedback-index closure are handed to the coordinator.

## Verification

Snapshot: branch `worktree-agent-a59d6106f902cc5b8` from `811591f2`, `npm run build` then `tsc` after the last source edit.

- `node --test test/remote-auth-diagnostics-cli.test.js test/env-file-credentials.test.js test/http-client.test.js`: **22 pass, 0 fail**. Real in-process server, real CLI and fake keys. Covers a stale export shadowing an app key (fingerprints of both, precedence, `~/.zshenv` hint) and that unsetting it makes `status` pass and name the app key. Also covers revoked, reader 403, admin 403, missing, quoted and smart-quoted keys, and collaborate 1008. Every case asserts that no key appears in output.
- `node --test test/architecture-boundaries.test.js test/cli-error-contracts.test.js test/access-keys.test.js test/cli-help-validation.test.js test/memory-cli.test.js test/collaboration-cli.test.js test/remote-access-policy.test.js`: **73 pass, 0 fail**.
- `node --test test/cli-connections.test.js test/server-recent.test.js test/cli-target-resolution.test.js test/boards-cli.test.js test/bounded-retrieval-cli.test.js test/package-footprint.test.js test/package-entrypoints.test.js`: **27 pass, 0 fail**.
- Manual reproduction with `env -i` against the disposable server: before/after table above. `git diff --check` is clean.

## Limits

- **Reported server-redeploy key loss (and note loss) is unproven.** This list neither reproduced nor ruled it out; it needs separate persistence evidence from the affected deployment. Issued keys live in the server's operational `access.json`. A redeploy that drops that state would make issued keys fail with exactly this 401, and the new message helps diagnose that but cannot tell it apart from a mistyped or revoked key.
- The server's 401 does not distinguish unknown, revoked or other-server keys, and was intentionally left unchanged.
- The last four characters plus the length are shown for keys of 16+ characters. For issued `jb_` keys (46 characters, 256 random bits) this reveals little. Short operator-chosen bootstrap keys show only their length.
- `status` does not report the key's role. The Mac app's own connection errors were not changed.
- Not run in a packaged/installed CLI, against the shared VPS or on 0.3.22. Untested in Windows shells.
