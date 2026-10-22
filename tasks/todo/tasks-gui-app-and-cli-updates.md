# GUI updates for the Mac app and CLI

Status: complete and verified on Apple Silicon (2026-10-22). The original checkpoint was `6535097`; work resumed after the user's pause. No user installation or published release was changed.

## Implemented contract

- One desktop operation serves the sidebar, native app menu, and tray. Its separate sandboxed local window exposes fixed, sender/main-frame/URL-checked IPC actions. Hosted/browser sessions get no updater bridge; release notes are text.
- Discover published numeric GitHub releases, including 0.x beta releases; pin one asset URL/ID, size and SHA-256 digest. Download the compiled runtime plus desktop/native build resources, then build locally using the Electron lockfile. No branch HEAD, checkout, credentials, notarized binary or stable-only feed is assumed.
- Keep the editor usable during preparation; cancellation and restart deferral precede installation. An acknowledged handoff follows all-tab saves, window closure and shutdown lease commit. The copied external worker waits for parent exit. Parent death before handoff cancels preparation.
- The public CLI installer, GUI updater and source-based desktop publication share `.installer-lock`. Native publication/recovery also holds the native service lock. Custom/pinned/missing/unowned CLIs require an explicit app-only action; supported managed CLIs update with the app. Preserve source/ref policy, CLI targets, agent integrations, login preference, connection/Keychain references and Markdown. Never downgrade a newer managed CLI or implicitly index/update a hosted server.
- Journal device/inode identities before macOS atomic exchanges of CLI runtime, manifest and app. Retain previous components; rollback is repeatable even if recovery is interrupted. Incomplete publication fences normal startup and offers GUI recovery. Relaunch success requires the exact worker-issued native host nonce and matching installed component versions.
- Local prerequisites: macOS 13+, Node 22.12+, npm, Python 3.9+, Xcode Command Line Tools, external QMD and 3 GB free. Logs are private and bounded at 256 KiB per job. Recovery folders remain under `~/Library/Application Support/jumpyBrain Updates`.

## Verification — 2026-10-22

- Full `npm test`: 1,080 passed, one skipped, zero failed (1,081 total). The final focused updater/lifecycle run passed all 17 tests (10 updater, 7 lifecycle), including GUI polling/action-race and cancellation-I/O coverage, 6 Python archive/publication/recovery tests, and 6 desktop installer tests.
- `npm run smoke:electron`: passed existing onboarding, renderer isolation, navigation, feedback, editor/save and close-guard checks.
- `npm run smoke:desktop`: passed normal/background lifecycle, save-blocked quit, close/reopen, parent crash and recovery with the signed internal host.
- `npm run desktop:pack`: passed native build reuse, local signing and signature verification on Apple Silicon.
- `npm run cli:pack`: passed; 179 required distribution resources verified, including the updater and Electron lockfile, with nested node_modules excluded.
- Disposable installed GUI scenarios passed using immutable local release assets: coordinated 0.3.3 → 0.3.4 update; pinned CLI app-only update (app/runtime 0.3.4, CLI 0.3.3); failed relaunch with automatic restoration of both old components; helper killed after publication followed by recovery through the GUI; app killed before handoff with unchanged installation.
- The final successful flow imports production code from the installed ASAR and verifies that the new ASAR retains every next-update helper, including `update-transaction.py` (the packager previously excluded all Python files). It also exercises sidebar/native menu equivalence, sandbox/IPC rejection, preparation cancellation, restart deferral, failed-save and unresponsive registered tabs. The runner checks preserved canonical Markdown, CLI targets, agent settings, login preference, control key and source/ref policy, plus actual CLI execution/version.
- Screenshots and machine-readable results: `.local-pack/update-smoke/<mode>/`. Test commands: `node scripts/desktop-update-smoke.mjs [success|app-only|relaunch-failure|helper-crash|app-crash]`; `npm run smoke:desktop-update` builds then runs success. Fixture homes are isolated and removed after success; failures retain evidence.

## Follow-up: compact update screen — 2026-10-22

- [x] Replace the verbose introduction and component table with one status heading, compact app version transition, short contextual hint, and relevant actions in a 480 × 360 window.
- [x] Move component versions, CLI policy, release notes, logs, and prerequisites into Details. Full status remains available on hover; Details supports keyboard activation. Keep app-only scope and version mismatches visible, and automatically expand failure explanations once per failed-state transition.
- [x] Verify: all 17 updater/lifecycle tests pass. Real Electron renderer smoke passes idle/checking/current/available/preparing/ready/updating/success/recovered states in light/dark themes, compact sizing, app-only choice, keyboard disclosure, literal release-note rendering, and recovery controls. Inspected screenshots in `.local-pack/update-ui/`. No installer or release operation was run for this UI follow-up.

