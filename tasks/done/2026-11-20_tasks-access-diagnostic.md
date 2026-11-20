# CLI access diagnostic

Status: done 2026-11-20. Child of [remote feedback implementation](../todo/tasks-remote-feedback-implementation.md), task 5. Branch `t3/cli-access-diagnostic`, on the integrated base `029b414c` (server-role permissions, read-only command mode and zero-hit hint merged).

## Problem

A user could not tell which brain a CLI command uses, which key it sends, what that key may do on the server, and what this device blocks on top. The app's selection, the CLI's target, the server role and the two local read-only guards are four separate things that were only visible through errors.

## Tasks

- [x] Read the merged permission contract (`/capabilities`, `/companion/state`, `/companion/test`), credentials and policy seams.
- [x] Add one observational command, `access whoami`, in its own CLI module with a bounded HTTP seam.
- [x] Keep it available under read-only command mode and a per-origin read-only policy, including a broken policy file.
- [x] Focused tests: real reader/writer/admin server, real companion gateway, legacy and malformed servers, missing and insecure credentials, redaction.
- [x] Owning docs, archive, commit.

## Contract

`jumpybrain access whoami [--root <memory-root> | --target-url <url>] [--directory <support-directory>] [--json]`. Full reference: [checking access](../../docs/cli-commands.md#checking-access-access-whoami).

- **CLI target**: the ordinary `resolveCliTarget` selection (flag, `JUMPYBRAIN_MEMORY_ROOT`, approved project, install manifest), without recipe discovery or a fallback root. No target is reported as `target.kind: "none"` with the reason, never an error. The app's selection never selects it.
- **Key** (remote): the three sources in precedence order (`environment`, `app-connection`, `env-file`), each `found` true, false or `null` (key file not checked), with the one that is sent marked `used`. Shown: source, variable, file, length, last four characters of 16+ character keys.
- **No request without a usable key**: none found, key file insecure or unreadable, or a key with characters that cannot be sent.
- **Server role**: one `GET /capabilities`, 10-second deadline, redirects not followed, 16,384-byte body cap, no retry. Confirmed only for `reader`, `writer` or `admin`. Capabilities are that role's fixed set intersected with the server's list; an older server (role only) gets the fixed set, labelled `capabilitiesFrom: "role"`; a list that is not a list of names is unconfirmed.
- **Unconfirmed** is `role: null`, `capabilities: []` and a `reason`: `credential_unavailable`, `authentication_failed`, `offline`, `unsupported`, `folder_unavailable`, or the app's `checking` / `backend_version_mismatch`. `effective.<capability>.allowed` is then `null`, never an assumed reader.
- **This device**: `restrictions.commandMode` (`read-only` from the environment or the policy file, `off`, `invalid`), `restrictions.originPolicy` (`read-only`, `off`, `invalid`, `not-applicable`), `restrictions.policyFile`. `effective` lists `blockedBy` tokens: `server_role`, `unconfirmed`, `folder_unavailable`, `command_mode`, `origin_policy`, `policy_invalid`.
- **Local target**: `access {source: "local", role: "admin", capabilities: [read, write, manage_access]}` (the app's shape for a local folder) when the folder and its `jumpybrain.json` exist; no key, no backend, no runtime status.
- **Mac app**: `{running: false}` when closed; `{running: "unknown", problem}` when its control files are unsafe or it does not answer; otherwise its selected connection, health, access and `matchesCliTarget` from one native `GET /companion/state`.
- Exit 0 whenever the check ran. Argument errors (two selectors, a URL with credentials, a non-HTTP URL, unknown flags) exit 1 as plain text.

Text output, real disposable server, writer key, `JUMPYBRAIN_READ_ONLY_COMMANDS=1`, app closed:

```text
CLI (what jumpybrain commands here use):
  target: remote http://127.0.0.1:64135 (flag)
  key (the first one found is sent):
    1. JUMPYBRAIN_API_KEY in the environment: found (46 chars, ends …wXyZ) — used
    2. key the app saved for this URL in ~/.config/jumpybrain/.env: not set
    3. JUMPYBRAIN_API_KEY in ~/.config/jumpybrain/.env: not set
  server role: writer (read, write) as "Laptop agent"
  this device: read-only command mode ON (JUMPYBRAIN_READ_ONLY_COMMANDS); state-changing commands are blocked for every target; this server is not marked read-only on this device
  effective: read yes; write no (read-only command mode on this device); manage access keys no (read-only command mode on this device; not in the server role)
Mac app (its own selection; never the CLI target):
  not running, so its selection and access are not shown
```

## Decisions

- `access whoami`, not a new top-level command or a `status`/`doctor` section. `status --all` already lists every app connection; this command answers one question for one target and the app's selected connection only.
- Nothing added to `status` or `doctor`. Showing the role in remote `status` would cost a second request on every status call, and `doctor` is local-only. The one cross-reference is a pointer appended to the existing HTTP 403 `read_only` / `admin_required` explanation.
- Dispatched before `accessCli` and before `enforceRemoteAccessPolicy`, and classified as a read. An invalid policy file stops every other remote command; the diagnostic reports it instead, because that is when it is needed.
- The policy file's validation error is not printed: it can quote an origin with embedded credentials. A fixed sentence names the file.
- Capabilities never exceed the confirmed role's fixed set, whatever the server lists (the real server enforces by role). A shorter list is believed. The Mac gateway shows the stated list as is; the two differ only for a server that states more than its role has.
- A bootstrap key's principal ID is derived from the key's hash, so only UUID credential IDs are passed on.
- The app is asked with `/companion/state`, the request its own pages poll, not `/companion/test` per profile. No offline read of `connections.json`.
- A local folder is not tested for writability: such a probe is unreliable under agent sandboxes and would be the diagnostic's only filesystem side channel. The text says file permissions decide.
- The app-connection key's variable name (`JUMPYBRAIN_KEY_<REF>`) is shown, as `status --json` already does, so the user can find the line in the key file.

## Files

- New: `src/cli/access-diagnostic.ts`, `test/access-whoami.test.js`.
- `src/adapters/http-client/access.ts`: `probeRemoteAccess` and its outcome type.
- `src/adapters/credentials/env-file.ts`: `remoteKeyCandidates` also returns `fileProblemCode`.
- `src/cli/args.ts` (whoami flags), `src/cli/commands.ts` (dispatch), `src/cli/remote-access-policy.ts` (read classification), `src/cli/usage.ts` (help, per-child syntax, stale `--allow-writes` sentence in `connections` help), `src/cli/remote-credentials.ts` (403 pointer).
- Docs: `docs/cli-commands.md`, `src/cli/cli.docs.md`, `src/adapters/http-client/http-client.docs.md`, `src/adapters/credentials/credentials.docs.md`.

## Overlaps for the parent

- **Package file budget**: `test/package-footprint.test.js` fails on the base without this change (`files = 782, limit 780`); this module adds two compiled files (784). The limit in `scripts/package-budget.mjs` and `docs/build-footprint.md` needs a reviewed decision; it was not changed here.
- `src/cli/instructions.ts` (not edited): the `setup` topic still says `status --all` shows "writes allowed" and does not mention `access whoami`.
- `src/cli/usage.ts`: besides the `access` entry, one sentence in the `connections` help ("Remote connections are read only unless --allow-writes.") was replaced, because the flag no longer does anything.
- `src/cli/remote-credentials.ts`: one clause appended to the 403 explanation. `test/remote-auth-diagnostics-cli.test.js` still passes (it asserts no `Check with` on 403; the new clause is worded `See what this key may do`).
- Not edited: browser permission and Settings files, the gateway, `tasks/CHANGELOG.md`, `tasks/todo/release-next.md`, `tasks/feedback.md`, `tasks/todo/tasks-feedback-follow-ups.md`, the parent task list, the distributed skill.

## Verification

Snapshot: working tree on `029b414c` plus this change; `npm ci`, then `npm run build` once after the last source edit.

- `node --test test/access-whoami.test.js` — 8/8 pass. Covers:
  - the probe against scripted servers: current and role-only answers, unknown roles, malformed and unknown capabilities, HTML and oversized bodies, 401/403/404/429/5xx, a redirect that is not followed, a timeout, a refused connection;
  - a real in-process server (`startJumpyBrainHttpServer`) with issued reader, writer and admin keys, the bootstrap key and a revoked key, through the built CLI in text and JSON;
  - every key source, precedence, a referenced key, an insecure key file, an exported key beside an insecure file and an unsendable key, with a request counter proving nothing is sent without a usable key;
  - read-only command mode from the environment and the policy file, the per-origin policy, an invalid policy file whose content holds a fake password, an invalid variable, and the real commands those guards block;
  - a local target (available, missing, uninitialized) with an unchanged file listing, and no target;
  - strict arguments, help, a URL with credentials and a query string;
  - a real companion gateway (`startCompanionGateway`, native control token): app closed, local selection, a remote selection with a reader key beside a CLI writer key, a revoked app key, an unsafe control file, a refused control token, a quit app and an unresponsive leftover descriptor, with the support folder listing and selection unchanged.
- Negative control: with the built output loosened (stated capabilities taken as is, unknown roles accepted, the unsendable-key and unconfirmed branches removed), 5 of 8 tests failed; the build was restored and the file re-ran 8/8.
- `node --test` on `cli-help-validation`, `read-only-command-mode`, `remote-access-policy`, `remote-auth-diagnostics-cli`, `cli-connections`, `env-file-credentials`, `access-keys`, `architecture-boundaries`, `package-entrypoints`, `source-graph-contracts`, `instructions-topics`, `http-client`, `admission-errors` together with the new file — 92/92 pass.
- `test/package-footprint.test.js` — 3 pass, 1 fails on the file-count budget, as it does on the base (see overlaps).
- `git diff --check` clean.

## Limits

- The gateway ran in-process with a stub local engine, and the server in-process on loopback HTTP. The packaged Mac app, an installed CLI, TLS, a reverse proxy and a real shared server were not exercised. No real brain was read or written.
- Not run: full `npm test`, browser or Electron checks, installer suites, `test/macos-companion-gateway.test.js` (the gateway is unchanged).
- The app side shows only the selected connection. Other connections remain under `connections test` and `status --all`.
- The app's own role can be up to two seconds stale (its health refresh interval), and is `checking` while the app switches connections.
- `effective` describes this CLI's guards and the server role. It does not test file permissions of a local folder, a sandbox around the agent, or server-side limits other than the role.
- Under either local read-only guard, `manage_access` is reported `allowed: false` although `access list` stays permitted when the role grants it; the docs state this, the JSON has no separate field.
- No `--check` exit status for scripts: the command exits 0 when the role is unconfirmed. Callers read `cli.access.role` or `cli.effective`.
- A proxy answering `/capabilities` with HTTP 403 is reported as a rejected key, as the app does.
