# GUI updates for the Mac app and CLI

Status: paused at the user's request on 2026-10-22. Implementation was authorized and a work-in-progress checkpoint is present; this capability is **not ready to release**. No installed-machine update or release publication was performed.

## Resume checkpoint — 2026-10-22

The user requested end-to-end implementation and testing, then asked to stop at a checkpoint. Resume this task rather than treating the current implementation as complete. Preserve the substantial unrelated changes already in the working tree (feedback, sidebar/editor, graph, recent notes, docs and changelog).

### Implemented so far

- Public GitHub release discovery includes numeric 0.x beta releases, excludes drafts/branch HEAD, selects one asset, and requires its exact size and GitHub SHA-256 digest. Public API observation: v0.3.4/v0.3.3/v0.3.2 have digest-bearing tarballs. No account/token needed.
- New Electron updater modules cover CLI ownership/source/ref policy, private background staging, a shared `.installer-lock`, digest verification, bounded download/log handling, native preparation, an external helper, and write-ahead component exchange/recovery journals.
- macOS atomic exchanges keep both old and new components present. Recovery uses recorded filesystem identities and is repeatable if recovery itself is interrupted. Previous app/CLI/manifest remain in the private update workspace.
- Native menu and an Electron-only sidebar Updates button open one sandboxed update window. Its IPC accepts fixed action names only from that window's main frame. Ordinary browser/hosted sessions receive no updater capability.
- The existing all-tab quit/save barrier has a `beforeStop` handoff after lease commit. A failed save, close veto, or missing helper acknowledgement blocks replacement.
- Custom/pinned/missing/unmanaged CLI cases explicitly offer app-only updating; a recognized default managed CLI is coordinated with the app. No source/ref retargeting, agent setup or index command is added.
- Package validation now requires updater/Desktop resources. `integrations/electron/.npmignore` excludes nested dependencies and test fixtures; the observed dry-run package was about 2.7 MB, with its Electron lockfile and no nested node_modules.

### Measured checks

- `npm run build` passed (editor 160,261 bytes gzip in this working tree).
- `node --test test/desktop-updater.test.js` passed all 6 tests, including its 4 Python archive/transaction tests. Coverage: beta selection, malformed/rate-limited/offline release responses, digest failures, CLI ownership cases, duplicate check calls, installer lock refusal, handoff ordering, archive traversal/link/device/duplicate rejection, interruption at each exchange, recovery interruption, and foreign-path refusal.
- `test/desktop-lifecycle.test.js` passed all 7 tests, including the existing native installer migration/rollback checks.
- The focused packaging test run passed its packaging tests; the initial two updater fixture failures were corrected by resolving macOS's temporary-directory symlink, then all 6 updater tests passed.
- `node --check` passed for `updater.mjs` and `update-worker.mjs` before the last checkpoint edits; rerun final checks when resuming.
- Full `npm test` was started with output at `/tmp/jb-gui-update-tests.log`, but stopped with its children on the user's pause request. **No complete-suite pass is claimed.**
- No production GUI upgrade, Electron updater UI smoke, packaged updater build, relaunch, or real release-to-release upgrade has yet been exercised. No changes to the user's installed app/CLI/configuration were made.

### Resume here / known review gaps

1. Review the unfinished implementation before running it against anything except disposable homes. In particular audit worker ownership/status races, abandoned-lock reclamation, recovery/error presentation, cancellation after handoff, subprocess cleanup, and publication/relaunch failure paths.
2. `update-worker.mjs` currently checks relaunch using any authenticated gateway `hostInstance`; strengthen proof that readiness belongs to the newly launched app, and confirm each component's actual version before claiming success. Test failed relaunch and rollback with owned-process/native-lock checks.
3. Check that native prerequisites/configuration normalization match `desktop-install.py` in an actual staged build; ensure the copied helper has everything it needs outside both replacement trees. Prove that readiness probes cannot implicitly index or alter canonical memory/settings.
4. Add disposable installed-app GUI tests for sidebar/menu entry, sandbox/IPC fencing, multiple tabs, dirty/failed/unresponsive drafts, restart deferral/cancellation, helper/app crashes, disk/build/publication failure, CLI/app partial outcomes, login and Keychain/config preservation. Test actual npm artifact extraction/build rather than only source fixtures.
5. Add a disposable old-to-new GUI upgrade runner using immutable local release fixtures. A live published upgrade requires a subsequent release containing these updater resources; do not publish or update the user's installation merely to satisfy the test. Record that distinction and physical OS/signing limits honestly.
6. Finish the supported contract and owning docs (`electron.docs.md` still says no automatic updater), installation/FAQ/release guidance, and fresh-install next-release compatibility. No source-module or release-policy docs were updated yet.
7. Run the focused tests, full `npm test`, package validation, and existing Electron/unified-desktop smoke workflows after corrections. Update acceptance checkboxes only with evidence. Do not archive or mark shipped yet.

