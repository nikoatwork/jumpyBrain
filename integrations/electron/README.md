# jumpyBrain for macOS

One Mac app contains the Electron editor, menu-bar controls, local gateway, shared memory runtime, and an internal native Keychain helper. Closing its window leaves your brain live in the menu bar. **Open jumpyBrain**, the Dock, or **⌘N** reopens the editor. **Quit jumpyBrain** stops the app and its owned local services after open editors confirm their saves.

The CLI is independently installable and usable on macOS or Linux. It needs neither Electron nor the Mac app. App folder selection does not change CLI or agent targets; pass `--root "/path/to/brain"` or configure the agent's memory skill to share that folder.

**One brain, two interfaces.** The app and CLI can read and write the same Markdown folder without copying or syncing notes. Local writing/search run on your computer; no jumpyBrain account or remote memory server is required. Installing the app does not upload your brain. See the [privacy FAQ](../../docs/faq.md) for remote connections, cloud assistants, feedback, and file-sync boundaries.

## Install or update from source

Requires macOS 13+, Node 22.12+ and npm, Git, Python 3.9+, Xcode command-line tools, and QMD 2.8.3 (provisioned by fresh setup). The repository is public; an HTTPS clone needs no GitHub login or SSH key.

**Already installed the CLI at its default location?** Quit any running jumpyBrain app and reuse its source:

```sh
cd "$HOME/.jumpybrain/app"
npm run desktop:setup
open "$HOME/Applications/jumpyBrain.app"
```

To check requirements before installing, run `npm run desktop:setup -- --check` from that source directory. It reports missing tools together and changes no installation or settings.

