# jumpyBrain Desktop for macOS

A normal Finder, Spotlight, and Dock app for your Markdown brain. Includes the pink brain app icon, native menus, a sandboxed editor, and a local-first welcome screen. No App Store, account, or subscription is needed.

## Install from a private Git checkout

Requires macOS 13+, Node 22.12+ and npm, Git, Python 3.9+, and Xcode command-line tools (`xcode-select --install`). Git uses your existing authentication for the private repository.

```sh
git clone git@github.com:nikoatwork/jumpyBrain.git
cd jumpyBrain
npm run desktop:setup
open "$HOME/Applications/jumpyBrain Desktop.app"
```

Setup installs the managed local CLI/search runtime if missing, builds the native menu-bar helper if missing, and packages `~/Applications/jumpyBrain Desktop.app` for this Mac's architecture. Electron is downloaded through npm. Fresh installation provisions QMD 2.8.3 with the existing installer, without installing agent skills or running an initial index. Existing managed runtimes, brains, connections, and helpers are reused without automatic updates or restarts. The helper owns the shared gateway, Keychain, and login startup. Chrome is not needed for the Desktop editor; the helper's own **Open Editor** action still targets Chrome.

The runtime installer creates its standard local CLI brain at `~/.jumpybrain/memory`. Desktop then lets you choose its active brain independently. Selecting a folder in Desktop does not retarget existing CLI commands or agent integrations. To use the same folder with an agent, pass it explicitly with `jumpybrain … --root "/path/to/your/brain"` or configure that agent's memory skill.

Once installed, this checkout is not needed for launching Desktop. Find **jumpyBrain Desktop** in Spotlight, open it from `~/Applications`, or drag it to the Dock. The separate `jumpyBrain.app` helper remains in the menu bar.

## First launch

1. **Choose folder…** opens the macOS folder picker. Create a folder there or select an existing one.
2. An empty folder becomes a new local brain only after **Create my local brain**. Setup adds the standard Markdown directories, `jumpybrain.json`, and a `.gitignore` entry for rebuildable state.
3. An existing initialized brain offers **Open my local brain** and retains its configuration and notes. An unrelated populated folder is refused; choose a fresh folder instead.
4. The folder becomes the active app brain using the helper's normal save barrier. Other open editor tabs must finish saving before a switch completes.

If a connection already exists, **Continue with …** keeps that selected brain. Remote connections are explicitly labeled; the primary path always starts local. Canceling the picker or closing Welcome leaves memory unchanged. Later launches return directly to the editor. Additional existing local brains or remote servers can be added in **Settings** (⌘,); remote editing needs separate explicit approval. There is no implicit sync or upload.

## Build and update

For window development against the installed runtime:

```sh
npm --prefix integrations/electron ci
npm run electron
```

Source UI edits must be built/installed in the runtime to appear in the editor; the welcome screen belongs to the desktop package.

Package without installing:

```sh
npm run desktop:pack
# .local-pack/desktop/jumpyBrain Desktop.app
```

To rebuild the installed window, quit **jumpyBrain Desktop**, move its old bundle aside, then run `npm run electron:install:local`. The installer refuses to overwrite an existing bundle. Settings and welcome completion remain outside the bundle, in `~/Library/Application Support/jumpyBrain Electron Prototype` (the retained prototype storage path). The old `jumpyBrain Electron.app` prototype can be removed after closing it; it is not overwritten.

Update the shared runtime/helper separately through the existing `jumpybrain update` flow, after all editor windows report Saved and the helper is quit. Desktop has no automatic updater. If an old runtime lacks required modules, repair/update it before reopening Desktop. Setup never silently replaces a running helper.

Local builds are ad-hoc signed and verified for use on the building Mac. A bundle copied to another Mac is **not a notarized distribution**. Private users should build from their authenticated checkout; a downloadable DMG with Developer ID signing/notarization can be added later without an App Store release. Only the build machine's architecture is produced and verified.

## Recovery and desktop behavior

- A missing helper/runtime opens Welcome with `npm run desktop:setup` recovery instructions. An occupied or unauthenticated gateway port is an error; nothing is taken over or killed.
- Settings is available with **⌘,**. **⌘N** focuses/reopens the single editor window. Standard edit, zoom, fullscreen, close, and quit menus are available. **⌘Enter** creates a note through the existing editor.
- Pending drafts retain the existing unload confirmation. **Keep editing** is the default. This does not add crash recovery.
- Feedback prepares an email draft for `jumpybrain@agentmail.to`; it never sends automatically. Diagnostic inclusion is previewable and optional. Remote keys never enter the renderer.
- To show Welcome again, quit Desktop and remove only `desktop-setup.json` from its application-support directory. Leave memory and the helper's connections/key files in place.
- Verification: `node --test test/electron-{host,setup}.test.js` and `npm run smoke:electron` use disposable folders and a production gateway; no personal brain is changed.
