# Local Electron prototype

The existing jumpyBrain browser UI in a Mac desktop window. This prototype uses your **installed native companion** and its installed runtime; it does not run a backend or frontend from this checkout. The native menu-bar app continues to own the local gateway, Keychain, connections, login startup, and runtime updates.

## Try it

Requirements: macOS, an installed/configured [native companion](../macos-companion/README.md), and Node 22.12+ for development/packaging. The prototype downloads Electron through npm; it does not install another CLI or initialize memory.

From the repository root:

```sh
npm --prefix integrations/electron ci
npm run electron
```

To create a separate Finder/Dock app for this Mac:

```sh
npm run electron:install:local
open "$HOME/Applications/jumpyBrain Electron.app"
```

The installer refuses to overwrite an existing app. Quit and move an earlier prototype aside before rebuilding. The generated app contains the window/host code and Electron, so it does not need this checkout to launch. It still needs the installed native companion/runtime. It is ad-hoc signed for local use, **not notarized or ready to redistribute**.

The app finds `~/Applications/jumpyBrain.app`, then `/Applications/jumpyBrain.app`. For a custom native companion location, launch from the terminal with an absolute `JUMPYBRAIN_COMPANION_APP` environment variable. It reads the installed `Configuration.json` for the gateway port and support directory, authenticates the gateway using the private local control key, and starts the native companion in the background only if the port refuses connections. A foreign/unauthenticated service or busy/unresponsive port is an error; nothing is taken over or restarted.

## Behavior

- Same HTML, CSS, editor, graph, Settings, shortcuts, saves, and connection permissions as Chrome, from the installed runtime. Uninstalled source edits are not reflected in either surface.
- **Feedback** prepares email to `jumpybrain@agentmail.to`. Diagnostic logs default on, with a preview and opt-out. Download the email draft to include the log as an attachment; open/review/send through an email client that supports `.eml` drafts (some require Edit as new). **Open email app** is a fallback with logs inline. It never sends automatically or collects note text, keys, paths, or backend log files. Both the installed runtime and Electron wrapper need this feature version for desktop email handoff/download support.
- Settings also opens with **⌘,**. Standard Mac edit, zoom, fullscreen, close, and quit menus are available. **⌘N** focuses/reopens the single prototype window; **⌘Enter** remains the existing New note shortcut.
- Window close/reload/quit respects the browser's pending-draft unload guard. Keep editing is the default; discard requires choosing it explicitly. This adds no crash recovery or offline draft persistence.
- Closing the last window leaves the app in the Dock; click it or use File → Open Window to reopen. Quitting Electron leaves the native companion and Chrome running. Keep the native companion running while editing.
- Chrome and Electron use the same active brain and all-tab save/switch barrier. A stale or unresponsive Chrome tab can still block a brain switch. Resolve its draft/session rather than restarting the gateway to bypass it.
- Browser preferences live separately under `~/Library/Application Support/jumpyBrain Electron Prototype/`. Theme choices are independent of Chrome. Remote keys remain in the native companion's Keychain; the app does not import Chrome cookies or storage.
- Use the native menu-bar app to update the installed runtime. This prototype has no automatic updater or login registration. After a runtime update, resolve any retained draft and reopen/reconnect through existing Settings controls.
- Page/network navigation is restricted to the loopback gateway; external windows, external resource loads, downloads, and permission requests are denied except same-origin clipboard writes for existing Copy actions. Programmatic clipboard reads remain denied. The renderer has no preload/Node bridge. External web browsing is outside this first prototype.

## Verify

```sh
node --test test/electron-host.test.js
npm run build
npm run smoke:electron
```

The Electron smoke uses a disposable memory root, production gateway, and production window. It checks authentication/token removal, renderer isolation, navigation restrictions, Settings, graph, editing/autosave, close guards, and tab unregistration. It never writes personal or remote memory. The installed-app check should remain observational unless a user explicitly asks for data edits.

Removing the prototype `.app` only removes this window application. Its separate browser preferences can be removed deliberately after quitting; do not remove the native companion support directory or canonical memory to uninstall this prototype.
