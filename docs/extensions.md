# Executable extensions

Extensions add commands, shortcuts, panels and themes to the jumpyBrain Mac app through a public API. Canonical Markdown, retrieval and write policy remain in the memory engine. A package can use those existing operations while keeping its optional feature logic outside core.

The first host is the desktop companion gateway. It supports the selected local or authorized remote brain. Ordinary hosted servers, standalone browser clients and normal agent CLI recall/search do not load these desktop extensions.

## Trust and installation

An extension is trusted local TypeScript/JavaScript code. Node entries run inside the desktop gateway with the user's OS permissions. UI entries run in the application's browser origin and can access visible application data. Capability declarations and scoped API checks are supported-operation contracts; they do not sandbox malicious extension code. Only install code you trust.

Packages are explicitly registered from local directories. The directory is linked for development: editing source takes effect on an explicit reload. The app does not load code from memory files, a cloned project, attachments or a remote server. npm/git fetching, automatic updates and a marketplace are not part of this version.

```sh
jumpybrain extensions install --source /absolute/path/to/my-extension
jumpybrain extensions list
jumpybrain extensions reload
jumpybrain extensions disable --id my-extension
jumpybrain extensions enable --id my-extension
jumpybrain extensions remove --id my-extension
```

Use `--directory /absolute/path/to/extensions` for a nonstandard host or disposable fixture, and `--json` for structured output. The default is `~/Library/Application Support/jumpyBrain Companion/extensions`. Installation/preparation compiles source without executing its factory. An active companion owns activation and reload; offline management prepares configuration for the next desktop start.

Code preparation uses the app's lazily loaded esbuild dependency. TypeScript does not need a separate app rebuild. Install any package-local npm dependencies yourself before registering the package; jumpyBrain does not run a hidden dependency installation. Both Node and browser dependency graphs are bundled from the package. Native modules and imports outside that package are not a supported v1 dependency path.

Installed declarations, enablement, compiled caches and namespaced extension state live outside the brain and the replaceable app bundle. Removal retains extension state. Back up wanted state independently of Markdown; it is not indexed memory.

## A minimal package

Create `jumpybrain-extension.json`:

```json
{
  "apiVersion": 1,
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "main": "main.ts",
  "capabilities": []
}
```

Create `main.ts`:

```ts
import type { ExtensionFactory } from "jumpybrain/extensions.js";

const activate: ExtensionFactory = api => {
  api.registerCommand({
    id: "greet",
    title: "Say hello",
    slot: "sidebar.actions",
    handler: () => ({ message: "Hello from an extension." }),
  });
};

export default activate;
```

Select the command from its contributed button or the extension's Settings entry. Local contribution IDs are namespaced as `hello:greet`. `apiVersion: 1` is the compatibility gate; unsupported versions are rejected before activation. The package's numeric `version` identifies its own release.

The public SDK is [src/extensions/index.ts](../src/extensions/index.ts), distributed separately as `jumpybrain/extensions.js` with TypeScript declarations. It imports no compiler, desktop host or memory engine. A TypeScript editor can use a local jumpyBrain development dependency for completion; source preparation recognizes the SDK import without requiring a second installed host copy.

## Commands and scoped memory

Register executable commands with an ID, title, optional shortcut, optional slot and handler. `Mod+Shift+R` means Command on macOS or Control on other hosts. Settings stores device-local placement, ordering and shortcut overrides. Built-in Open search uses the same dispatcher and retains its reserved shortcut.

The handler receives JSON input and a fresh context:

- `signal`: cancellation for the invocation. Pass it to your own asynchronous work and stop when aborted.
- `scope`: current brain/session generation and tab identity, without credentials or a filesystem root.
- `document`: UI-supplied current note ID/title. It can reflect a draft title; it is not an authenticated canonical snapshot. Use `memory.read(id)` for saved Markdown and its hash. Unsaved body text is not exposed by v1.
- `memory.search({query, limit})`: bounded existing retrieval with canonical IDs, titles, excerpts and available freshness/partial status. It does not create an index, ranker or graph belonging to the extension.
- `memory.read(id)`: saved canonical content and hash.
- `memory.create({type:"note", title?, body, idempotencyKey})` and `memory.update({id, content, ifMatch})`: existing canonical publication, idempotency/concurrency and saved/indexed outcome contracts.

Declare `memory.read` for search/read and `memory.write` for creation/update. Each write-capable command requires explicit user authorization for that invocation and remains subject to the selected brain's write policy. Installation and event delivery do not grant permission to write global/team/remote memory. A read-only remote brain stays read-only.

