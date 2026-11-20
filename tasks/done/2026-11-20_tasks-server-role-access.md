# Server roles decide app access

Status: done 2026-11-20. Branch `t3/server-role-permissions`; not merged, pushed, installed or released.

Source: task 2 of the [remote feedback implementation plan](../todo/tasks-remote-feedback-implementation.md) (November 20 feedback, 08:30 and 08:48 UTC). Owner decisions applied: the server role alone sets what a remote connection may do; the device `allowWrites` flag is removed, including restrictions already saved; effective access is shown only in Settings; blocked actions stay visible and explain themselves with a Settings action; named capability sets for the three existing roles, no custom roles.

## Tasks

- [x] **Named capability sets.** `src/adapters/access-control` defines `read`, `write`, `manage_access` and the fixed sets: reader `[read]`, writer `[read, write]`, admin `[read, write, manage_access]`. Unknown or missing roles have none. The HTTP server enforces from these (`read_only` for a mutation without `write`, `admin_required` for `/access` without `manage_access`; `/_backend/` still needs the admin role). `GET /capabilities` adds `capabilities` (this key's set) and `roles` (all three sets).
- [x] **Device flag removed, old files kept.** Profiles store no permission. A `connections.json` from an older build (every profile carries `allowWrites`) opens unchanged: the flag is ignored and never held in memory, the file is byte-identical until the next deliberate save, and that save drops the flag. IDs, selection, credential references and keys are untouched. An older caller's boolean `allowWrites` in a save or CLI add is accepted and ignored.
- [x] **Gateway.** A remote role is resolved from the target's `/capabilities` with the health check (30 s memory per generation and key, forgotten when a health check fails) and reported as `state().access` and in the `/companion/test` reply. Before forwarding a mutation or any `/access` request for a remote profile the gateway requires the capability: known role without it → 403 `read_only`/`admin_required`; unconfirmed → 403 `access_unconfirmed`, or 503 when the server or key file is unavailable. The check only refuses: the request carries the key and the server authorizes again. Local profiles are the user's own and unchecked.
- [x] **Live bridge.** The upstream `hello` role reaches the editor unchanged (it was rewritten to reader under the old flag). Writes go upstream only when that role includes `write`; reader, unknown, missing role, or a bridge built without the role table refuse `read_only`.
- [x] **Extensions.** A command write needs the per-invocation approval and the role check, run inside the admitted operation. Without a role check wired in, every extension write is refused.
- [x] **Shared browser.** `companionReadOnly()` follows `companionState.access`; anything but an explicit capability list grants nothing. The workspace banner, the brain switcher's read-only label and the Allow editing checkbox are gone. Settings → Access keys has **Your access** (role, key name, each capability Allowed/Not allowed; Not confirmed when the role is unknown); the active connection row names the role. New note, typing in or deleting an open note, New board, New drawing, both index refresh controls, Dream handoff and extension write commands stay available and explain the restriction with **Open Settings**. Key creation stays visible to non-admins, disabled, with the reason. The hosted dialog shows the same access summary.
- [x] **CLI.** `connections test` and `status --all` report each connection's effective access; `--allow-writes` is accepted and ignored with a note; help and docs updated.
- [x] **Docs.** Gateway (new Effective access section), connection store, access control, HTTP server, browser contract, extension browser, shared-memory protocol (`GET /capabilities`), CLI commands, Mac app README, Electron, build footprint.

## Contract for the diagnostics work

`GET /capabilities` (any valid key):

```json
{ "protocol": 2, "brainId": "<sha256>", "live": true,
  "principal": { "id": "…", "name": "…", "role": "reader|writer|admin" },
  "capabilities": ["read", "write"],
  "roles": { "reader": ["read"], "writer": ["read", "write"], "admin": ["read", "write", "manage_access"] },
  "maxDocumentBytes": 2097152 }
```

`capabilities` and `roles` are new; servers before this change send only `principal.role`, from which the same set is derived. No role, or an unknown role, means no capabilities.

Active profile (`GET /companion/state`): `active` is `{ id, name, kind: "local", root }` or `{ id, name, kind: "remote", url }` (no `allowWrites`, no credential reference). Beside it, `access` is `null` (no brain selected) or:

| Field | Values |
| --- | --- |
| `source` | `local`, `server` |
| `role` | `reader`, `writer`, `admin`, or `null` when unconfirmed. Local reports `admin`. |
| `capabilities` | subset of `read`, `write`, `manage_access`; empty when `role` is `null` |
| `name` | the server's name for the key; confirmed server role only |
| `reason` | with `role: null` only: `checking`, `offline`, `authentication_failed`, `credential_unavailable`, `backend_version_mismatch`, `unsupported` |

`POST /companion/test {id}` now returns `{ health, access }` for any profile, active or not. `GET /companion/connections` profiles have the same shape as `active` plus `available` for local ones. Consumers should test `capabilities`, not the role name.

Migration: `connections.json` stays `version: 1`. On disk a profile may still carry a boolean `allowWrites`; it means nothing and disappears at the next save. No key, ID or selection changes. A build from before this change cannot open a file once it has been saved without the flag (it fails closed with `INVALID_STATE` and replaces nothing).

## Decisions

- The gateway check is refusal only. Granting stays with the server, so a remembered or wrongly advertised role cannot produce a write the server would refuse (tested with a server whose `/capabilities` answer claims admin for a reader key).
- A local profile reports full access without asking its backend. A local folder has no server role, and tying its presentation to backend reachability would have changed local behavior.
- `connections.json` keeps version 1 and stops writing the flag rather than writing a constant `true` for older builds. Rollback right after an update still works because opening never rewrites the file; a downgrade after a later connection change fails closed. Writing a compatibility `allowWrites: true` is the alternative if downgrade after a change must keep working.
- Editor bundle ceiling raised from 186,000 to 186,500 gzip bytes for a measured +492 (186,353 total); the capability rows are server-rendered to keep it small. Recorded in `docs/build-footprint.md`.

## Verification

Snapshot: working tree on `94b77fc5` plus this change; `npm ci`, `npm run build`, then:

- Focused unit selection, 51 files (every test file referencing the changed modules, plus CLI help, source graph and package entrypoints): **586 tests, 584 pass, 0 fail, 2 skipped**. Includes:
  - `test/access-keys.test.js` 5/5: the capability sets, prototype-name and unknown roles, `/capabilities` fields per role, reader refused every mutation including `/access`, writer edits but is refused `/access`, admin both.
  - `test/macos-companion-connections.test.js` 20/20: old profile file opens unchanged, keys/IDs/selection kept, flag dropped on next save, mixed file, non-boolean flag invalid.
  - `test/macos-companion-gateway.test.js` 33/33: reader denied note/delete/patch/index/board over HTTP with nothing created; key replacement changes generation and role; an admin connection saved with `allowWrites: false` writes and manages keys after restart with the file and keys untouched; unknown role, no principal, 404, non-JSON and 401 answers give `access_unconfirmed` with nothing forwarded; network failure gives 503; a false admin advertisement is forwarded and refused by the server; a key revoked after its role was remembered gets 401; `/access` needs admin.
  - `test/companion-live-gateway.test.js` 19/19: reader reads history/recovery and is refused all nine write RPCs through the bridge and `forbidden` by the server directly; writer and admin edit; revocation closes the session; key replacement restarts tabs under the new role; unknown, `owner`, missing role and missing principal never send a write upstream; a bridge without the role table refuses writes.
  - `test/companion-browser.test.js` 24/24, `test/companion-connection-ux.test.js` 11/11, `test/extension-gateway.test.js` 9/9, `test/extensions-gateway-http.test.js` 8/8, `test/cli-connections.test.js` 7/7, `test/electron-setup.test.js` 8/8, `test/boards.test.js` 6/6, `test/drawings.test.js` 12/12, `test/notes-browser.test.js`, `test/lexical-bundle.test.js` 3/3.
- `test/package-footprint.test.js` 4/4.
- `npx --package=playwright node scripts/server-role-access-smoke.mjs` (new; real server, gateway and Chromium, disposable roots and keys): PASS, six scenarios. An admin connection whose old file says `allowWrites: false` edits through the editor and the live socket, with the file and key unchanged until a deliberate change; Settings shows Admin with all three capabilities and creates a key; a reader key leaves New note, New drawing, the editor and index refresh available, each explaining with Open Settings, is refused over HTTP (`read_only`, `admin_required`) and live (`read_only`) and by the server directly, with the note and file list unchanged, and the access panel fits 390 px; a writer edits, is refused `/access`, and typing is saved by the switch barrier before a key change takes effect; a revoked key and a stopped server pause changes with an explanation and `access_unconfirmed`; a local folder has full access and creates a note.
- Other Chromium smokes after fixture updates: `access-keys-smoke` PASS (7 checks), `companion-browser-smoke` PASS, `boards-smoke` PASS, `note-workspace-smoke` PASS, `page-backlinks-smoke` PASS, `related-pages-smoke` PASS.
- `python3 integrations/macos-companion/test_connections_native.py`: PASS (menu, diagnostics, runtime hygiene, RPC) with the role-shaped state payload.
- `git diff --check` clean.

## Limits

Follow-up: [blocked actions explain themselves](2026-11-20_tasks-blocked-action-explanations.md) closes the secondary-control, hosted Settings-action and browser-only stale-role limits below, and reports measured results for the three smokes named first.

- Three Chromium smokes stop before the sections changed here, for reasons this change did not introduce; their fixture edits are unverified by a run: `remote-boards-compatibility-smoke` (its HTTP-only proxy does not carry the live socket, so the note stays "connecting"; access was admin and not read-only at the failing assertion), `drawings-smoke` (Chromium "Permissions policy violation: unload" console errors fail its page-error check), `contextual-attribution-smoke` (a popup bounds assertion at line 61).
- Not run: Electron smokes (`smoke-connections.mjs`, `smoke-simple-onboarding.mjs`, `boards-desktop-smoke.mjs`; Electron dependencies are not installed in this worktree), `related-pages-local-smoke.mjs` (needs a real running app and brain; it now refuses mutating requests in the browser instead of relying on a read-only profile), the experience eval, full `npm test`. No installed app, real brain or shared server was touched.
- Only the primary actions explain themselves. Folder moves and renames, board card edits, attention changes and formatting controls stay disabled under a role restriction without their own message.
- The hosted browser shows the access summary in its Access keys dialog; its blocked actions keep their existing messages without a Settings action.
- In a browser-only session nothing refreshes health after page start, so a role lost on the server appears in the UI after the app shell's regular state poll or a reload. Requests are refused by the server meanwhile.
- A remote server too old to report `principal.role` in `/capabilities` is treated as unconfirmed and cannot be changed from the app.
