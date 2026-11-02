# Bound desktop update storage and expose runtime ownership

Priority: P1. Status: planned; reported sizes and process paths are observations from one installation, not reproduced measurements.

## Goal

Stop obsolete update staging and logs from growing indefinitely, keep live daemons tied to a valid runtime, and make managed integration drift and backend ownership visible.

## Evidence and boundaries

- [Agent review part 3, 2026-11-02](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=a729c03c-d819-4c5f-ad04-a539473ef8c4) reports gigabytes of old update staging, a live daemon executing inside staging, stale managed skill files, an advertised missing CLI config and normal child shutdowns labeled as failures.
- [Second-brain setup report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=53419d9b-2c42-4686-b20d-d226e2f8dc8a) also reports old app copies and an agent-shell launch exiting before useful diagnostics. A reported code-signing line is not an established launch cause.
- Never prune a running executable, current preparation, required rollback, user data, credentials or drafts. Inventory and dry-run precede deletion; no cleanup of the user's machine is authorized by creation of this plan.
- [Update speed](tasks-desktop-update-30-seconds.md) owns prebuilt-helper latency work. [Portable installation](tasks-portable-installation-project-integration.md) owns CLI-only payload measurement and trimming; reuse those owners instead of adding a package split here.

## Relevant files

- `integrations/electron/electron.docs.md`, `integrations/electron/update-worker.mjs`, `integrations/electron/update-transaction.py`, `integrations/electron/diagnostics.mjs` — staging, swap, rollback and host events.
- `src/adapters/backend-host/backend-host.docs.md`, `src/app/backend-host/backend-host.docs.md`, `src/cli/backend-commands.ts` — daemon ownership and inspection.
- `scripts/public-install.mjs`, `scripts/install-local-cli.mjs`, `src/adapters/logging/logging.docs.md`, `src/adapters/diagnostics/diagnostics.docs.md` — managed files/configuration and bounded logs.

## Tasks

- [ ] 1.0 Establish ownership before cleanup.
  - [ ] 1.1 Inventory current/legacy update roots, installed and staging runtime references, rollback records, active workers and backend leases in disposable update fixtures. Record executable-path selection across swap/relaunch and CLI/app-owned lifetimes.
  - [ ] 1.2 Choose a bounded retention policy and explain which successful verification makes old staging eligible. Account for interrupted updates, locks and active daemons; age alone is insufficient.
- [ ] 2.0 Implement safe lifecycle and bounded retention.
  - [ ] 2.1 Launch/rebind replacement daemons from durable installed paths, or explicitly pin required staging until the daemon drains. Keep unrelated CLI/server backends alive under their existing ownership rules.
  - [ ] 2.2 Prune only validated obsolete owned staging after verified success, preserving required rollback. Provide a preview with reclaimable bytes; decide whether an explicit CLI prune operation adds value beyond automatic bounded cleanup.
  - [ ] 2.3 Document and enforce log rotation/retention at the existing logging seam; distinguish disposable logs from unique private drafts and operational credentials.
- [ ] 3.0 Make runtime and managed integration state inspectable.
  - [ ] 3.1 Add bounded backend enumeration from private owned descriptors, with root, PID/liveness, executable and supported diagnostic fields. Do not infer ownership solely from process names or scan unrelated files.
  - [ ] 3.2 Track installed hashes for managed skill files; refresh untouched files through the documented authorized integration-update flow, and report customized/conflicted files without overwriting them. Define migration when no prior hash exists.
  - [ ] 3.3 Resolve the missing-config reference by documenting intentional optional absence or creating the minimal file at its proper owner; do not manufacture policy to silence a warning.
  - [ ] 3.4 Distinguish expected shutdown from child failure and add a bounded pre-startup failure breadcrumb where feasible. Verify agent-shell launch separately from user launch before attributing code-signing failures.
- [ ] 4.0 Verify and finalize.
  - [ ] 4.1 Test successful/repeated/failed/interrupted updates, rollback, a daemon still using staging, foreign/symlink paths and concurrent cleanup. Assert protected data remains byte-identical and no live runtime is removed.
  - [ ] 4.2 Test customized/unmodified/missing integration files and normal/failing shutdown diagnostics; run affected installed-update and backend lifecycle checks.
  - [ ] 4.3 Record bounded before/after storage, runtime paths and platform limits; update install/update/module docs and relevant release notes, then archive/commit under [task completion](../../docs/task-workflow.md).
