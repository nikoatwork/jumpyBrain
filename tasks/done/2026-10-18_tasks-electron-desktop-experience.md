# Desktop experience

**Finalized 2026-10-18 — superseded.** Completed desktop onboarding and branding; superseded by the unified macOS app. Historical verification is retained. Archived with user approval. Verification below is historical; no implementation checks were rerun for this archival pass.

> Superseded on 2026-10-16 by the [unified macOS app](2026-10-18_tasks-unified-macos-app.md). Historical implementation/verification below is retained; current trials should use the single `jumpyBrain.app`.


## Goal

Make the macOS Electron app pleasant to install and launch from a private Git checkout, with a branded icon and local-first onboarding where the user chooses the Markdown folder. Preserve existing working-tree changes and the companion's save/connection boundaries.

## Decisions

- Ship as `jumpyBrain Desktop.app`, alongside the existing `jumpyBrain.app` menu-bar helper; reuse its installed runtime and Keychain gateway.
- Reuse the existing vector brain identity for a crisp Finder/Dock icon.
- First run defaults to local folder selection, with explicit confirmation before initializing an empty folder. Existing initialized brains can be opened; unrelated populated folders are refused.
- Setup UI is packaged, sandboxed, and separate from the editor. Its narrow native bridge accepts no arbitrary filesystem paths, commands, URLs, or credentials.
- Private Git installation builds locally with existing Node/QMD/Swift prerequisites. Signing/notarization and automatic updates are separate future distribution work.

## Tasks

- [x] Refine the menu-bar brain to a monochrome outline and show the same mark at the interface’s top right.

- [x] Match the native menu-bar icon to the desktop brain, retaining an offline warning badge.

- [x] Add native first-run onboarding, folder validation/initialization, and guarded profile activation.
- [x] Add branded app icon, native identity/menu polish, and reproducible packaging.
- [x] Add private-checkout setup command and installation/recovery documentation.
- [x] Verify disposable first-run/relaunch/error cases, existing editor smoke, packaging/signature, and record limitations.

## Verification so far

- `npm run build` passed. The initial invocation collided with another workspace rebuild (`ENOTEMPTY` removing derived `dist`); the sequential rerun succeeded.
- All 63 focused host/setup/connection/gateway/browser regressions passed sequentially. Setup coverage uses real public runtime initialization and a production gateway, including a live-tab acknowledgement barrier.
- `npm run smoke:electron` passed with disposable Markdown: packaged welcome/preload, canceled picker, rejected populated folder, explicit local creation, continued connection, prerequisite recovery, editor authentication/isolation, feedback, native Settings, graph, editing/autosave, keep/discard close, and tab cleanup.
- Fixed the smoke host's last-window exit during multi-window onboarding coverage; production now stays available for normal macOS Dock reactivation.
- Packaged arm64 Electron 44.8.0 with a verified ad-hoc signature; verified the packaged ICNS exactly matches the committed custom icon. Installed `~/Applications/jumpyBrain Desktop.app` alongside existing apps without replacing them.
- Welcome screenshot: `.local-pack/desktop/welcome.png` (ignored local artifact).
- All 33 installer regressions passed after excluding nested Electron `node_modules` from local runtime source copies. `git diff --check` passed.
- The broad `node --test` run stopped making progress in HTTP tests for over two minutes; stopped only that run and its own subprocesses. No full-suite pass is claimed. Concurrent diagnostics/browser work remains outside this task's changes.
- Launched the installed production bundle, verified Welcome through native accessibility, opened the real macOS folder picker and canceled it, leaving the app on Welcome. Packaged production modules match workspace source.
- Actual fresh-machine prerequisite/download setup, Intel hardware, Developer ID signing/notarization, and agent-specific folder configuration remain separate checks. No personal/remote memory was created or changed by verification.

## User trial

Implementation and local installation are complete. At implementation time, this list was retained for first-run feedback and no archive or commit was attempted because the shared working tree contained concurrent changes. It is now archived as superseded; current feedback belongs to the unified app.


## Menu-bar icon follow-up

- The menu-bar helper now loads the same pink brain artwork as Desktop at 18 points, preserving color with a small orange badge for unavailable/starting states. Tooltip/menu health information remains intact.
- Both current workspace Swift and an icon-only patch against the installed native source compiled and signed successfully. All 50 native build/update regressions passed; packaged artwork matches the Desktop PNG byte for byte.
- Installed the icon-only helper update with existing ownership/singleton locks and rollback packaging. Preserved configuration, runtime/backend version, connections, credentials, login preference, and Markdown. Updated only corresponding native icon source/resources in the managed runtime for future rebuilds; concurrent diagnostics changes were not deployed.
- Closed the clean Desktop Home window before refreshing the helper, then reopened Desktop and verified `Local brain · connected`. Native menu-bar-only apps could not be inspected through CUA (accessibility timeout); no direct menu-bar screenshot is claimed. Previous bundle/source copies remain in ignored `.local-pack/menubar/` for recovery.


## Outline refinement

- User clarified that the menu-bar icon should retain a black/white outline, using the Electron brain contours. Replaced the colored tile/badge with a transparent 18-point AppKit template image; system appearance supplies black/white rendering. Health remains in the tooltip/menu text.
- Added the same outlined mark to the shared interface’s top-right workspace toolbar, adapting to the current theme and staying visible on Home, notes, Graph, Settings, collapsed sidebar, and narrow layouts.
- Build and 17 companion-browser regressions passed. Disposable Chromium checks passed for Home/Graph, light/dark, collapsed sidebar, 390px width, no horizontal overflow, and no page errors. Preview screenshots are in ignored `.local-pack/outline/`.
- Compiled/signed and installed a minimal update against the existing managed runtime: native icon plus two browser presentation modules. Preserved the existing backend, editor bundle, configuration, credentials, and Markdown. Backups remain in `.local-pack/outline/`.
- Reopened the desktop window with a fresh companion session and verified the new `jumpyBrain` image in the toolbar alongside `Local brain · connected`. An already-fenced Chrome Home tab was inspected only; no pending draft was present or discarded.
