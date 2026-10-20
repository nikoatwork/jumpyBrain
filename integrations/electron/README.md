# jumpyBrain for macOS

One Mac app contains the Electron editor, menu-bar controls, local gateway, shared memory runtime, and an internal native Keychain helper. Closing its window leaves your brain live in the menu bar. **Open jumpyBrain**, the Dock, or **⌘N** reopens the editor. **Quit jumpyBrain** stops the app and its owned local services after open editors confirm their saves.

The CLI is independently installable and usable on macOS or Linux. It needs neither Electron nor the Mac app. App folder selection does not change CLI or agent targets; pass `--root "/path/to/brain"` or configure the agent's memory skill to share that folder.

## Install or update from a private Git checkout

Requires macOS 13+, Node 22.12+ and npm, Git, Python 3.9+, Xcode command-line tools, and QMD 2.8.3. Git uses your existing repository authentication.

```sh
git clone git@github.com:nikoatwork/jumpyBrain.git
cd jumpyBrain
npm run desktop:setup
open "$HOME/Applications/jumpyBrain.app"
```

For updates, select/pull the desired revision in the checkout, **Quit jumpyBrain**, and rerun `npm run desktop:setup`. Setup builds the editor/runtime and complete Mac bundle together. The menu's **Update jumpyBrain…** explains this flow. There is no automatic download/updater or signed/notarized distribution yet.

Fresh setup provisions the CLI and external Node/QMD prerequisites through the existing installer without agent integrations or an initial index. Existing CLI installations and targets are retained. The Mac app bundles its own compiled copy of the same runtime, so CLI updates and app updates are independent. The checkout is unnecessary for launching the installed app; external Node and QMD must remain available.

## Migration from the two-app beta

Quit the older menu-bar helper and Desktop/Electron windows after saving. Setup replaces `~/Applications/jumpyBrain.app` with the unified app and moves owned `jumpyBrain Desktop.app` and `jumpyBrain Electron.app` bundles into a dated recovery archive under `~/Library/Application Support/jumpyBrain Backups`. It refuses unrelated apps, active processes, or a held native service lock.

Connections, control capability, logs, and diagnostics stay in `~/Library/Application Support/jumpyBrain Companion`. Electron preferences and first-run completion retain `~/Library/Application Support/jumpyBrain Electron Prototype`. Markdown stays in its chosen folders. The existing login preference migrates to one `local.jumpybrain.desktop.plist` LaunchAgent; a fresh install defaults to off. Login starts the menu bar and services without opening a window.

Keychain service names and credential references are retained. Local ad-hoc signing can change Keychain access eligibility; if Settings reports Keychain unavailable, explicitly repair that connection's key there. No credential is copied into files or the renderer, and no broad Keychain access permission is added.

A failed installation rolls back moved app/login files and leaves a previously running app untouched. Backups are retained after successful publication. For manual rollback, quit the new app, preserve its bundle, restore the previous bundles and login plist from the dated `.tar.gz` backup, and reopen the older app. Do not run both generations together. Custom/global `/Applications` legacy installs require separate migration; setup manages `~/Applications`.

## First launch and everyday use

1. Choose an empty folder for a new brain or an existing initialized brain.
2. Confirm **Create my local brain** or **Open my local brain**. Unrelated populated folders are refused.
3. **Continue with …** retains an existing selected connection. Remote destinations remain explicitly labeled.

Settings (**⌘,**) manages local/remote profiles. Remote writes and indexing require explicit approval for that destination. Switching and quitting use the same all-tab save barrier: failed saves or unresponsive registered browser tabs keep the app running. Wake those tabs and resolve their drafts, or close them using their normal discard confirmation, then retry Quit.

Closing a window retains its pending-draft confirmation and keeps the services running. Quitting stops only the app's own gateway/local engine; separately running shared servers and the CLI remain independent. App-hosted endpoints are unavailable after quit. Crash recovery restarts the services on the next launch, but unsaved renderer-only drafts are not crash-persistent.

**Start at Login** controls the next login. **Show Logs** reveals the private service log. An occupied/unauthenticated port is an error; the app never adopts another process. If its service stopped, reopen the app window to retry startup; existing drafts still require explicit recovery across a restarted session.

## Development and verification

```sh
npm run build
npm --prefix integrations/electron ci
npm run desktop:pack
npm run electron
```

`desktop:pack` writes `.local-pack/desktop/jumpyBrain.app`, including its runtime and internal host. Development Electron uses those resources. `npm run electron:install:local` packages and installs a stopped app from the current compiled runtime; use `desktop:setup` for the full build/update flow.

```sh
node --test test/desktop-lifecycle.test.js test/electron-host.test.js test/electron-setup.test.js test/macos-companion-gateway.test.js
python3 -B integrations/electron/test_desktop_install.py
npm run smoke:electron
npm run smoke:desktop
```

Tests use disposable memory. The desktop smoke runs the production application lifecycle and signed internal host through background launch, blocked quit, close/reopen, explicit quit, parent crash, and recovery. Native Keychain/RPC coverage remains in `integrations/macos-companion/test_connections_native.py`. Public signing/notarization, Intel hardware, physical login/logout, and arbitrary historical Keychain signing identities need separate validation.

To remove the Mac app, disable **Start at Login**, quit, and move `~/Applications/jumpyBrain.app` to Trash. Brain folders, profiles, Keychain items, backups, and the separately installed CLI remain in place.
