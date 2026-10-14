# macOS app (beta)

A menu-bar app for named local and remote jumpyBrain connections. It runs a private loopback gateway, opens the Markdown editor in Chrome, and routes supported memory operations to one selected brain. Local brains use the same Markdown/QMD engine as the CLI; remote brains use their existing server. There is no syncing.

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

- **Open Editor in Chrome** — open the selected brain’s editor.
- **Settings…** — open `/settings` to add, edit, test, remove, or select named connections.
- **Brain Connections** — select the active brain through the same save guard as Settings.
- **Restart Server…** — restart the companion gateway and its owned local engine, never the remote server; this **does not download updates**.
- **Refresh Search Index** — index the selected connected, write-authorized brain after external edits.
- **Open Memory Folder** — available only for a selected local brain. **Show Logs** opens companion logs.
- **Start at Login** — enable or disable next-login startup.
- **Check for Updates** — refresh the update indicator (also checked at startup and every six hours).
- **Update jumpyBrain…** — update the CLI and app, then reopen the app. Runs in the background without opening Terminal; Chrome stays open.
- **Quit jumpyBrain…** — stop the gateway/local engine, not Chrome or a remote server. Wait for **Saved** first.

The menu shows the selected brain and its connection state. An exclamation icon means startup, offline/Keychain trouble, or another condition needing attention. Login startup does not open Chrome automatically. To reopen manually:

```sh
open "$HOME/Applications/jumpyBrain.app"
```

**Editing with AI:** wait for **Saved** before handing work over, then reload the note after external edits. An open editor does not automatically merge file changes. The switch barrier is not a general concurrent-edit merge or durable offline-draft backup.

## Connections and switching

The first launch seeds the configured local brain; existing profiles are retained on reinstall/update. In **Settings…**, give each existing local memory folder or remote server a friendly name. Adding a folder requires an existing `jumpybrain.json`; it does not initialize, migrate, or copy memory. Remote URLs must be HTTPS origins (no path, embedded credentials, query, or fragment); HTTP is allowed only for literal loopback development addresses: `localhost`, `127.0.0.1`, or `[::1]`. Redirects are not followed.

Replacing a profile’s folder/origin gives it a new identity, so old scoped note bookmarks cannot open against the replacement. See the [control and switching contract](gateway.docs.md) for the developer boundary.

One active profile applies to **all companion editor tabs**. Switching from Settings or the native menu first asks every registered tab to save against the old brain and waits for in-flight operations. Failed/unconfirmed saves or sleeping/unresponsive tabs block activation; no automatic discard or fallback occurs. Wake the blocking tabs and resolve save/conflict errors before retrying. Do not restart to force a switch: browser drafts are not durable. Editing the active destination, repairing its key, or changing its editing permission uses the same barrier.

Remote profiles start read-only. To permit writes, explicitly check **“I explicitly authorize editing, creating notes, and refreshing the search index on this remote brain.”** This permission also gates **Refresh Search Index**. Saving, testing, or selecting a connection is not write approval; server-side permissions still apply. Connection removal deletes profile metadata and attempts removal of its credential, not memory or server authorization. Select another profile before removing the active one.

The last selected brain survives restart. A missing local folder, offline server, failed authentication, or unavailable Keychain does not select another brain. Editor/Settings and the connection switcher remain available while only the target is offline. Companion profiles do **not** change CLI defaults, agent targets, CLI write policy, or their credentials; agents still use the CLI with their explicitly selected target.

## Update

Choose **Update jumpyBrain…** from the menu bar. There is no additional save/quit confirmation: an independent background updater starts without opening Terminal, the app quits, and a successful update reopens it automatically. Chrome stays open and is **not** automatically reloaded. Editing/saving is unavailable while the server is stopped; unsaved or in-flight edits may be lost.