Never automatically retry an uncertain creation with a new idempotency key or ignore an update conflict. Indexing failure is separate from a confirmed canonical save. A captured context becomes unusable when its invocation/activation or brain scope ends; asynchronous continuations must not reuse it.

## Panels, events and themes

Declare a panel with `api.registerPanel({id, title})` and an optional `ui` entry in the package manifest. Return `{panel:{id,data}}` from a command to open it. The browser entry exports a default factory receiving `ExtensionUIAPI`; `registerPanel(id, render)` supplies a renderer for the declared panel.

The render function receives a container, JSON data and a UI context with `signal`, `document`, `execute(commandId,input)` and guarded `openNote(id)`. Return a disposer for listeners/resources you own. Build UI with DOM/text APIs and shared semantic tokens. Do not import private editor controllers or create an alternative save/navigation implementation.

Named action slots are `sidebar.actions` and `note.actions`. Panel contributions, commands and shortcuts are removed on disable/reload. Closing a panel aborts its context and restores focus; document/brain changes invalidate stale UI. These APIs do not expose raw Electron, native IPC, Keychain, an arbitrary authenticated-fetch client or editor replacement.

`api.on(type, handler)` observes `document.changed`, `document.saved`, `theme.changed` and `scope.changed`. The gateway announces committed brain/permission generations; the host delivers a scope notification once per generation, independently of how many tabs register. Notifications do not gate canonical saves or transform retrieval policy, and event contexts do not authorize writes. Unsubscribe using the returned disposer. `api.onDispose(fn)` owns activation cleanup; a factory may also return a disposer. Keep cleanup idempotent.

`api.state.get(key)` / `set(key, json)` store bounded, namespaced extension state. Keep brain-specific values keyed by an appropriate scope and discard transient document data when that scope changes.

Themes use `api.registerTheme({id,name,appearance,colors})`. Colors map approved existing semantic roles, such as `surface`, `ink`, `accent`, `focus-ring` and error/graph roles, to hex values. Arbitrary CSS is not required. Selecting a palette updates tokens and redraws a visible graph without recreating the editor. Disabling it restores the built-in appearance.

## Working examples

- [Ember Plum](../examples/extensions/ember-plum/) registers a palette from an executable factory.
- [Related notes](../examples/extensions/related-notes/) registers a command/shortcut, explicitly searches the current note's title or a user-edited query, excludes the current note, and renders/open results in its own UI entry. Query construction and feature presentation live entirely in the package.

```sh
jumpybrain extensions install --source ./examples/extensions/ember-plum
jumpybrain extensions install --source ./examples/extensions/related-notes
```

Use the same public contract for optional human-facing workflows. Keep canonical parsing/publication, permissions, concurrency, provenance and retrieval semantics in their existing core/app owners. A new extension should not require an example-specific host branch.

## Reload and recovery

Reload prepares a new module revision before replacing a working activation. A failed preparation/activation is reported against the extension; a usable previous activation is retained where possible. Disable removes owned contributions and cancels supported work. The host cannot undo arbitrary filesystem/process side effects performed by trusted Node code.

For safe startup, create the `disabled` marker inside the extensions directory before starting the app. It is checked before compilation/factory loading. Remove the marker and explicitly reload when the package is repaired. This marker pauses executable packages, not canonical memory or the ordinary editor.

Node's ESM module cache cannot be unloaded. The host permits 64 module import attempts before requiring a normal guarded desktop restart; failed attempts count too. Prepared files have separate disk limits: 4 MiB per revision, at most eight retained revisions per package and 256 MiB total cache output. Recent/current/live-host revisions are protected during pruning. At the disk cap, stop the host and remove unused cache revisions before reloading. User state is separate and retained.

The host cannot preempt synchronous blocking JavaScript or contain `process.exit()` from a trusted same-process extension. Use the safe-start marker and normal process recovery for such failures; ordinary handler-error recovery is a narrower guarantee.

## Verification

Build first, then run `node --test test/extension-gateway.test.js test/extensions*.test.js` for focused package/runtime/transport checks. `npx --package=playwright node scripts/extensions-smoke.mjs` exercises the examples through the production gateway against disposable canonical Markdown and a real lexical index. `node scripts/extensions-desktop-smoke.mjs` uses the production Electron window, and the focused controller smoke covers never-settling UI promises and persisted-page lifecycle restoration. Desktop/resource checks and measured limits are recorded in the implementing task; they do not establish physical-device or assistive-technology parity, arbitrary-package safety, or a whole-app resource budget.
