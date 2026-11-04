# Recover the app after a local backend restart

Priority: P0. Status: complete, 2026-11-02. Extracted from unit 1 of [independent feedback increments](2026-11-04_tasks-feedback-independent-increments.md).

## Goal

Reconnect the selected local brain through its authenticated root descriptor after backend replacement, without quitting, replaying writes, changing brains or losing private drafts.

## Tasks

- [x] 1. Reproduce the stale gateway address with a disposable root, CLI stop and CLI-triggered replacement; record the old/new identities and failed operation.
- [x] 2. Revalidate cached local ownership, authenticate replacements with bounded startup, fence retired HTTP/live replies and retain existing draft/epoch conflict policy.
- [x] 3. Verify note/board/search recovery, saved and unpublished editor state, invalid/foreign/incompatible/unavailable owners, root changes and production packaged Mac path.
- [x] 4. Record verification/limits, update module docs and pending release notes, archive and commit the scoped changes.

## Relevant files

- `integrations/macos-companion/gateway.mjs`, `live-gateway.mjs`, `gateway.docs.md`
- `src/app/backend-host/`, `src/adapters/backend-host/` — existing authenticated discovery
- `test/companion-backend-restart.test.js` — real gateway/backend regression
- `scripts/backend-restart-smoke.mjs` — production desktop verification

## Scope

Existing unknown idle-edit and Quit/relaunch failures retain their separate owners. No installation, release, backend-build compatibility relaxation or automatic draft publication is authorized by this task.

## Reproduction and implementation — 2026-11-02

- Real disposable gateway + CLI `backend stop` + `recall` rotated instance, port and private capability. Unchanged gateway returned HTTP 503 for document GET against the old endpoint. The regression failed before the fix and passes afterward.
- Normal local resolution checks the private descriptor/lease and selected directory generation. Replacement discovery reuses authenticated `ensureRootBackend`, bounded startup and activation. No automatic replay occurs; later explicit requests reconnect.
- Local target objects fence retired HTTP responses and live subscriptions without changing browser brain/generation. Existing editor epoch/source reconciliation retains private drafts for review; dispatched uncertain writes retain their save-barrier admission.
- Ownership, stale/foreign registry, root replacement, unavailable startup, same-brain late HTTP/live replies and one-send mutation checks pass. Packaged Mac validation and the recorded full/final-focused test gates passed.

## Outcome and verification

- Selected the first actionable P0 in the feedback shipping order, ahead of P1/P2 improvements. The idle-note and Quit/relaunch P0 investigations remain open under their existing owners.
- Tested source base: `31dfe458ef69b9c2b1acf9f37fc7c28c07518b0c` plus this scoped implementation. Final gateway SHA-256 `bbd81eb53f5657684e4215bfd885516c98f39846bfcd795e7aa6f5d1444690fb`; live bridge `2699b4889d8609a9fd338b081a965c26730fcb86d9a04b642a2f46b0ab6ffb55`.
- `npm test`: 1,833 total, 1,831 passed, zero failed, two opt-in skips (104.253 s). This full run preceded the final late-hello destination-map cleanup and added incompatible-build/disconnected-write cases. Final focused run below covers those changes.
- Final `node --test test/companion-backend-restart.test.js test/companion-live-gateway.test.js test/backend-host.test.js test/macos-companion-gateway.test.js test/macos-companion-index-transport.test.js test/extensions-gateway-http.test.js`: 64/64 passed (6.913 s), zero skips/failures. Covers real CLI replacement, preserved HTTP scope, ownership/root/build rejection, timeout diagnostics, stale HTTP/live replies, one-send writes, uncertain mutation admission, index forwarding and extension cancellation.
- Fresh disposable Mac bundle built and passed deep/strict ad-hoc signature verification. `node scripts/backend-restart-smoke.mjs --resources '.local-pack/backend-restart-desktop-final/jumpyBrain.app/Contents/Resources'`: **5/5 scenarios passed**, three distinct CLI-driven backend replacements and new ports. Production packaged application/native helper/runtime/CLI; Electron 44.10.0, macOS ARM64. Tests Retry with the same editor/scope, note/board/search access, new native input saving, and retained private drafts over unchanged/externally changed source with no automatic publication.
- Packaged runtime `0.3.17`, build `11ab69940a57dd89`; ASAR SHA-256 `ac83363918ef28e0f944c29623a8820f2fe3ea3251b5cb4139034117eb001e8c`. The harness verifies packaged gateway source equality, copies the runtime into a disposable resource tree and records results in ignored `.local-pack/backend-restart/report.json`. A session-local WebSocket interceptor holds reconnect while the test seeds an unsent positional draft through the production editor API; authentication, canonical storage and draft persistence remain real.
- Initial fixture failures were harness issues (nonexistent connected-state probe, composition not producing an unsent draft, draft-seeding syntax and attempting to overwrite an occupied build output); none are claimed passing. Final checks use the corrected deterministic fixture.
- `git diff --check`, script syntax and new/changed local Markdown links passed before commit. No personal brain or installed application was changed; no release/version bump/push is part of this task.

## Remaining limits and separate finding

- This is same-build, same-root local recovery. Remote reconnect/authentication, real OS sleep, Intel, LaunchAgent/Quit launch and a published updater remain outside this verification; old unconfirmed live writes still conservatively fence brain switching.
- An initial symlinked-runtime fixture added `.backend-pins/<instance>.json` inside its originally signed input bundle, after which deep/strict signature verification reported an added sealed resource. The final harness copies the runtime so the input artifact stays unchanged. This separate packaging/runtime-pin finding is recorded in [runtime hygiene](../todo/tasks-desktop-runtime-hygiene.md); it does not establish the historical launch failure's cause and is not repaired here.
