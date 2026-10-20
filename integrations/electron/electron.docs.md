# Unified macOS desktop boundary

## Responsibilities

- `main.mjs` starts `application.mjs`, which owns one Electron app identity, the tray, window/onboarding, login preference, and explicit quit flow. Last-window closure leaves the host running. Background login does not open an editor. Preserve the existing Electron user-data path/partition and first-run marker.
- `desktop-host.mjs` resolves the runtime and internal native helper relative to the current app resources, starts only its own child, and authenticates readiness using a fresh instance identifier as well as the private control capability. Refuse occupied/foreign services. Stop only the owned child; the native parent watchdog and gateway watchdog clean up descendants after a parent crash.
- The internal `native/jumpyBrain Host.app` uses the existing Swift Keychain/folder/RPC code in `--desktop-host` mode, with no separate menu, update flow, or login registration. It holds the established companion lock and starts the bundled runtime. Keep Keychain service/reference identity; ad-hoc signature changes can still require explicit credential repair.
- `lifecycle.mjs` prepares all-tab shutdown through the gateway's existing save barrier before closing windows, flushing diagnostics, and stopping the host. Failed saves, missing acknowledgements, or unload cancellation leave the app running. Cancel releases the freeze without changing brain or generation; a bounded lease recovers a lost shutdown response.
- `login.mjs` owns one guarded LaunchAgent for the installed Electron executable with `--background`. Toggling affects the next login and never unloads the running app.
- `window.mjs` keeps the sandboxed editor with no preload/Node bridge, same-origin navigation, bounded feedback download, and default-preserve draft close protection. Application menu actions reopen the window when needed.
- `onboarding.mjs`/`setup.mjs` retain the isolated welcome bridge, native-selected folder validation, explicit local creation, and existing connection save barrier. Neither retargets the CLI nor authorizes remote writes implicitly.
- `diagnostics.mjs` retains private bounded host/renderer evidence and submits safe events through the authenticated gateway. Raw errors/URLs/credentials never enter support exports.
- `install.mjs` packages Electron, compiled runtime/editor, native helper, and icon as one locally signed `jumpyBrain.app`. `desktop-install.py` composes native compilation and rollback installation, validates legacy ownership, checks processes and the native lock, preserves app data and login preference, and backs up older owned app bundles. `scripts/setup-desktop.mjs` builds the complete app; it provisions a missing CLI/QMD installation but does not update an existing CLI.
- `smoke-*.mjs` are excluded test entrypoints. Production imports no fixture environment variable. `application.mjs` accepts explicit main-process options so lifecycle tests can use disposable resources and user data.

## Non-responsibilities

No alternate memory engine/editor, implicit sync or remote writes, CLI/agent retargeting, public signing/notarization, automatic updater, or crash-persistent drafts. External Node/QMD remain prerequisites. The bundled runtime is the same app code with its own release lifecycle; CLI-only installation does not need Electron or a Mac app.

The native companion sources remain available for internal hosting and legacy migration/maintenance. Their standalone installer is not the new user-facing Mac setup path. Current packaging supports the private per-user installation; global/custom legacy locations require explicit migration.