The menu shows **Update available** when the installed Git revision differs from the recorded source/ref. Checks run at startup, every six hours, or via **Check for Updates**, without installing anything. Public HTTPS Git installs with matching origin metadata are supported; local-source installs, missing provenance, private/unsupported sources, and offline failures show **Updates: unable to check**. The Update action still works independently of the indicator. Pinned commits are not treated as tracking a newer branch.

For a terminal-only update, quit the app first, run `~/.jumpybrain/bin/jumpybrain update`, then reopen the app manually. Older companions without the menu action need this one-time update first.

This updates the shared runtime and native app from the CLI’s recorded source/ref, normally GitHub `master`. Memory, local control token, profiles/credential references, port, login preference, agent integrations, and remote configuration are preserved. Keychain items are not deliberately replaced; access after rebuild may still require key re-entry. The same native build dependencies are needed for updates; CLI-only installations do not need them.

A running app still blocks CLI replacement. Only the explicitly clicked menu action authorizes shutdown and automatic reopening; there are no automatic installations. `jumpybrain update --dry-run` previews the update without changing files or requiring a quit.

The background updater must acknowledge the handoff before the app quits. If startup fails, the app stays running. If updating fails after shutdown, it does not automatically reopen the app: a failure alert offers **Show Log** (dismissed after one minute if unattended). Logs/results remain under `~/Library/Application Support/jumpyBrain Companion/update-*/` (or the configured support directory); temporary updater jobs and executable handoff files are removed after completion. If no alert appears, inspect that directory before reopening; never remove installer locks while an updater is running.

Updates do **not** rebuild the memory index. The browser’s Lexical editor bundle is rebuilt with the CLI, but the long native-build step is Swift compilation. The installer reuses the native executable only when source, build recipe, toolchain/SDK contents, target/options and controlled environment match a verified build record; resources/configuration and signing always refresh. Older installations or changed/unverifiable inputs still compile. Full input verification itself takes time (about 10 seconds in one local fixture), so reuse is faster—not instant.

## Older installations and recovery

Older apps bundled a separate server. For the first migration, quit the app and rerun the latest [public installer](../../docs/install.md) from outside a source checkout. It migrates the default `~/.jumpybrain` installation while preserving settings. An old `jumpybrain update` may update only the CLI; running the newly installed updater again migrates the app. Custom roots do not adopt legacy apps or apps bound to another runtime.

Build failures leave both old versions intact; ordinary replacement errors roll back both. An installation-wide lock serializes updates, and the app’s singleton lock prevents startup during replacement. After a crash, verify no installer is running before removing a stale `<install-root>/.installer-lock` directory.

Power-loss/SIGKILL recovery is manual: preserve `.companion-runtime-*` under the install root and `.companion-app-*` under `~/Applications` for recovery. Old fixed `app.installing`/`app.previous` paths are never automatically deleted. CLI shim/manifest bookkeeping follows paired replacement; a later bookkeeping error can leave updated code with old manifest metadata and is reported as an error.

## Privacy and beta limits

- The server is **loopback-only**. Never expose this local app publicly.
- Named profiles live in private `connections.json` (schema version 1, mode `0600`) under `~/Library/Application Support/jumpyBrain Companion/` (directory mode `0700`, or configured support path), outside the bundle. It contains destinations, active identity, editing permissions, and credential references—not remote keys. See [the persistence contract](connections.docs.md) for schema/validation and recovery details. Malformed or unsupported state fails closed; restore a valid private backup deliberately, rather than expecting automatic replacement.
- Remote API keys live in **macOS Keychain**, accessed by Swift over private child-process pipes; they are not returned to the browser or stored in browser localStorage. The private local `api-key` file is now only a **companion control/bootstrap token**, not a remote credential. The launch URL fragment is consumed/removed by a session handshake; Chrome receives an **HttpOnly, per-port, SameSite=Strict cookie**. Do not share launch URLs or the local token; other software running as your user is outside this protection boundary.
- Locked/denied Keychain access fails without an authentication prompt or plaintext fallback. Ad-hoc rebuilding/updating can make an old item inaccessible to the new executable: **Keychain unavailable** means you may need to re-enter the remote key in Settings. Automatic Keychain continuity is not guaranteed; re-entry on an active profile is still save-barrier guarded.
- Node/QMD are external dependencies with installation-time paths. Shell startup files and remote credentials are not inherited.
- The app stops only its own server. Busy ports are reported, not taken over. A watchdog cleans up an orphan after a crash; synchronous QMD work may delay it. No crash-restart loop is enabled.
- Login uses `~/Library/LaunchAgents/local.jumpybrain.companion.plist` without `KeepAlive`; Quit stays quit until login/manual launch. Logs rotate above 5 MB.
- **Do not publish locally built `.app` bundles, `.build/`, generated configuration, keys, or logs.** Bundles contain machine-specific paths and are only ad-hoc signed. Portable distribution and broader login/browser testing remain future work.