## Explicit distribution and device limits

- Fixture versions describe locally built immutable test artifacts, not an update of the user's installed app or a newly published GitHub release. A live public old→next release upgrade requires a later release containing this capability; publication was not requested.
- Public signing/notarization, Intel hardware, physical login/logout and arbitrary historical Keychain signing identities remain separate manual gates. Existing Keychain identities/references are preserved; an ad-hoc signature change may still require explicit credential repair in Settings.
- Unknown/stale foreign locks and externally changed recovery identities fail closed with repair guidance. Recovery folders are retained; deleting them is an explicit user maintenance action.
- Other concurrent editor/docs/RAM-budget work in the checkout is outside this task and must not be included in its commit.

## Implementation map

`integrations/electron/{updater,update-release,update-policy,update-worker,update-window}.mjs`, `update-transaction.py`, `update-preload.cjs`, `update-renderer.js`, `update.html`, `update.css`, and `.npmignore`; application/window/lifecycle/desktop-host wiring; desktop installer lock; distribution manifest. Regression tests: `test/desktop-updater.test.js`, `test_update_transaction.py`, `test_desktop_install.py`, and the disposable `scripts/desktop-update-smoke.mjs` runner with excluded Electron smoke entrypoints. Owning/install/FAQ/release docs describe the supported GUI path and developer CLI path.

## Goal

Let a person update jumpyBrain from the Mac app without opening Terminal or managing a checkout. One GUI action updates the Mac app, its bundled runtime, and the existing managed CLI to the same published release, with background preparation, visible progress, safe restart, and recovery on failure.

## User direction

- Put an accessible update action in the sidebar or app Settings, reachable from the sidebar. The native Update menu item should invoke the same flow.
- A terminal update command remains useful for developers and CLI-only users; it is not the normal Mac app update experience.
- Updating through the Mac app should also update the CLI along the way, without separate commands or repeated routine confirmations.
- Preserve local Markdown, selected brains, connection credentials, agent integrations, and CLI target configuration.

## Starting evidence (before implementation)

- `integrations/electron/application.mjs` currently handles **Update jumpyBrain…** by showing instructions to pull a checkout, quit, and run `npm run desktop:setup`. It performs no update.
- The current shared browser/sidebar has no desktop update control. The Electron editor intentionally has no general renderer filesystem or process bridge.
- `scripts/setup-desktop.mjs` builds and installs the app, but reuses an existing CLI without updating it. The app bundles a separate copy of the same runtime; updating the CLI alone leaves that bundle unchanged.
- The older standalone companion has `update-check.mjs` and `menu-update.mjs`: bounded availability checks and a background handoff that survives runtime replacement. Inspect and reuse suitable ownership, logging, and recovery mechanisms; its legacy installation path does not already update the unified app.
- `scripts/release.mjs` now publishes a tagged GitHub release with matching root/Electron versions and a CLI/runtime source tarball. There is no published portable signed/notarized Mac binary. GUI installation must handle the actual available artifacts rather than assume an Electron auto-update feed exists.
- Related scope: [portable installation](tasks-portable-installation-project-integration.md), [unified Mac app](../done/2026-10-18_tasks-unified-macos-app.md), and [release policy](../../docs/releases.md).

## Acceptance criteria

- From the installed app, the user can check for updates, see installed/available versions and release notes, and start an update without a shell, GitHub login, or development checkout for the supported public distribution.
- The UI shows checking, up-to-date, preparing, ready-to-restart, updating, success, and actionable failure states. Background preparation keeps the editor usable; installation waits for a safe save/close boundary. The user can defer restart.
- The sidebar/Settings and native menu use one updater operation. Repeated clicks or concurrent CLI/app updates cannot start competing installation jobs.
- One selected immutable release supplies the Mac app, bundled runtime, and supported managed CLI. Checking for updates must include the product's published 0.x beta releases rather than relying on a stable-only “latest release” endpoint; drafts and arbitrary branch HEAD are not releases.
- An existing owned CLI is updated as part of the GUI operation. Custom, pinned, missing, or unmanaged CLI installations receive an explicit supported outcome; never silently replace a foreign installation or change a development source/ref. Explain any required choice within the GUI.
- Canonical Markdown, brain selection, credentials, CLI targets, and agent integration settings survive. No indexing, memory writes, agent retargeting, or updates to independently hosted servers are implicit side effects.
- Pending/failed saves, unresponsive editor tabs, or a canceled close prevent replacement. An external updater survives app shutdown and reopens the updated app only after installation and readiness checks succeed.
- Interrupted downloads, failed builds/verification, insufficient disk space, failed publication, or failed relaunch preserve a recoverable working installation. Report each component's actual version; never show complete success when only the CLI or app updated.
- A fresh supported installation can receive its next release entirely through the GUI. Missing prerequisites have actionable GUI guidance; normal success does not end by telling the user to run commands.

