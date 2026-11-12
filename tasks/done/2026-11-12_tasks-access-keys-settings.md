# Access keys in Settings

Status: completed 2026-11-12.

## Need

- A small team running a shared brain on a VPS wants to give each person and agent their own key, and take one away again, without SSH.
- People using a brain only on their own Mac should not have to think about keys at all.

## Starting point

Named reader/writer/admin credentials, `.jumpybrain/access.json`, admin-only `GET/POST /access` and `DELETE /access/:id`, and the host-only `jumpybrain access --root` command already existed. There was no UI, no remote CLI, and the desktop gateway did not forward `/access`.

## Decisions

- Owner decision (2026-11-12): the panel and HTTP route may issue admin keys.
- Bootstrap keys from the server environment stay the recovery path; they have no ID and cannot be revoked from the panel.
- Key changes through the Mac app count as writes for the gateway's per-brain editing approval.
- Local brains show an explanation instead of key controls.
- A key cannot revoke itself (409, not 403, so the browser's connection state is not reset).

## Outcome

- [x] Server: `POST /access` accepts only `name`/`role` with clear `invalid_credential`/`credential_limit` errors; `DELETE` returns `{ revoked }` and refuses the key in use.
- [x] HTTP client and CLI: `jumpybrain access <list|issue|revoke> --target-url`; a device read-only origin allows only `list`.
- [x] Desktop gateway forwards `/access` for the active brain under existing admission.
- [x] Shared view: list, create (secret shown once, Copy key, Copy invite), revoke after confirmation, revoked keys collapsed, duplicate active names refused.
- [x] Mounted as Settings → Access keys in the Mac app and as a dialog under Connection settings in the hosted browser.
- [x] Docs: collaboration, protocol, CLI, VPS/cloud guides, module docs, footprint record, release note.

## Verification

Tested the working tree on `9621a4ae` plus this change (macOS ARM64, Node 26.7.0), after `npm run build`:

- `node --test test/access-keys.test.js test/companion-browser.test.js test/notes-browser.test.js test/macos-companion-gateway.test.js test/architecture-boundaries.test.js test/lexical-bundle.test.js test/cli-help-validation.test.js test/package-entrypoints.test.js test/package-footprint.test.js test/collaboration-live.test.js test/backend-host.test.js`: 184 passed.
- `npx --package=playwright node scripts/access-keys-smoke.mjs`: passed (hosted dialog incl. 390 px width; app Settings for local, read-only remote and approved remote through the production gateway).
- The committed snapshot excludes the separate uncommitted Settings redesign present in the checkout. It was rebuilt in a clean worktree at `9621a4ae` plus this change: the same Node files passed except `test/lexical-bundle.test.js`, whose licence-notice case depends on a real `node_modules` directory (the worktree used a symlink; it passes in the main checkout), and the Chromium scenario passed against the current sidebar-style Settings.
- Editor bundle: 183,453 gzip bytes (+2,688), 1,547 under the 185,000 gate.

## Limits

- No last-used time or expiry per key, and no audit trail of who issued or revoked.
- Key creation has no idempotency key: after an unconfirmed reply the view asks the admin to revoke and recreate.
- Duplicate-name refusal is client-side only; the CLI and HTTP route still accept duplicates.
- The hosted dialog button is shown to every connected role; non-admins see their own key's name and role.
- Native Electron window not exercised; Chromium covered the shared shell and the production gateway.
- `scripts/companion-browser-smoke.mjs` fails at "settings startup needs no memory fetch" because of a `/memories/all/boards` request from the separate, uncommitted Settings redesign in the same checkout; not caused by this change.
