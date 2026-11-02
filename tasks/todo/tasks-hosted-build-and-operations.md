# Repair container build inputs and close hosted operation gaps

Priority: P1 for container build; P2 for operator documentation and credential ergonomics. Status: build-input omission verified by source inspection; a container build was not run during triage.

## Goal

Make the documented Docker deployment build from a clean context and give operators accurate, tested instructions for credentials, writer migration and recovery.

## Evidence and current coverage

- [VPS deployment report, 2026-10-30](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=fb7d4d0a-6c1b-49ce-b7e6-4d64dbe76bc1) identifies missing build scripts in Dockerfile and requests scoped credentials, reproducible setup, safer service defaults and restore guidance.
- Current Dockerfile copies source/configuration before `npm run build` but omits `scripts/`; the build invokes an editor build script. The precise complete build/runtime closure and actual failure still require clean-context verification.
- Scoped named reader/writer credentials and revocation now exist in [collaboration](../../docs/collaboration.md#separate-access). Do not create a duplicate authorization subsystem or describe all issued credentials as whole-brain writers.
- [Portable installation](tasks-portable-installation-project-integration.md) owns published artifact installation. [Public sandbox hardening](tasks-public-sandbox-hardening.md) owns sandbox-specific deployment restrictions; this list owns private hosted build/runbook gaps.
- [Remote UX outcome](../done/2026-10-31_tasks-remote-switching-ux.md) covers app permission explanations, older-server boards and identical-install Keychain continuity. Signing across changed releases remains a separate distribution limit.

## Relevant files

- `Dockerfile`, `.dockerignore`, `package.json`, `scripts/build-editor.mjs` — container build closure.
- `src/server/index.ts`, `src/app/server-memory/server-memory.docs.md`, `src/adapters/access-control/access-control.docs.md` — server composition and credentials.
- `docs/cloud-shared-memory.md`, `docs/collaboration.md`, `docs/release-testing.md` — operator instructions and appropriate change-specific gates.

## Tasks

- [ ] 1.0 Repair and verify container packaging.
  - [ ] 1.1 Reproduce from a clean context and enumerate every build input, embedded browser/feedback asset and runtime dependency. Check .dockerignore rather than assuming copying one script is sufficient.
  - [ ] 1.2 Copy the required build inputs and include the actual hosted runtime dependency closure. Keep secrets, local state, evals and private memory out of the image.
  - [ ] 1.3 Run the built image against a disposable mounted brain; verify health, initialization, authenticated CLI read/write/index paths and restart persistence. A health response alone does not prove retrieval readiness.
  - [ ] 1.4 Add a focused clean-context build check to the relevant deployment/release gate; report Docker/platform availability honestly without expanding the dormant scale-testing program.
- [ ] 2.0 Reconcile credential and deployment guidance with current support.
  - [ ] 2.1 Link issued reader/writer credentials from the shared-memory guide; distinguish bootstrap administration, server authorization and device-local read-only settings.
  - [ ] 2.2 Document deliberate rotate/revoke verification with old-key rejection and safe secret delivery. Evaluate whether CLI credential storage is still missing after reusing existing environment/native seams; decide separately from brain target routing.
  - [ ] 2.3 Provide a checksum-pinned release/systemd example with explicit writable paths, bounded resources and existing-proxy/firewall assumptions. Test the declared example on a disposable Linux environment before calling it supported.
  - [ ] 2.4 Add a migration inventory/drain checklist for all service/container/CLI/raw-file writers and retired redeployments/secrets. Explain client and server upgrades separately.
  - [ ] 2.5 Distinguish replacement backups from recurring off-host backups, identify canonical versus unique operational data, and exercise restoration into a disposable root before documenting recovery success.
- [ ] 3.0 Verify and finalize.
  - [ ] 3.1 Record image/source digest, platform, actual runtime smoke and restore/credential checks; leave untested Linux/proxy assumptions explicit.
  - [ ] 3.2 Update owning docs and release notes for implemented changes, then archive/commit under [task completion](../../docs/task-workflow.md). Do not deploy to a user's VPS or publish an image as part of this task without authorization.