In onboarding, check the suggested folder matches `~/.jumpybrain/memory`, or the actual memory root from your CLI setup, then choose **Open my notes**. Use **Use a different folder…** when needed; press **⌘⇧G** in the chooser to enter a hidden path. No second clone is needed. See the [installation guide](../../docs/install.md#macos-desktop-app-beta) for prerequisite checks and custom-install limitations.

**No existing CLI install?** Clone once:

```sh
git clone https://github.com/nikoatwork/jumpyBrain.git
cd jumpyBrain
npm run desktop:setup
open "$HOME/Applications/jumpyBrain.app"
```

## GUI updates and recovery

The sidebar update button stays visible in a fixed slot. When up to date it shows a quiet checkmark and checks for updates when clicked; when a release is available it becomes a **Download update** icon with a subtle glow. Click it to prepare in the background while continuing to edit. Once ready it becomes a glowing **Relaunch to apply update** icon. Leaving it ready defers installation; quitting without relaunch cancels preparation. Relaunch waits for saves in every registered editor tab. Failed or unresponsive drafts and canceled closes keep the old installation running. Preparation means staged, not installed. After verified success it returns to the quiet up-to-date state; no status text or update details are added to the sidebar. Its tooltip and accessible name provide the action and any failure guidance. **Check for updates…** in the native application/tray menu checks manually without opening a popup.

Update outcomes appear briefly in a compact bottom-left notification over the content, with a dismiss button. Hover or keyboard focus pauses dismissal. **Settings** shows the installed Mac app version at the bottom.

Preparation reuses the installed native helper when its source, build recipe, architecture and signed executable still match. Runtime/editor updates therefore avoid compiling Swift again. Older installations without a reuse record, changed native code or failed verification require a fresh build and can take longer. Private update folders include phase timings for diagnosing slow updates.

A supported default managed CLI updates with the app. Custom sources, pinned refs, foreign launchers, and missing CLI installations receive the same download icon explicitly named **Update app only; CLI stays unchanged**, with the policy explanation in its tooltip. The updater preserves memory, connections, Keychain references, login preference, CLI targets, source/ref policy, and agent integrations. It never indexes memory or updates an independently hosted server. `jumpybrain update` uses this same transaction for a standard paired installation. An open app owns preparation and the explicit relaunch barrier; the CLI reports prepared/restart-needed. With the app quit, the CLI installs both components and verifies the newly launched app before reporting success. CLI-only/custom-root installations retain their existing source workflow. Paired custom/pinned/foreign policies or source/ref overrides stop with guidance instead of silently changing policy or splitting versions. Older apps without the shared updater need one source bootstrap after quitting (`npm run desktop:setup`).

Requires macOS 13+, Node 22.12+, npm, Python 3.9+, Xcode Command Line Tools, external QMD, and 3 GB free. Downloads come from public GitHub releases (including beta releases) and npm/Electron dependency hosts. No GitHub login, checkout, or Terminal is needed for an ordinary GUI update. Local ad-hoc signing remains the supported distribution; notarization and Intel hardware validation are separate gates. Older apps without this UI need one `desktop:setup` from source to bootstrap it.

Preparation failures leave the installation intact. Publication uses journaled atomic exchanges and retains previous components under `~/Library/Application Support/jumpyBrain Updates/update-*`. A failure after publication attempts rollback. An interrupted transaction blocks normal startup and opens a dedicated **Recover previous installation** surface; recovery uses the same safe restart barrier. Unknown or live installer locks are not removed. Failure guidance is available in the icon tooltip. The dedicated startup recovery surface retains **Show update log** for bounded build/error evidence; these logs are not uploaded automatically. Keep recovery folders until the update is verified. If external tools changed a recorded recovery path, restore from the retained components only after resolving that conflict; the updater will not overwrite it.

Fresh setup provisions the CLI and external search prerequisites without agent integrations or an initial index; an existing CLI is reused. Development/source updates still use a chosen revision and `npm run desktop:setup` after quitting. The checkout is unnecessary for launching the installed app or receiving its next supported published release.

## Migration from the two-app beta

Quit the older menu-bar helper and Desktop/Electron windows after saving. Setup replaces `~/Applications/jumpyBrain.app` with the unified app and moves owned `jumpyBrain Desktop.app` and `jumpyBrain Electron.app` bundles into a dated recovery archive under `~/Library/Application Support/jumpyBrain Backups`. It refuses unrelated apps, active processes, or a held native service lock.

Connections, control capability, logs, and diagnostics stay in `~/Library/Application Support/jumpyBrain Companion`. Electron preferences and first-run completion retain `~/Library/Application Support/jumpyBrain Electron Prototype`. Markdown stays in its chosen folders. The existing login preference migrates to one `local.jumpybrain.desktop.plist` LaunchAgent; a fresh install defaults to off. Login starts the menu bar and services without opening a window.

Keychain service names and credential references are retained. Local ad-hoc signing can change Keychain access eligibility; if Settings reports Keychain unavailable, explicitly repair that connection's key there. No credential is copied into files or the renderer, and no broad Keychain access permission is added.

A failed installation rolls back moved app/login files and leaves a previously running app untouched. Backups are retained after successful publication. For manual rollback, quit the new app, preserve its bundle, restore the previous bundles and login plist from the dated `.tar.gz` backup, and reopen the older app. Do not run both generations together. Custom/global `/Applications` legacy installs require separate migration; setup manages `~/Applications`.

## First launch and everyday use

1. Choose **Start writing** to begin in the suggested local folder, or **Open my notes** when it already contains a brain.
2. Optional: **Use a different folder…** selects an empty folder or an existing brain. Unrelated populated folders are refused.
3. For a server you or your team already set up, choose **Connect to a remote brain** and enter its address and access key. New remote connections open for viewing; editing is enabled separately in Settings. An existing active remote connection can also be opened directly.

Settings (**⌘,**) manages local/remote profiles. Remote writes and indexing require explicit approval for that destination. Switching and quitting use the same all-tab save barrier: failed saves or unresponsive registered browser tabs keep the app running. Wake those tabs and resolve their drafts, or close them using their normal discard confirmation, then retry Quit.

Closing a window retains its pending-draft confirmation and keeps the services running. Quitting stops only the app's own gateway/local engine; separately running shared servers and the CLI remain independent. App-hosted endpoints are unavailable after quit. Crash recovery restarts the services on the next launch, but unsaved renderer-only drafts are not crash-persistent.

**Start at Login** controls the next login. **Show Logs** reveals the private service log. An occupied/unauthenticated port is an error; the app never adopts another process. If its service stopped, reopen the app window to retry startup; existing drafts still require explicit recovery across a restarted session.

## Extensions

Add optional themes and tools through [trusted local extensions](../../docs/extensions.md). The guide includes installation, a minimal author setup, Candy Pink and Pomodoro examples, and the API v1 upgrade contract. Keep linked extension sources outside the app/CLI installation.

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
node scripts/desktop-update-smoke.mjs
```

Tests use disposable memory. The desktop smoke runs the production application lifecycle and signed internal host through background launch, blocked quit, close/reopen, explicit quit, parent crash, and recovery. Native Keychain/RPC coverage remains in `integrations/macos-companion/test_connections_native.py`. Public signing/notarization, Intel hardware, physical login/logout, and arbitrary historical Keychain signing identities need separate validation.

To remove the Mac app, disable **Start at Login**, quit, and move `~/Applications/jumpyBrain.app` to Trash. Brain folders, profiles, Keychain items, backups, and the separately installed CLI remain in place.
