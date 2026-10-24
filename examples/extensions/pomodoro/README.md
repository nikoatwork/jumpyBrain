# Pomodoro

A small focus companion built entirely with the public extension API. Start a 25-minute focus interval, pause/resume or reset it, then take a 5-minute break. The timer opens from the sidebar and works with any built-in or extension palette, including Candy Pink.

From a jumpyBrain checkout or unpacked distribution, using a CLI with executable-extension support. Copy the example once to a permanent directory before linking it:

```sh
mkdir -p "$HOME/jumpybrain-extensions"
cp -R ./examples/extensions/pomodoro "$HOME/jumpybrain-extensions/"
jumpybrain extensions install --source "$HOME/jumpybrain-extensions/pomodoro"
```

In the Mac app, use **Reload extensions** in **Settings → Extensions** if needed, then select **Pomodoro** in the sidebar. Select **Start focus**. **Pause** preserves the remaining time; **Reset** restores the selected interval. **Focus** and **Break** select and reset an interval. After an interval ends, the next mode is ready and waits for you to start it. There are no automatic cycles, sounds, notifications or memory writes.

Closing the panel keeps a running timer running. It stores an absolute wall-clock deadline in namespaced device-local extension state, so reopening, a delayed browser tick, computer sleep or restarting the app catches up to elapsed time. A finished interval advances once to the next ready mode; time spent away does not silently count more sessions. Changing the system clock changes wall-clock timing. While paused, time does not elapse.

There is one timer per installed extension registry, shared across brains and tabs. Commands are serialized by the host factory; a second open panel refreshes its view when reopened or when you use a control. The panel does not continuously poll other tabs. Disabling/removing the extension stops its UI and timers but retains saved state; re-enabling/reinstalling restores the deadline. This is convenience state outside canonical Markdown, not a reliable alarm service.

## Authoring notes

- `main.ts` registers a panel, a `sidebar.actions` command and a control command. It persists a versioned JSON state with `api.state`; it owns no background timers and never retains a command context.
- `ui.ts` renders through `registerPanel`, calls `context.execute` for explicit controls and once on completion, and computes the countdown from `Date.now()` rather than decrementing a counter. It removes its interval, DOM listeners and nodes on panel abort/disposal and UI factory disposal. Late command results cannot update a closed panel.
- The panel uses semantic color tokens and DOM/text APIs. No private editor, gateway, Electron or authenticated fetch API is imported. API v1 offers sidebar/note action slots and panels; it has no persistent top-right timer widget slot.
- Both entries import types from `jumpybrain/extensions.js`. No package-local dependencies or app rebuild are needed. Keep the linked source directory, edit it, and explicitly reload to rebuild.

Executable extensions are trusted code running with the host's permissions. An empty capability list means this example requests no memory operations; it does not sandbox arbitrary code. Ordinary hosted browser clients do not load desktop extensions. See [the extension guide](../../../docs/extensions.md) for installation scope, recovery and the public contracts.
