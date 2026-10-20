# One macOS app with desktop and menu-bar lifecycle

**Finalized 2026-10-18 — complete.** Completed unified desktop/menu-bar ownership, installation migration, and recorded lifecycle verification; distribution limits remain documented. Archived with user approval. Verification below is historical; no implementation checks were rerun for this archival pass.

## Goal

Ship one user-facing jumpyBrain macOS application combining the Electron editor window, menu-bar controls, and app-owned local services. Preserve CLI-only use without Electron or any macOS application.

## Decisions

- One Mac app identity, installation, and update flow. Retire the requirement to install/run a separately branded native companion alongside Electron.
- Closing the editor window keeps jumpyBrain running in the menu bar and keeps its gateway/local brain service available. Reopening through the menu bar or Dock restores the editor.
- Explicit **Quit jumpyBrain** exits the app and stops only services it owns. Independently running shared servers remain independent.
- CLI-only installation and local memory operations remain usable without the Mac app. Quitting the app does not remove access to canonical Markdown through the CLI; app-hosted endpoints become unavailable.
- Reuse the existing memory engine, editor, gateway, connection authorization, and Keychain behavior. Native helpers may remain internal implementation components of the single app.
- Window-close and quit behavior must preserve the existing pending-draft/save protections. Closing a window must not silently discard unsaved work.

## Context

The current Electron host depends on the separately installed Swift companion for gateway/runtime ownership and Keychain access. This ticket consolidated that ownership and packaging; implementation and local migration are complete (2026-10-16). Earlier desktop tickets retain historical verification and decisions superseded here:

- [Local Electron prototype](2026-10-18_tasks-electron-local-prototype.md)
- [Desktop experience](2026-10-18_tasks-electron-desktop-experience.md)

## Relevant Files

- `integrations/electron/` — unified application/tray lifecycle, owned host, quit flow, login preference, onboarding, packaging, rollback installer, and smoke entrypoint.
- `integrations/macos-companion/` — native menu controls, Keychain integration, gateway, connection switching, and existing update/lifecycle behavior.
- `scripts/setup-desktop.mjs`, `scripts/macos-companion.mjs` — setup and native packaging integration.
- `scripts/install-local-cli.mjs`, `install.sh` — preserve independent CLI installation.
- `src/architecture.docs.md`, `docs/product-vision.md` — shared-engine boundaries and product intent.

## Tasks

- [x] 1. Define and document single-app ownership.
  - [x] Map startup, gateway/runtime children, menu-bar actions, Keychain access, login behavior, updates, and shutdown to one app lifecycle.
  - [x] Choose which native responsibilities remain internal helpers and which move into Electron, preserving credential access and existing authorization boundaries.
  - [x] Specify recovery after crashes, failed startup, and stale service ownership without adopting or terminating unrelated processes.
- [x] 2. Implement desktop and menu-bar lifecycle.
  - [x] Keep the app and owned services running after the last editor window closes; provide reopen and explicit Quit actions.
  - [x] Preserve save/discard protections for window close, quit, and updates, including browser tabs using the gateway.
  - [x] Ensure single-instance launch, Dock/menu reopen, and service readiness work without a separate user-facing companion.
- [x] 3. Consolidate installation, updates, and migration.
  - [x] Package runtime and any native helper under one Mac app identity with one supported setup/update flow.
  - [x] Migrate existing companion/Desktop installations without losing profiles, credentials, browser state, login preferences, or Markdown; prevent duplicate background owners and retain recovery options.
  - [x] Preserve a CLI-only installation path with no Electron/native-app dependency or automatic CLI/agent retargeting.
- [x] 4. Verify the lifecycle and compatibility contracts.
  - [x] Exercise close/reopen, explicit quit, pending saves, login launch if enabled, single-instance launch, crash recovery, and update failure using disposable memory.
  - [x] Verify unchanged Keychain service/reference identity and disposable native Keychain behavior, local/remote connection switching, explicit remote write permissions, and independently running server preservation; document ad-hoc signing repair limits.
  - [x] Verify CLI install and local operations with the app absent and stopped; verify app-hosted endpoint unavailability is reported clearly after quit.
  - [x] Verify migration from the existing two-app installation and removal of duplicate app/login ownership without touching personal memory.
- [x] 5. Update owning docs and installation guidance.
  - [x] Document close-window versus Quit behavior, background availability, and the CLI-only option; update co-located architecture docs and affected terminology.
  - [x] Reconcile earlier Electron/companion task lists with the final ownership model. Record the completed structural change in `tasks/CHANGELOG.md` when implemented.

## Implemented ownership

