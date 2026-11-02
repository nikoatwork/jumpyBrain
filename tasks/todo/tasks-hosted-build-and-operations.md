# Repair container build inputs and close hosted operation gaps

Priority: P1 for container build; P2 for operator documentation and credential ergonomics. Status: packaging implemented and Linux ARM64 image/operations fixtures passed on 2026-11-02; active pending actual systemd-manager validation of the documented unit's sandbox, boot/restart and resource enforcement. No deployment or image publication performed.

## Goal

Make the documented Docker deployment build from a clean context and give operators accurate, tested instructions for credentials, writer migration and recovery.

## Evidence and current coverage

- [VPS deployment report, 2026-10-30](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=fb7d4d0a-6c1b-49ce-b7e6-4d64dbe76bc1) identifies missing build scripts in Dockerfile and requests scoped credentials, reproducible setup, safer service defaults and restore guidance.
- Before repair, Dockerfile copied source/configuration before `npm run build` but omitted `scripts/`; the build invokes an editor build script. Clean-context reproduction and full build/runtime closure are verified below.
- Scoped named reader/writer credentials and revocation now exist in [collaboration](../../docs/collaboration.md#separate-access). Do not create a duplicate authorization subsystem or describe all issued credentials as whole-brain writers.
- [Portable installation](tasks-portable-installation-project-integration.md) owns published artifact installation. [Public sandbox hardening](tasks-public-sandbox-hardening.md) owns sandbox-specific deployment restrictions; this list owns private hosted build/runbook gaps.
- [Remote UX outcome](../done/2026-10-31_tasks-remote-switching-ux.md) covers app permission explanations, older-server boards and identical-install Keychain continuity. Signing across changed releases remains a separate distribution limit.

## Relevant files

- `Dockerfile`, `.dockerignore`, `package.json`, `scripts/build-editor.mjs` — container build closure.
- `src/server/index.ts`, `src/app/server-memory/server-memory.docs.md`, `src/adapters/access-control/access-control.docs.md` — server composition and credentials.
- `docs/cloud-shared-memory.md`, `docs/collaboration.md`, `docs/release-testing.md` — operator instructions and appropriate change-specific gates.
- `scripts/hosted-container-smoke.mjs`, `scripts/hosted-runtime-checks.mjs` — clean declared-input context, private sentinel exclusion, real Docker/QMD retrieval, access rotation, replacement and restore fixture.
- `scripts/engine/package{,-lock}.json` — existing locked QMD graph reused unchanged.
- `docs/vps-deploy.md`, `docs/coolify-deploy.md` — checksum-pinned release example, non-root container ownership, bounded service defaults and deployment/backup guidance.

## Tasks

- [x] 1.0 Repair and verify container packaging.
  - [x] 1.1 Reproduce from a clean context and enumerate every build input, embedded browser/feedback asset and runtime dependency. Check .dockerignore rather than assuming copying one script is sufficient.
  - [x] 1.2 Copy the required build inputs and include the actual hosted runtime dependency closure. Keep secrets, local state, evals and private memory out of the image.
  - [x] 1.3 Run the built image against a disposable mounted brain; verify health, initialization, authenticated CLI read/write/index paths and restart persistence. A health response alone does not prove retrieval readiness.
  - [x] 1.4 Add a focused clean-context build check to the relevant deployment/release gate; report Docker/platform availability honestly without expanding the dormant scale-testing program.
- [/] 2.0 Reconcile credential and deployment guidance with current support.
  - [x] 2.1 Link issued reader/writer credentials from the shared-memory guide; distinguish bootstrap administration, server authorization and device-local read-only settings.
  - [x] 2.2 Document deliberate rotate/revoke verification with old-key rejection and safe secret delivery. CLI remains environment-only; reuse agent-host secret injection and existing Mac native storage. A new cross-platform CLI store is explicitly deferred because provider/unattended-access policy is separate from this packaging repair and target routing.
  - [/] 2.3 Checksum-pinned release/systemd example, explicit writable paths, resource limits and proxy/firewall assumptions documented. Disposable Debian checks passed for checksum mismatch refusal, extraction, locked installs, non-root init/index/serve, `systemd-analyze verify` and nginx HTTPS/authenticated protocol-2 WSS. **Remaining:** run the actual unit under a disposable Linux systemd manager; verify sandbox writable-path behavior, boot/restart/stop and cgroup limits. The docs label the unit as an operator example until this passes.
  - [x] 2.4 Add a migration inventory/drain checklist for all service/container/CLI/raw-file writers and retired redeployments/secrets. Explain client and server upgrades separately.
  - [x] 2.5 Distinguish replacement backups from recurring off-host backups, identify canonical versus unique operational data, and exercise restoration into a disposable root before documenting recovery success.
- [/] 3.0 Verify and finalize.
  - [x] 3.1 Record image/source digest, platform, actual runtime smoke and restore/credential checks; leave untested Linux/proxy assumptions explicit.
  - [/] 3.2 Owning docs, pending release note and selective hosted-container changelog updated. Commit the verified scoped increment; retain this active list until 2.3 passes, then archive and repair inbound references under [task completion](../../docs/task-workflow.md). Do not deploy to a user's VPS or publish an image as part of this task without authorization.

## Verification — 2026-11-02

Tested source base: `a2a90cfe8c314e7d3ed8be45d9c5d45a8a2b0a25` plus this lane's scoped working diff. The handoff commit identifies that diff. Container build-input SHA-256: `6f4054dc9e2002a3942e597d3a6ad427acb5ae037c2fc8801feebf3f4eb83f58`. Final tested image ID: `sha256:f5f93963a25db2a26c165456e54b0f85af1f9162bd6ca24f6d80a5ba5b803ef6` (local fixture removed after verification, never published). Docker Desktop 4.37.2 / Engine 27.4.0, Linux ARM64, Node 22.23.4, QMD 2.8.3; base resolved to `node:22-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da`.

- Before repair, real `docker build` failed at missing `/app/scripts/build-editor.mjs`. Adding the build scripts exposed QMD's missing Python/native build toolchain on Linux ARM64. Separate engine compilation now uses the existing engine lockfile. The local maintenance fixture also exposed that the QMD environment override must be absolute; image/runbook defaults now provide it.
- `npm run smoke:hosted` passed on the final build inputs. It checked filtered context with excluded private sentinel files (including beneath `src/` and `scripts/engine/`), required generated assets and production esbuild/WebSocket/QMD dependencies; fresh nonempty lexical recall; canonical byte hashes; reader mutation denial; issued writer replacement/revocation and old-cookie rejection; overlapping then removed bootstrap keys; graceful SIGTERM exit 0; fresh readiness/access/canonical persistence through container recreation.
- The same smoke stopped the owner, created a checksum-verified private backup including canonical files, root policy, access/revocations and retained recovery source; deleted the entire disposable brain; restored at its original absolute path; verified exact bytes; rebuilt the index and recalled the known note after restart. Restoring over subsequently changed/revoked credentials failed as intended. No personal brain, real secrets, public ports or semantic model was used.
- In a separate disposable `node:22-slim` Linux container, `npm ci`, `npm run build` and `node --test test/architecture-boundaries.test.js test/package-entrypoints.test.js test/package-footprint.test.js test/access-control.test.js test/multiplayer-upgrade.test.js` passed **29/29**. `npm run cli:pack` passed, validating 284 required files; archive 1,445,214 bytes, unpacked 4,599,679 bytes, runtime 3,083,142 bytes, 629 files on that snapshot. No package versions or lockfiles changed.
- A disposable Debian fixture used the local compiled archive (not a published GitHub download), required matching SHA-256 and rejected a wrong one, extracted the release, installed locked root/engine production dependencies and ran the documented service identity's init/index/stop/foreground commands. It extracted the exact unit/nginx code blocks from `docs/vps-deploy.md`; `systemd-analyze verify` and `nginx -t` passed. With a trusted disposable TLS certificate and local proxy, HTTPS health plus authenticated protocol-2 WSS hello passed. No user host service was modified.
- The first host `npm run build` attempt could not find `tsc` because this isolated worktree has no installed dependencies. Required focused build/package checks subsequently passed inside the disposable Linux container; no host installation was performed. The parent owns combined-snapshot/full deterministic checks.
- Final runner syntax checks, changed-document relative file links, `git diff --check` and the staged private-data guard passed. The clean-context smoke passed again after adding explicit fixture-cleanup failure reporting.

## Open gates and limits

- Parent's [final combined integration](../done/2026-11-02_tasks-feedback-parallel-integration.md) passed all 1,828 tests with real QMD and the Linux ARM64 container gate after other CLI/runtime changes. Hosted fixture waits boundedly for fresh publication when maintenance overlaps explicit indexing; it retains strict freshness, exact canonical/access hashes and retrieval/restore assertions. The real systemd-manager gate below remains open.

- **Required, 2.3:** this environment's containers did not run systemd as PID 1. Unit syntax and direct service commands passed, but actual systemd sandbox/boot/restart/cgroup enforcement remains unverified. Complete it in a disposable Linux VM/systemd test environment before archiving. Do not modify the user's host services to satisfy it.
- Generic nginx HTTPS/WSS passed locally; real Coolify, public DNS/TLS/firewall, remote secret distribution and off-host backup storage/encryption were not tested or deployed. Operators must verify their own environment.
- Linux ARM64 lexical retrieval passed. Linux AMD64, semantic GGUF/GPU runtime behavior and model sizing were not tested; no semantic or multi-platform support claim is added.
- Root/engine dependency graphs are locked. The Node base/Debian inputs can move; record/promote an actual tested image digest rather than promising bit-identical rebuilds.
- Task remains active deliberately; references from the feedback index/integration list still point here. Parent may integrate the verified packaging increment while retaining the named systemd gate.
