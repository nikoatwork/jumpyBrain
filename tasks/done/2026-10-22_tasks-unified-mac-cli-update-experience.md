# One update for the Mac app and CLI

Status: completed and archived 2026-10-22. Implementation and verification are recorded below; see the combined sidebar/attention coordination archive for integration evidence.

## Goal

Updating from either the Mac app or `jumpybrain update` keeps the installed Mac app, bundled runtime and managed CLI on the same release. Make the normal Mac experience one inline button: Update → background preparation → Restart.

## Context and decisions

- Parallel ownership, 2026-10-22: this list owns shared updater/backend/CLI orchestration. Normal-flow presentation now belongs to [Inline desktop update icon](2026-10-22_tasks-inline-desktop-update-control.md), under [sidebar/attention coordination](2026-10-22_tasks-sidebar-attention-refresh.md). Preserve existing worker/transaction recovery. Backend owns updater/worker/policy/lifecycle and CLI paths; the interface track owns `window.mjs` and presentation wiring. Agree shared `application.mjs` hunks before editing; do not revert concurrent changes.
- Updated visual direction: the normal primary control is an icon (download → progress → relaunch), with accessible status names. `ready` means prepared, not installed; the existing transaction publishes after shutdown. Do not report installation before actual version/startup verification.
- User direction, 2026-10-22: no separate update popup or version comparison in the normal flow. A quiet version label may live at the bottom of the app or in About.
- Follow-up to [the implemented GUI updater](2026-10-22_tasks-gui-app-and-cli-updates.md), not a replacement of its working transaction/recovery machinery. In v0.3.5, Mac updates already include a supported managed CLI; the ordinary CLI updater still follows a separate installer/source path and can leave the unified Mac app behind.
- This session started with app/runtime 0.3.3 and CLI 0.3.4. Getting all three to 0.3.5 required a CLI update plus a separate desktop bootstrap. The old app lacked the new updater; document that migration without treating it as the normal future flow.
- The editor stays usable during download/build. Restart is explicit and waits for all-tab saves; preparation alone must not leave active components on different versions. CLI-only installations stay CLI-only. Preserve custom/pinned/unowned installations and source/ref policy through an explicit exception, not silent replacement.

## Tasks

- [x] 1.0 Share one update operation between both entry points.
  - [x] 1.1 Map the existing GUI worker, CLI installer, release selection, locks and save/restart barriers. Choose the smallest shared orchestration seam; reuse the existing transaction and recovery code.
  - [x] 1.2 Define one immutable target release for a standard paired Mac installation. Reconcile the GUI's published-release selection with the CLI's recorded source/ref behavior; keep explicit developer/pinned policies intact.
  - [x] 1.3 Route ordinary CLI updates for an existing managed Mac installation through the coordinated operation. While the app is open, stage both components and expose Restart in the app; report prepared/restart-needed rather than success. When closed, apply both without requiring a separate desktop setup command.
  - [x] 1.4 Prevent either entry point from reporting completion until installed app/runtime/CLI versions agree and startup succeeds. Keep preparation, failure and deliberate app-only exceptions explicit; preserve existing rollback, concurrent-job exclusion and no-downgrade behavior.
- [x] 2.0 Support the separately owned [inline update icon](2026-10-22_tasks-inline-desktop-update-control.md).
  - [x] 2.1 Freeze a read-only snapshot/fixed-action contract for available, preparing, ready, updating, verified success, failures and recovery. Include authoritative action availability and exceptional CLI scope. Give the interface track fixtures early.
  - [x] 2.2 Retain one operation across sidebar/native menu/CLI triggers; prevent competing jobs and out-of-order status/action races. Keep editing available during preparation, explicit restart deferral and the all-tab save barrier.
  - [x] 2.3 Expose no generic renderer command/path/URL capability. Coordinate the authenticated desktop-only seam with the interface track; ordinary hosted sessions cannot install software.
  - [x] 2.4 Integrate the icon consumer and verify prepared versus installed truthfully. The interface task list owns visual state, popup removal and on-demand details; avoid implementing a duplicate UI here.
