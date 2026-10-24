# Related notes

An executable, read-only package using only public `jumpybrain/extensions.js` types. The main factory registers a command and panel; the separate UI factory renders query/results and calls supported `execute`/`openNote` operations. There are no host conditions for this feature.

```sh
jumpybrain extensions install --source ./examples/extensions/related-notes
```

In Mac companion Settings, enable **Related notes** if disabled, then open a saved note and choose **Related notes** in its actions, or press Cmd/Ctrl+Shift+R. The command explicitly searches the visible note title (including a draft title, never draft body content). The panel accepts an edited query. Search is limited to nine candidates and eight displayed results, excluding the active note and duplicate IDs. Index incompleteness, offline search and empty results remain visible. Opening a result uses the normal save/navigation guard. Closing, document/scope changes, disable, remove and reload cancel the panel lifetime.

The Settings disclosure also offers **Commands only**, **Sidebar**, **Note actions**, a shortcut field (`Mod`, `Meta`, `Ctrl`, `Alt`, `Shift` plus a key), and **Move earlier**. Conflicting shortcuts resolve by stable command ID; built-in Search retains Mod+K. An empty shortcut disables the extension shortcut.

Edit `main.ts`/`ui.ts` and use **Reload extensions**. Preparation bundles ordinary TS/JS at install/reload, including the UI IIFE that registers with `globalThis.JumpyBrainExtensions`; the host attaches its CSP nonce. The public SDK import is type-only and erased. For authoring type checks, resolve `jumpybrain/extensions.js` from an installed jumpyBrain package. No npm dependencies or install scripts are needed by this example. The `memory.read` capability authorizes supported scoped reads; the package does not request writes. Executable packages are explicitly trusted local code; they are not a security sandbox. Ordinary hosted browsers do not load them.