New implementation files: `integrations/electron/{updater,update-release,update-policy,update-worker,update-window}.mjs`, `update-transaction.py`, `update-preload.cjs`, `update-renderer.js`, `update.html`, `update.css`, `.npmignore`. Tests: `test/desktop-updater.test.js` and `integrations/electron/test_update_transaction.py`. Existing changes: Electron application/window/lifecycle wiring and `scripts/local-pack-manifest.mjs`.

## Goal

Let a person update jumpyBrain from the Mac app without opening Terminal or managing a checkout. One GUI action updates the Mac app, its bundled runtime, and the existing managed CLI to the same published release, with background preparation, visible progress, safe restart, and recovery on failure.

## User direction

- Put an accessible update action in the sidebar or app Settings, reachable from the sidebar. The native Update menu item should invoke the same flow.
- A terminal update command remains useful for developers and CLI-only users; it is not the normal Mac app update experience.
- Updating through the Mac app should also update the CLI along the way, without separate commands or repeated routine confirmations.
- Preserve local Markdown, selected brains, connection credentials, agent integrations, and CLI target configuration.

## Current evidence

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

- [/] 1.0 Define the smallest supported update contract.
  - [x] 1.1 Read architecture and owning docs; map reusable legacy updater/installer mechanisms and the unified-app gaps.
  - [/] 1.2 Choose release discovery, immutable artifact/provenance verification, and the initial distribution path: background build with existing prerequisites or published native artifacts. Record signing/notarization and hardware limits honestly; do not make either approach an assumed prerequisite without evidence.
  - [/] 1.3 Define coordinated app/CLI staging, commit order, locks, rollback, and restart recovery. Specify missing/custom/pinned CLI handling and beta-release selection without silently switching installation policy.
- [/] 2.0 Implement the GUI entry and bounded update state.
  - [/] 2.1 Add sidebar/Settings availability, installed/available versions, release notes, progress, retry, and restart deferral; wire the native menu to the same operation.
  - [/] 2.2 Expose only an authenticated desktop update capability. Ordinary hosted/browser sessions cannot execute local commands; renderer-provided shell commands, arbitrary sources, or paths are not accepted.
- [/] 3.0 Stage and apply one release in the background.
  - [/] 3.1 Prepare validated app and CLI updates outside replacement directories, with cancellation before installation, bounded private logs, and duplicate-job exclusion.
  - [/] 3.2 Reuse the all-tab save/quit barrier and owned-process checks; hand off installation to a helper that survives app/CLI replacement without opening Terminal.
  - [/] 3.3 Apply the coordinated update, retain rollback/recovery evidence, restore prior working components on failure where supported, and verify versions/readiness before reporting success or reopening.
- [/] 4.0 Verify the complete experience and document it.
  - [/] 4.1 Test current/newer/beta releases, offline/rate-limited checks, invalid artifacts, missing prerequisites, custom/pinned/no CLI, repeated clicks, and concurrent updater exclusion.
  - [/] 4.2 Test dirty/failed drafts, multiple editor tabs, cancellation, app/CLI replacement failures, helper/app crashes, interrupted updates, rollback, login/Keychain preservation, and accurate partial outcomes using disposable installations.
  - [ ] 4.3 Exercise an installed old-to-new release upgrade through the actual GUI; verify relaunch, matching component versions, CLI operation, and unchanged memory/configuration. Keep physical OS/signing gates explicit.
  - [ ] 4.4 Update owning docs and installation guidance to make GUI updates the Mac default, retaining the CLI developer workflow. Record measured verification and limitations here; add a changelog highlight when the capability ships.