- [x] 3.0 Verify and document the supported experience.
  - [x] 3.1 Exercise both GUI→paired update and CLI→paired update on disposable installations. Check working while preparing, explicit restart, matching versions, failed-save blocking and unchanged Markdown/settings. Reuse one fixture and existing focused recovery regressions instead of inventing another broad release suite.
  - [x] 3.2 Cover CLI-only, custom/pinned CLI, concurrent attempts and recovery at the shared seam. Inspect the inline control by keyboard and in both themes; retain deeper fault testing as an explicit option under [lean beta releases](../../docs/lean-beta-releases.md).
  - [x] 3.3 Update install/update guidance and owning module docs. Explain the one-time old-app bootstrap separately. Record results and remaining limits here; add a user-facing pending release note when implemented.

## Acceptance

- A normal user clicks Update, keeps working, then clicks Restart and returns to the same brain. No separate update window or version choice is required.
- Either supported update entry point brings an existing paired Mac installation to one release; no second CLI or desktop setup command is needed.
- A prepared update is not reported as installed. Exceptions remain visible without changing foreign/pinned installs, notes, selected brains, credentials or agent targets.

## Relevant files

- `integrations/electron/{updater,update-worker,update-policy,update-release,update-transaction,application,lifecycle,window,update-window,update-renderer}.*`, `electron.docs.md` — current orchestration, transaction and native UI.
- `src/cli/update.ts`, `scripts/{public-install,setup-desktop,macos-companion}.mjs` — CLI/source update and bootstrap paths.
- `src/adapters/http-server/{notes-browser,browser-design-system,companion-browser}.ts`, `browser.docs.md` — inline presentation and shared browser boundary.
- `test/desktop-updater.test.js`, `scripts/desktop-update-smoke.mjs`, `docs/{install,install-for-agents,releases}.md` — existing coverage and supported workflows.

## Implementation and verification — 2026-10-22

- Preserved the transferred in-flight transaction/worker work and finished its native operation, paired CLI entry and private same-user `status`/`update` socket. Open-app CLI stages one release and reports prepared/restart-needed. Closed-app CLI uses the same worker transaction through startup verification. CLI-only/legacy installer paths remain supported; custom/pinned pairs fail with explicit app-only guidance.
- Snapshot publishes an authoritative `actions` array for the inline/native consumer. A click downloads the release already offered instead of silently rediscovering a newer target. Constructor-time app versions are not reused after a closed-CLI exchange: the installed bundle is re-read, and CLI success requires matching app/runtime/CLI versions.
- App startup is fenced throughout closed-CLI preparation, including the lock/request interval before the worker writes its first status packet. Existing native installation/process locks remain the final replacement guard. Existing safe shutdown, staged readiness, rollback and authenticated startup verification are preserved.
- Focused native suites: **29 passed** across updater/lifecycle/host/setup, including Python archive and interrupted-exchange recovery regressions. Actual sandboxed inline UI fixture passed both themes, keyboard, capability restrictions, live draft selection and narrow layouts. Electron deps installed only in this worktree; no personal installation was touched.
- Install/update guidance and native owning docs now explain download → preparation → relaunch, explicit app-only policy, paired CLI behavior, and one-time older-app bootstrap. Integrator owns pending release wording.
- Disposable installed GUI/CLI modes all passed as recorded below; live published-release upgrade, Intel, notarization and historical Keychain-signature gates remain outside this fixture coverage.

### Disposable installed result