## Remove

Quit the app, then remove it **before** uninstalling the shared CLI:

```sh
python3 "$HOME/.jumpybrain/app/integrations/macos-companion/uninstall.py"
```

This removes only the app/login item and preserves memory, indexes, the CLI, and the support directory—including `connections.json`, the local control token, and logs. It does **not** delete Keychain credentials. To deliberately remove credentials, use Settings to remove inactive connections before uninstalling, or delete the relevant items in Keychain Access (service `local.jumpybrain.companion.connections`). Removing the support directory alone does not remove Keychain items or revoke remote API keys. The CLI uninstaller refuses to remove a runtime still used by the app.

## Development and tests

Development builds are opt-in and never replace your personal app:

```sh
npm run build
# Choose an output path that does not already exist:
python3 integrations/macos-companion/install.py --build-only \
  --runtime-root "$PWD" --output /tmp/jumpyBrain-test.app
python3 integrations/macos-companion/smoke.py --app /tmp/jumpyBrain-test.app
python3 -B integrations/macos-companion/test_update.py
# macOS native tools + Aqua GUI; temporary default-Keychain items, no prompts:
python3 -B integrations/macos-companion/test_connections_native.py
node --test test/macos-companion-*.test.js test/companion-browser.test.js
npx --package=playwright node scripts/companion-gateway-smoke.mjs
# GUI session required; background launchd jobs with inert fixture updates:
python3 -B integrations/macos-companion/smoke_menu_update.py
```

The native connection regression compiles an isolated copy of the production Swift source (a cold module cache can take minutes), ad-hoc signs a temporary executable, and checks Keychain CRUD/incremental RPC, malformed-frame/input/work bounds, and real menu state for local/read-only/authorized/offline/switching cases. It uses a UUID-only test service in the default Keychain and removes its items/build in cleanup; it never locks/unlocks Keychain, installs an app, contacts a remote brain, or modifies login state. `--skip-keychain` / `--skip-menu` explicitly omit those checks for constrained environments.

The server smoke uses disposable runtime/memory copies to test health, editor routes, authentication, indexed search, duplicate/busy-port refusal, shutdown, orphan cleanup, and unchanged Markdown. The menu smoke instruments startup in a temporary source copy to invoke the production menu action, then tests a real LaunchAgent → independent updater job handoff, successful fixture-app reopening, failure without reopening, duplicate-runner refusal, cancellation-after-ack without quitting the original app, and failed-launch timeout/job cleanup. Its CLI is inert and failure alerts are replaced by evidence markers; it does not update your installed app or open Terminal. Test menu icons briefly appear. The production gateway/browser smoke below covers real Chromium multi-tab saves/conflicts and local/remote editing with disposable roots and fixture credentials. Physical sleeping-tab behavior, folder-picker interaction/cancellation, locked/denied user-Keychain access, credential continuity after a differently signed/ad-hoc rebuild, and actual logout/login remain manual checks; the native fixture does not simulate those OS/browser conditions. A build-local overlay handles duplicate SwiftBridging maps on affected Apple tools without modifying system files.