- Electron owns the only user-facing app, tray, window, login preference, and Quit flow. The internal Swift host has no separate menu/update/login UI, watches its Electron parent, and owns the gateway/local engine. The gateway also watches its native parent.
- The bundle contains the compiled shared runtime/editor. Node and QMD remain external prerequisites. CLI installation/update is independent; the app no longer relies on `~/.jumpybrain/app` staying installed or on a separately installed companion.
- Quit prepares the registered-tab save barrier, closes windows through their draft guards, flushes diagnostics, revalidates/commits the shutdown lease, then stops the owned host. Failed/unresponsive saves and expired leases keep the app running. Closing the last window leaves the service live.
- `npm run desktop:setup` is the complete checkout-based install/update flow. The menu explains that flow; no automatic updater is claimed. Installation refuses running/foreign apps, uses the native singleton lock, rolls back failed publication, and archives prior bundles/login files without leaving extra launchable apps.

## Verification

- `npm run build` passed.
- Full `node --test --test-concurrency=4`: **1,041 passed, 0 failed, 1 skipped** (1,042 total; provisioned-QMD opt-in skip). The final focused host/lifecycle suite also passed all 10 tests, including the newly integrated Python installer regressions.
- Five disposable installer cases passed: two-app/login migration, disabled login preservation, refusal of running/foreign ownership, held-lock refusal, and rollback after app backups.
- `node scripts/electron-smoke.mjs` passed the existing onboarding, isolated renderer, feedback, Settings, graph, autosave, keep/discard, and tab cleanup checks.
- `node scripts/unified-desktop-smoke.mjs` passed with production application code and a signed internal native host: no window at background launch, live tray, editor open, browser save refusal blocking Quit, close-last-window keeping the gateway live, reopen/Settings, clean shutdown, forced Electron death stopping descendants, and recovery on relaunch.
- Native disposable RPC/Keychain/menu/diagnostic tests passed. Existing remote authorization and independently running server coverage passed. Historical ad-hoc Keychain ACL continuity is not guaranteed; service names/references are retained, with explicit Settings repair documented.
- `npm run desktop:pack` produced the arm64 app; deep strict signature verification passed. The final installed bundle uses the same tested lifecycle and bundled gateway/runtime.
- `git diff --check` passed. Unrelated browser-smoke/docs and activity-feed/topic planning work was preserved. A concurrent glossary addition was retained.

## Local migration

- Checked the old desktop's visible **Saved** status. The remaining Chrome editor was already fenced on Home and was left untouched. Quit Desktop through its menu; unloaded the validated old login job, then gracefully terminated the still-running, verified legacy helper after native accessibility timed out.
- Installed and launched `~/Applications/jumpyBrain.app`; removed older owned Desktop/Electron bundles from Applications into the recoverable archive `~/Library/Application Support/jumpyBrain Backups/before-20261016-225446-375665.tar.gz`.
- Existing connection state, CLI configuration, and CLI installation manifest hashes match their pre-migration values. Start at Login remains on. Authenticated state reports the existing local brain connected under the new owned-host identifier. CLI version works and its updater correctly declines to manage the independent Mac app.
- Native automation retained an obsolete bundle-path identity after replacement, so no post-migration accessibility/screenshot result is claimed. Process ownership, signed bundle, authenticated connected state, and disposable production lifecycle smoke establish the installed/runtime result.

## Remaining distribution limits

Physical logout/login, Intel hardware, fresh-machine toolchain provisioning, public signing/notarization, and custom/global legacy locations remain separate manual/distribution checks. Unsaved renderer drafts are not crash-persistent. At implementation time, this completed ticket was retained for user trial without an archive or commit. It was subsequently archived with user approval on 2026-10-18; the distribution limits above remain explicit.


## Publication verification — 2026-10-20

- Prepared the app-owned source, installer, docs, and regression tests in an isolated checkout; unrelated graph/activity-feed work stayed outside this snapshot.
- `npm run build` and `node --test --test-concurrency=4` passed: **1,059 passed, 0 failed, 1 skipped** (1,060 total; provisioned-QMD opt-in remains skipped).
- `npm run desktop:pack` produced the arm64 app and passed the built-in deep strict ad-hoc signature verification. Existing Swift Keychain deprecation warnings remain; no public signing/notarization is claimed.
- `node scripts/electron-smoke.mjs` passed onboarding, renderer isolation, feedback, navigation, autosave, and draft-close checks with disposable data.
- `node scripts/unified-desktop-smoke.mjs` passed normal, crash, and recovery cases with the newly packaged native host/runtime: background startup, tray/window reopening, blocked unsafe quit, live service after window close, safe shutdown, and owned-descendant cleanup.
- The outgoing-content guard and whitespace checks passed. Installed app, user memory, credentials, and login settings were not changed. Generated application bundles remain local build artifacts; publication is source plus build/install tooling.
- The user confirmed the snapshot-based clean Git history is intentional. Publish it to `master` with an exact force-with-lease, without reconnecting the previous remote history.