- Tested worktree `feat/sidebar-attention-refresh`, base commit `9606d74ccf60660ea96a6589e7255f39b595989b`, with the uncommitted native/backend changes above and root-built runtime. `npm run desktop:pack` built/signed only `.local-pack/desktop/jumpyBrain.app`; it did not install it.
- `node scripts/desktop-update-smoke.mjs success`, `cli-open` and `cli-closed`: **all passed**. Each archives an immutable local release fixture, updates a disposable 0.3.3 app to 0.3.4, authenticates startup and verifies actual app/runtime/managed CLI all report 0.3.4. GUI and open-app CLI modes exercise failed-save blocking before explicit safe relaunch; GUI additionally verifies unresponsive-tab blocking; open CLI reports prepared/not installed. Closed CLI reports installed only after component/startup verification.
- Every mode verifies unchanged canonical Markdown, CLI targets/config, agent integration, login plist and private control key bytes. Artifacts: `.local-pack/update-smoke/{success,cli-open,cli-closed}/result.json`, ready/success screenshots, and `cli-open/cli-output.txt`. Disposable homes and processes were cleaned; no personal install or memory was changed.
- Final inert production Electron shell fixture also covers stale polling completed after a native action and repeated download clicks, preserving the resulting ready state and one operation. Both themes, 390/320px, keyboard and focused unsaved selection passed. Screenshots were inspected after compositor frame flush.
- The initial closed-CLI fixture exposed and fixed a test-only generated arrow-function object syntax error before any installation mutation; its corrected run passed. No live GitHub release, Intel hardware, notarization or historical Keychain identity claims follow from these local fixtures.

## Separate backend verification before integration — 2026-10-22

- Snapshot: working tree based on `9606d74`, including the pre-existing browser design-system work. Preserved unrelated uncommitted work; no release/version bump, personal installation change or memory write.
- `npm run build` passed. Full `node --test`: 1,108 passed, one skipped, zero failures. Subsequent focused suite: 52 passed (updater, legacy/custom-root companion path, desktop lifecycle, and packaging). Final updater regressions: 15 passed, including cross-entry recovery ownership and action availability.
- `scripts/desktop-update-smoke.mjs` modes `success`, `cli-open`, `cli-closed`, `app-only`, and `helper-crash` exercise installed ASAR/native apps, the production worker and atomic transaction against disposable homes and immutable locally served release assets. App/runtime/CLI agree after paired success; app-only preserves the pinned CLI; killed-worker recovery restores and reopens the previous installation. CLI-open output explicitly says prepared/restart-needed; CLI-closed waits for authenticated relaunch. The actual CLI dispatch and dry-run are exercised, with test-only discovery injected outside production for the closed-app asset fixture.
- Protected existing Markdown, CLI configuration, agent integration, login preference and control-key bytes are compared after installation. The GUI fixture also edits/saves a separate note during preparation and compares those saved bytes after restart. Failed-save and unresponsive-tab acknowledgements retain the old installation and ready job; blocked restart feedback is inline.
- `smoke-inline-updates.mjs` passes against the production shell and real sandboxed Electron editor: both themes, keyboard activation, ordinary editing remains enabled, pinned app-only action, literal release notes and rejected action arguments. Screenshots: `.local-pack/update-inline-ui/`. This earlier backend run covered a provisional text consumer; the final icon layout was subsequently completed and verified by the integrated sidebar track.
- Limits: Apple Silicon on this Mac, synthetic 0.3.3 → 0.3.4 release fixtures and synthetic credentials. This is not an actual public-release upgrade, Intel/notarization, Keychain-history, physical-device or assistive-technology claim. Existing deeper recovery scenarios remain optional; no new broad release gate was added.
- Fixture repairs: waited for the relaunched renderer before screenshot capture (the first CLI-open transaction succeeded but its capture raced readiness); corrected a closed-fixture generated object-expression syntax error and used valid `mem_` IDs for the editing check. Passing runs above supersede those fixture failures.

### Final merged updater verification — 2026-10-22

- Combined source updater/lifecycle/host/setup suite: **31 passed**. Actual sandboxed Electron icon UI smoke and artifact-only desktop packaging passed against the final graph/sidebar/attention build.
- Disposable `success`, `app-only` and `helper-crash` modes all passed. Paired success keeps actual app/runtime/CLI at fixture0.3.4; app-only preserves pinned CLI0.3.3 and explicitly reports it unchanged; killed-worker recovery restores/reopens the previous working installation.
- Paired success edited and saved the actual Markdown note while preparation ran and verified those exact saved bytes after relaunch. Failed/unresponsive saves blocked restart with inline feedback and no extra dialog. Protected Markdown/configuration/agent integration/login/private-key hashes stayed unchanged in all three scenarios.
- Evidence: `.local-pack/update-smoke/{success,app-only,helper-crash}/result.json` and `.local-pack/update-inline-ui/`. These are local immutable release fixtures, not a public release or a change to the personal installation.
