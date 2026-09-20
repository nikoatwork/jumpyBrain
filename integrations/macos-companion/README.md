# macOS app (beta)

A menu-bar app for your local jumpyBrain. It runs the server, opens the Markdown editor in Chrome, and lets you refresh search or open your memory folder.

**One installed runtime, one update command.** The app and CLI share `~/.jumpybrain/app`. Your Markdown stays separately in `~/.jumpybrain/memory` (or your configured location). Neither runs from your development checkout.

This beta is built locally—not a downloadable, signed/notarized release yet.

## Install

First [install the CLI](../../docs/install.md). You also need macOS 13+, Xcode command-line tools, Python 3.9+, Google Chrome, and the CLI’s Node 22+/QMD dependencies.

```sh
python3 "$HOME/.jumpybrain/app/integrations/macos-companion/install.py"
```

The installer builds the native app from your **installed runtime’s source**; it does not replace the CLI or initialize/migrate memory. Fresh installations launch immediately and start at user login. Use `--no-start` to skip the immediate launch.

Optional settings:

- `--install-root /path` — use another managed CLI installation.
- `--memory-root /path --port 3788` — override the memory folder or port.

Reinstalling preserves existing memory/port settings unless explicitly overridden, keeps your login preference, and leaves the app stopped.

## Use

Click the brain icon in the menu bar:

- **Open Editor in Chrome** — open the local editor.
- **Restart Server…** — restart the installed server; this **does not download updates**.
- **Refresh Search Index** — refresh search after external file edits.
- **Open Memory Folder** / **Show Logs**.
- **Start at Login** — enable or disable next-login startup.
- **Quit jumpyBrain…** — stop the local server, not Chrome. Wait for **Saved** first.

An exclamation icon means the server is starting, stopped, or needs attention. Login startup does not open Chrome automatically. To reopen manually:

```sh
open "$HOME/Applications/jumpyBrain.app"
```

**Editing with AI:** wait for **Saved** before handing work over, then reload the note after external edits. An open editor does not automatically merge file changes; concurrent editing and offline drafts are not protected.

## Update

1. Wait for **Saved**, then **Quit jumpyBrain** from the menu bar.
2. Run `~/.jumpybrain/bin/jumpybrain update`.
3. Reopen the app and reload the browser editor.

This updates the shared runtime and native app from the CLI’s recorded source/ref, normally GitHub `master`. Memory, key, port, login preference, agent integrations, and remote configuration are preserved. The same native build dependencies are needed for updates; CLI-only installations do not need them.

A running app blocks replacement. There is no forced quit, automatic restart, or background updating. `jumpybrain update --dry-run` previews the update without changing files or requiring a quit.

## Older installations and recovery

Older apps bundled a separate server. For the first migration, quit the app and rerun the latest [public installer](../../docs/install.md) from outside a source checkout. It migrates the default `~/.jumpybrain` installation while preserving settings. An old `jumpybrain update` may update only the CLI; running the newly installed updater again migrates the app. Custom roots do not adopt legacy apps or apps bound to another runtime.

Build failures leave both old versions intact; ordinary replacement errors roll back both. An installation-wide lock serializes updates, and the app’s singleton lock prevents startup during replacement. After a crash, verify no installer is running before removing a stale `<install-root>/.installer-lock` directory.

Power-loss/SIGKILL recovery is manual: preserve `.companion-runtime-*` under the install root and `.companion-app-*` under `~/Applications` for recovery. Old fixed `app.installing`/`app.previous` paths are never automatically deleted. CLI shim/manifest bookkeeping follows paired replacement; a later bookkeeping error can leave updated code with old manifest metadata and is reported as an error.

## Privacy and beta limits

- The server is **loopback-only**. Never expose this local app publicly.
- A dedicated key is stored in a private file under `~/Library/Application Support/jumpyBrain Companion/`, **not Keychain**. Chrome receives it via a URL fragment and remembers it in local storage. Do not share keys or launch URLs; other software running as your user can access this state.
- Node/QMD are external dependencies with installation-time paths. Shell startup files and remote credentials are not inherited.
- The app stops only its own server. Busy ports are reported, not taken over. A watchdog cleans up an orphan after a crash; synchronous QMD work may delay it. No crash-restart loop is enabled.
- Login uses `~/Library/LaunchAgents/local.jumpybrain.companion.plist` without `KeepAlive`; Quit stays quit until login/manual launch. Logs rotate above 5 MB.
- **Do not publish locally built `.app` bundles, `.build/`, generated configuration, keys, or logs.** Bundles contain machine-specific paths and are only ad-hoc signed. Portable distribution and broader login/browser testing remain future work.

## Remove

Quit the app, then remove it **before** uninstalling the shared CLI:

```sh
python3 "$HOME/.jumpybrain/app/integrations/macos-companion/uninstall.py"
```

This preserves memory, indexes, the CLI, and the key/log directory. The CLI uninstaller refuses to remove a runtime still used by the app.

## Development and tests

Development builds are opt-in and never replace your personal app:

```sh
npm run build
# Choose an output path that does not already exist:
python3 integrations/macos-companion/install.py --build-only \
  --runtime-root "$PWD" --output /tmp/jumpyBrain-test.app
python3 integrations/macos-companion/smoke.py --app /tmp/jumpyBrain-test.app
python3 -B integrations/macos-companion/test_update.py
node --test test/macos-companion-update.test.js
```

The smoke uses disposable runtime/memory copies to test health, editor routes, authentication, indexed search, duplicate/busy-port refusal, shutdown, orphan cleanup, and unchanged Markdown. Test menu icons briefly appear. Chrome interaction and actual logout/login remain manual checks. A build-local overlay handles duplicate SwiftBridging maps on affected Apple tools without modifying system files.