## Relevant files

- `integrations/electron/{application,lifecycle,desktop-host,window}.mjs`, `electron.docs.md` — app UI, narrow native capability, save/quit flow, host ownership.
- `integrations/electron/{install.mjs,desktop-install.py,login.mjs}` — bundle publication, rollback, migration, login preservation.
- `integrations/macos-companion/{update-check,menu-update,switch-coordinator,gateway}.mjs`, `gateway.docs.md`, `lifecycle.py` — existing background handoff, admission/save barriers, and installation locks.
- `scripts/{setup-desktop,public-install,install-local-cli,release}.mjs`, `src/cli/update.ts` — setup, managed CLI update, release artifacts/provenance.
- `src/adapters/http-server/{notes-browser,companion-browser}.ts`, `browser.docs.md` — sidebar/Settings integration and host availability fencing.
- `test/{desktop-lifecycle,macos-companion-gateway,release-policy}.test.js`, `integrations/electron/test_desktop_install.py`, `scripts/{electron,unified-desktop}-smoke.mjs` — regression and disposable installed-app verification.
- `docs/{install,install-for-agents,faq,releases}.md`, `integrations/electron/README.md` — user guidance and distribution contract.

## Tasks

- [x] 1.0 Define the smallest supported update contract.
  - [x] 1.1 Read architecture and owning docs; map reusable legacy updater/installer mechanisms and the unified-app gaps.
  - [x] 1.2 Choose release discovery, immutable artifact/provenance verification, and the initial distribution path: background build with existing prerequisites or published native artifacts. Record signing/notarization and hardware limits honestly; do not make either approach an assumed prerequisite without evidence.
  - [x] 1.3 Define coordinated app/CLI staging, commit order, locks, rollback, and restart recovery. Specify missing/custom/pinned CLI handling and beta-release selection without silently switching installation policy.
- [x] 2.0 Implement the GUI entry and bounded update state.
  - [x] 2.1 Add sidebar/Settings availability, installed/available versions, release notes, progress, retry, and restart deferral; wire the native menu to the same operation.
  - [x] 2.2 Expose only an authenticated desktop update capability. Ordinary hosted/browser sessions cannot execute local commands; renderer-provided shell commands, arbitrary sources, or paths are not accepted.
- [x] 3.0 Stage and apply one release in the background.
  - [x] 3.1 Prepare validated app and CLI updates outside replacement directories, with cancellation before installation, bounded private logs, and duplicate-job exclusion.
  - [x] 3.2 Reuse the all-tab save/quit barrier and owned-process checks; hand off installation to a helper that survives app/CLI replacement without opening Terminal.
  - [x] 3.3 Apply the coordinated update, retain rollback/recovery evidence, restore prior working components on failure where supported, and verify versions/readiness before reporting success or reopening.
- [x] 4.0 Verify the complete experience and document it.
  - [x] 4.1 Test current/newer/beta releases, offline/rate-limited checks, invalid artifacts, missing prerequisites, custom/pinned/no CLI, repeated clicks, and concurrent updater exclusion.
  - [x] 4.2 Test dirty/failed drafts, multiple editor tabs, cancellation, app/CLI replacement failures, helper/app crashes, interrupted updates, rollback, login/Keychain preservation, and accurate partial outcomes using disposable installations.
  - [x] 4.3 Exercise an installed old-to-new release upgrade through the actual GUI; verify relaunch, matching component versions, CLI operation, and unchanged memory/configuration. Keep physical OS/signing gates explicit.
  - [x] 4.4 Update owning docs and installation guidance to make GUI updates the Mac default, retaining the CLI developer workflow. Record measured verification and limitations here; add a changelog highlight when the capability ships.
