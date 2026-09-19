# macOS menu-bar companion — local prototype

An optional, experimental companion for using jumpyBrain as a local browser-based Markdown editor. All companion source lives in this folder. No new core/runtime APIs, task list, public installer integration, or native editor.

## Use

Requirements: macOS 13+, Xcode command-line tools, Python 3.9+, Node 22+, QMD, Google Chrome, and an initialized memory root. Run from this checkout:

```sh
python3 integrations/macos-companion/install.py
```

Defaults to `~/.jumpybrain/memory`, loopback `127.0.0.1:3787`, and startup **at user login** (not before login). Override with `--memory-root /absolute/path --port 3788`. Stop any existing local server first: only one server should own the memory root/port.

The menu-bar **brain icon** indicates a healthy local server; an exclamation icon indicates startup/error/stopped. Click it for:

- **Open Editor in Chrome** — opens the existing browser UI, supplying the dedicated local key automatically.
- **Restart Server…** — restarts only its owned Node process, after a save reminder.
- **Refresh Search Index** — calls the bundled CLI against the local server, serializing the rebuild with server writes/auto-indexing. Use after direct AI/file edits when search is stale.
- **Open Memory Folder** / **Show Logs**.
- **Start at Login** — toggles next-login startup. Does not stop the current server.
- **Quit jumpyBrain…** — stops its server and removes the menu-bar icon; does not quit Chrome or disable next-login startup. Wait for **Saved** first.

Startup stays quiet; it does not launch a Chrome tab every login. To start/open it manually:

```sh
open "$HOME/Applications/jumpyBrain.app"
```

If first launch starts it without opening a tab, choose **Open Editor in Chrome**. Opening the already running app also opens the editor. A new browser tab is opened per Open action; tab reuse is not implemented.

## What is installed

- `~/Applications/jumpyBrain.app` — a native Swift/AppKit accessory app plus a **snapshot** of this checkout's compiled server/frontend.
- `~/Library/LaunchAgents/local.jumpybrain.companion.plist` — user LaunchAgent, `RunAtLoad`, deliberately **no KeepAlive**, so Quit stays quit until login/manual launch.
- `~/Library/Application Support/jumpyBrain Companion/` — private directory (`0700`) with a dedicated random local API key (`0600`), lock, and logs.

The app captures absolute Node/QMD paths during installation; it does not source `.zshrc`, use remote/team credentials, replace the global CLI, or build at login. The Homebrew Node/QMD installations are still dependencies, not bundled binaries. Reinstall if those paths change. Existing memory must be initialized; the companion never initializes, migrates, or seeds it.

The key is stored in a private local file for this prototype, **not Keychain**. It is passed to Node through its environment and to Chrome in a URL fragment; the browser removes that fragment and remembers the key in its existing local storage. Fragments are not sent over HTTP, but this is not protection against other software running as your macOS user. Do not share launch URLs or the key. The server binds only to loopback; never expose this prototype publicly.

The singleton lock prevents duplicate companions. A busy port is reported, never adopted or killed. On normal quit the app stops only processes it launched. A watchdog stops an orphan server after a companion crash; a blocked synchronous QMD operation may delay watchdog execution. No automatic crash-restart loop is enabled: reopen the app or choose Restart if its server exits. The local stdout log rotates at startup above 5 MB (one previous generation); server-owned access logs retain existing core behavior.

## Update / remove

This is a frozen local build, not a checkout watcher. To pick up editor changes: wait for **Saved**, quit from the menu bar, then rerun `install.py`. It preserves the local key and existing login preference. Build failure leaves the installed app untouched. No automatic updates or signing/notarization for distribution are included (the local bundle is ad-hoc signed).

```sh
# Compile only; do not install or enable login:
python3 integrations/macos-companion/install.py --build-only
# Install but do not start immediately (fresh installs still enable next login):
python3 integrations/macos-companion/install.py --no-start
# Quit from the menu bar first, then remove only the app + login item:
python3 integrations/macos-companion/uninstall.py
```

Uninstall preserves Markdown, indexes, the global CLI, and the companion's key/log directory. Build output and one previous installed app are ignored under `.build/` in this folder. A build-local VFS overlay works around obsolete duplicate SwiftBridging maps on some upgraded Apple CLT installations; it never edits system toolchain files.

## Public source versus distributable app

The source uses each user's home directory and discovers Node/QMD at installation; it contains no personal filesystem paths or production credentials. The smoke test uses an explicitly disposable fixture key, not an installed key.

**Do not upload a locally built `.app`, `.build/`, generated `Configuration.json`, logs, or the private support directory.** The bundle's generated configuration contains absolute paths for the machine that built it. These paths are not secrets, but can reveal usernames and folder names, and the bundle is not portable to another Mac. Build artifacts and accidental copies of local configuration/key/log files are ignored by this folder's `.gitignore`.

Publishing the source as an experimental integration is different from shipping a downloadable app. A public binary release still needs first-run configuration instead of baked-in paths, dependency provisioning, signing/notarization, and broader macOS/login testing. Keychain-backed credential storage is also a future hardening option; the current private-file/browser-storage trade-off is described above. This prototype is not a production distribution package.

## Validation

```sh
python3 integrations/macos-companion/install.py --build-only
python3 integrations/macos-companion/smoke.py
```

The native smoke starts a copied app with a disposable memory root and real QMD index. It checks home/graph HTML, authentication, indexed search, healthy menu status, duplicate-instance refusal, graceful shutdown, occupied-port refusal, crash orphan cleanup, and unchanged canonical Markdown. It does not install a login item or touch live notes. It briefly displays test menu-bar icons. Chrome opening, menu clicks, and actual logout/login are separate manual checks.

## Editing with AI

Sequential human/AI editing is the intended experiment. Before handing work to AI, wait for **Saved**. After the AI finishes, reload/reopen the note before typing; refresh the search index if needed. Autosave does **not** refresh an already open textarea after an external file change. This companion does not fix concurrent editing, merge conflicts, undo/history, note creation, or title editing. Existing browser/server semantics remain unchanged.
