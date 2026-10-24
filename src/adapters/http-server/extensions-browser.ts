import type { Dispose, ExtensionCommandResult, ExtensionDescriptor, ExtensionDocument, ExtensionEvent, ExtensionPanelRenderer, ExtensionSnapshot, ExtensionUIFactory, Json } from "../../extensions/index.js";
import type { createBrowserCommands } from "./browser-commands.js";

const preferenceKey = "jumpybrain.extensions.v1";
const tokens = new Set("ink ink-soft ink-faint surface control-fill surface-hover focus-ring accent selection-fill status-connected error-ink error-fill error-line line line-strong edge edge-link edge-end node-page node-decision node-finding node-preference node-session node-note node-unresolved edge-shadow edge-highlight node-light node-shade backdrop".split(" "));
interface Preferences { version: 1; order: string[]; shortcuts: Record<string, string>; slots: Record<string, string>; theme: string; }
export function extensionPreferences(value: unknown): Preferences {
  const raw = value as Partial<Preferences> | null;
  const strings = (input: unknown): Record<string, string> => input && typeof input === "object" && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input).filter(([key, val]) => key.length < 240 && typeof val === "string" && val.length < 120).slice(0, 200)) : {};
  return { version: 1, order: raw?.version === 1 && Array.isArray(raw.order) ? raw.order.filter((id): id is string => typeof id === "string").slice(0, 200) : [],
    shortcuts: raw?.version === 1 ? strings(raw.shortcuts) : {}, slots: raw?.version === 1 ? strings(raw.slots) : {}, theme: raw?.version === 1 && typeof raw.theme === "string" ? raw.theme : "" };
}
export function extensionThemeColors(colors: Record<string, string>): Array<[string, string]> {
  return Object.entries(colors).flatMap(([key, value]) => {
    const token = key.replace(/^--/, "");
    return tokens.has(token) && typeof value === "string" && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ? [["--" + token, value] as [string, string]] : [];
  });
}
interface Options {
  document: Document; window: Window; nonce: string;
  commands: ReturnType<typeof createBrowserCommands>;
  request<T>(url: string, options?: RequestInit): Promise<T>;
  scope(): string | null;
  currentDocument(): ExtensionDocument | null;
  openNote(id: string): Promise<boolean>;
  writable(): boolean;
  restoreTheme(): void;
  redrawGraph(): void;
  report(message: string): void;
}
interface Activation {
  descriptor: ExtensionDescriptor; controller: AbortController;
  uiController: AbortController; uiDisposers: Dispose[];
  disposers: Dispose[]; renderers: Map<string, ExtensionPanelRenderer>;
  loading?: Promise<void>; script?: HTMLScriptElement;
}
interface Panel { activation: Activation; controller: AbortController; dispose?: Dispose; origin: Element | null; documentKey: string; }

/** Desktop renderer only. Descriptor refresh is driven by companion state, never a timer. */
export function installExtensionsBrowser(options: Options) {
  const { document: doc, window: win, commands } = options;
  const settings = doc.getElementById("extension-settings")!;
  const list = doc.getElementById("extension-list")!;
  const status = doc.getElementById("extension-status")!;
  const panel = doc.getElementById("extension-panel") as HTMLDialogElement;
  const content = doc.getElementById("extension-panel-content")!;
  const title = doc.getElementById("extension-panel-title")!;
  const themeSelect = doc.getElementById("extension-theme") as HTMLSelectElement;
  let prefs = extensionPreferences(null);
  try { prefs = extensionPreferences(JSON.parse(win.localStorage.getItem(preferenceKey) || "null")); } catch { /* Device-local preferences are optional. */ }
  let activations = new Map<string, Activation>();
  let activePanel: Panel | null = null;
  let lifetime = new AbortController();
  let scope: string | null = null;
  let revision: string | null = null;
  let supported = false;
  let requestedRevision: string | null = null;
  let refresh: AbortController | null = null;
  let disposed = false;
  let suspended = false;
  let busy = false;
  let themeApplied = false;
  let themeAppearance: "light" | "dark" | null = null;
  let documentKey = "";
  let deliveredDocumentKey: string | null = null;
  let documentLifetime = new AbortController();
  let scopeLifetime = new AbortController();
  const appliedTokens = new Set<string>();
  const previousStyles = new Map<string, string>();
  const signal = lifetime.signal;
  const pendingScripts = new Map<HTMLScriptElement, (factory: ExtensionUIFactory) => void>();
  const registryTarget = win as unknown as { JumpyBrainExtensions?: { register(id: string, factory: ExtensionUIFactory): void } };
  const previousRegistry = registryTarget.JumpyBrainExtensions;
  const registry = { register(id: string, factory: ExtensionUIFactory) {
    const script = doc.currentScript as HTMLScriptElement | null;
    if (script && script.dataset.extensionId === id && typeof factory === "function") pendingScripts.get(script)?.(factory);
  } };
  registryTarget.JumpyBrainExtensions = registry;
  function persist() { try { win.localStorage.setItem(preferenceKey, JSON.stringify(prefs)); } catch { /* Tab-only fallback. */ } }
  function current(a?: Activation) { return !disposed && !suspended && supported && scope !== null && scope === options.scope() && (!a || (!a.controller.signal.aborted && activations.get(a.descriptor.id) === a)); }
  function runDispose(dispose?: Dispose) { if (dispose) { try { Promise.resolve(dispose()).catch(() => {}); } catch { /* Cleanup must continue. */ } } }
  // Trusted code can block synchronously, but an unresolved async contribution must
  // not keep its invoking control busy after its lifetime ends. Observe late returns
  // as well, so a disposer belongs to exactly the lifetime that requested it.
  function awaitDisposer(result: void | Dispose | Promise<void | Dispose>, cancellation: AbortSignal, retain: (dispose: Dispose) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let pending = true;
      const finish = () => { pending = false; cancellation.removeEventListener("abort", abort); };
      const abort = () => { if (pending) { finish(); reject(new Error("Extension UI was cancelled.")); } };
      cancellation.addEventListener("abort", abort, { once: true });
      if (cancellation.aborted) abort();
      Promise.resolve(result).then(dispose => {
        const accepted = pending && !cancellation.aborted;
        finish();
        if (typeof dispose === "function") { if (accepted) retain(dispose); else runDispose(dispose); }
        if (accepted) resolve();
      }, error => { if (pending) { finish(); reject(error); } });
    });
  }
  function message(text: string) { status.textContent = text; }
  function releaseUI(a: Activation) {
    a.uiController.abort(); a.script?.remove(); a.script = undefined; a.loading = undefined;
    a.uiController = new AbortController(); a.renderers.clear();
    for (const dispose of a.uiDisposers.splice(0).reverse()) runDispose(dispose);
  }
  function closePanel(restore = true) {
    const mounted = activePanel;
    activePanel = null;
    if (mounted) { mounted.controller.abort(); runDispose(mounted.dispose); releaseUI(mounted.activation); }
    if (panel.open) panel.close();
    content.replaceChildren();
    if (restore && mounted?.origin instanceof Element && mounted.origin.isConnected && !mounted.origin.closest("[hidden]")) (mounted.origin as HTMLElement).focus({ preventScroll: true });
  }
  function clearTheme() {
    if (!themeApplied) return;
    for (const token of appliedTokens) {
      const before = previousStyles.get(token);
      if (before) doc.documentElement.style.setProperty(token, before); else doc.documentElement.style.removeProperty(token);
    }
    appliedTokens.clear(); previousStyles.clear(); themeApplied = false; themeAppearance = null;
    options.restoreTheme(); options.redrawGraph();
  }
  function applyTheme() {
    clearTheme();
    for (const a of activations.values()) {
      const theme = a.descriptor.themes.find(item => a.descriptor.id + ":" + item.id === prefs.theme);
      if (!theme || !current(a)) continue;
      const colors = extensionThemeColors(theme.colors);
      if (!colors.length) continue;
      themeApplied = true; themeAppearance = theme.appearance;
      for (const [token, value] of colors) {
        previousStyles.set(token, doc.documentElement.style.getPropertyValue(token));
        appliedTokens.add(token); doc.documentElement.style.setProperty(token, value);
      }
      doc.documentElement.dataset.theme = theme.appearance;
      const control = doc.getElementById("color-theme");
      if (control) { const action = theme.appearance === "dark" ? "Switch to light theme" : "Switch to dark theme"; control.setAttribute("aria-label", action); control.title = action; }
      options.redrawGraph();
    }
  }
  function deactivate() {
    closePanel(false); clearTheme();
    for (const a of activations.values()) {
      a.controller.abort(); releaseUI(a);
      for (const dispose of a.disposers.splice(0).reverse()) runDispose(dispose);
    }
    activations.clear();
    for (const slot of ["sidebar.actions", "note.actions"]) doc.querySelector('[data-extension-slot="' + slot + '"]')?.replaceChildren();
  }
  async function loadUI(a: Activation) {
    if (a.loading) return a.loading;
    const uiController = a.uiController;
    const valid = () => current(a) && !uiController.signal.aborted && a.uiController === uiController;
    a.loading = (async () => {
      if (!a.descriptor.ui) throw new Error("This extension has no panel UI.");
      const url = new URL(a.descriptor.ui, win.location.origin);
      const expected = "/companion/extensions/assets/" + encodeURIComponent(a.descriptor.id) + "/" + encodeURIComponent(a.descriptor.revision) + ".js";
      if (url.origin !== win.location.origin || url.pathname !== expected || url.search || url.hash) throw new Error("Invalid extension UI asset.");
      const factory = await new Promise<ExtensionUIFactory>((resolve, reject) => {
        const script = doc.createElement("script"); a.script = script;
        script.nonce = options.nonce; script.src = url.href; script.dataset.extensionId = a.descriptor.id;
        let registered: ExtensionUIFactory | undefined;
        const stop = () => { pendingScripts.delete(script); win.clearTimeout(timer); uiController.signal.removeEventListener("abort", abort); script.remove(); };
        const abort = () => { stop(); reject(new Error("Extension UI was cancelled.")); };
        const timer = win.setTimeout(() => { stop(); reject(new Error("Extension UI took too long to load.")); }, 15_000);
        pendingScripts.set(script, factory => { registered = factory; });
        script.onload = () => { stop(); if (registered) resolve(registered); else reject(new Error("Extension UI did not register.")); };
        script.onerror = () => { stop(); reject(new Error("Extension UI is unavailable. Check the connection and reload extensions.")); };
        uiController.signal.addEventListener("abort", abort, { once: true });
        doc.head.append(script);
      });
      if (!valid()) return;
      await awaitDisposer(factory({
        registerPanel(id, render) {
          if (!valid() || !a.descriptor.panels.some(panel => panel.id === id) || a.renderers.has(id)) throw new Error("Invalid panel registration.");
          a.renderers.set(id, render);
          return () => { if (a.renderers.get(id) === render) a.renderers.delete(id); };
        },
        onDispose(dispose) { if (valid()) a.uiDisposers.push(dispose); else runDispose(dispose); },
      }), AbortSignal.any([a.controller.signal, uiController.signal]), dispose => {
        if (valid()) a.uiDisposers.push(dispose); else runDispose(dispose);
      });
    })();
    try { await a.loading; } catch (error) { if (a.uiController === uiController) a.loading = undefined; throw error; }
  }
  async function showPanel(a: Activation, id: string, data: Json) {
    const descriptor = a.descriptor.panels.find(panel => panel.id === id);
    if (!descriptor || !current(a)) throw new Error("Extension panel is unavailable.");
    const origin = activePanel?.origin || doc.activeElement;
    closePanel(false);
    const mounted: Panel = { activation: a, controller: new AbortController(), origin, documentKey };
    activePanel = mounted;
    title.textContent = descriptor.title;
    content.textContent = "Loading…";
    panel.showModal();
    (doc.getElementById("extension-panel-close") as HTMLElement).focus();
    const valid = () => activePanel === mounted && !mounted.controller.signal.aborted && current(a) && documentKey === mounted.documentKey;
    try {
      await loadUI(a);
      if (!valid()) return;
      const render = a.renderers.get(id);
      if (!render) throw new Error("Extension panel was not registered.");
      const mount = doc.createElement("div");
      content.replaceChildren(mount);
      await awaitDisposer(render(mount, data, {
        signal: mounted.controller.signal, document: options.currentDocument(),
        execute: async (commandId, input) => {
          if (!valid()) throw new Error("This panel is closed or stale.");
          return invoke(a, commandId, input ?? null, mounted.controller.signal, false);
        },
        openNote: async id => {
          if (!valid()) return false;
          return options.openNote(id);
        },
      }), AbortSignal.any([a.controller.signal, mounted.controller.signal]), dispose => {
        if (valid()) mounted.dispose = dispose; else runDispose(dispose);
      });
    } catch { if (valid()) content.textContent = "This panel could not load. Check the connection, then close it and try again."; }
  }
  async function invoke(a: Activation, commandId: string, input: Json, requestSignal?: AbortSignal, display = true): Promise<ExtensionCommandResult | void> {
    if (!current(a) || !a.descriptor.commands.some(command => command.id === commandId)) throw new Error("Extension command is unavailable.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    const capturedDocument = documentKey;
    const abortSignals = [a.controller.signal, documentLifetime.signal, ...(requestSignal ? [requestSignal] : [])];
    for (const item of abortSignals) { if (item.aborted) controller.abort(); else item.addEventListener("abort", abort, { once: true }); }
    // v1 currently declares write capability on the package; authorization never survives an invocation.
    let allowWrites = false;
    if (a.descriptor.capabilities.includes("memory.write")) {
      if (!options.writable()) { for (const item of abortSignals) item.removeEventListener("abort", abort); throw new Error("This brain is read only."); }
      allowWrites = win.confirm(a.descriptor.name + " requests permission to write to the current brain for this command. Allow this invocation?");
      if (!allowWrites) { for (const item of abortSignals) item.removeEventListener("abort", abort); return; }
    }
    try {
      const result = await options.request<ExtensionCommandResult>("/companion/extensions/invoke", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ extensionId: a.descriptor.id, commandId, input, document: options.currentDocument(), allowWrites }),
      });
      if (!current(a) || controller.signal.aborted || capturedDocument !== documentKey) return;
      if (display && result?.panel) await showPanel(a, result.panel.id, result.panel.data);
      if (result?.message) options.report(String(result.message));
      return result;
    } finally { for (const item of abortSignals) item.removeEventListener("abort", abort); }
  }
  function button(text: string, run: () => unknown, parent: HTMLElement) {
    const item = doc.createElement("button"); item.type = "button"; item.className = "quiet-button"; item.textContent = text;
    item.addEventListener("click", () => {
      if (item.disabled) return;
      item.disabled = true; item.setAttribute("aria-busy", "true");
      Promise.resolve().then(run).catch(() => {
        message("Extension action failed. Check the connection and try again.");
        if (!settings.contains(item)) options.report("Extension action failed. Check the connection and try again.");
      }).finally(() => { if (item.isConnected) { item.disabled = !current() || busy; item.removeAttribute("aria-busy"); } });
    });
    parent.append(item); return item;
  }
  function orderedCommands() {
    return [...activations.values()].flatMap(a => a.descriptor.commands.map(command => ({ a, command, id: a.descriptor.id + ":" + command.id })))
      .sort((a, b) => { const ai = prefs.order.indexOf(a.id), bi = prefs.order.indexOf(b.id); return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.id.localeCompare(b.id); });
  }
  function render() {
    const opened = new Set([...list.querySelectorAll<HTMLDetailsElement>("details[open]")].map(item => item.dataset.extensionId));
    const focused = doc.activeElement as HTMLElement | null;
    const focusKey = focused?.getAttribute("aria-label");
    const hadFocus = focused && list.contains(focused);
    list.replaceChildren(); themeSelect.replaceChildren();
    const defaultOption = doc.createElement("option"); defaultOption.value = ""; defaultOption.textContent = "Built-in appearance"; themeSelect.append(defaultOption);
    for (const slot of ["sidebar.actions", "note.actions"]) doc.querySelector('[data-extension-slot="' + slot + '"]')?.replaceChildren();
    for (const a of activations.values()) {
      for (const dispose of a.disposers.filter(dispose => commandDisposers.has(dispose))) runDispose(dispose);
      a.disposers = a.disposers.filter(dispose => !commandDisposers.has(dispose));
    }
    commandDisposers.clear();
    for (const descriptor of snapshot?.extensions || []) {
      const row = doc.createElement("details"); row.className = "extension-item"; row.dataset.extensionId = descriptor.id; row.open = opened.has(descriptor.id);
      const summary = doc.createElement("summary"); summary.textContent = descriptor.name + " · " + (descriptor.error ? "Error" : descriptor.status); row.append(summary);
      if (descriptor.error) { const error = doc.createElement("p"); error.textContent = descriptor.error; row.append(error); }
      const actions = doc.createElement("div"); actions.className = "companion-actions"; row.append(actions);
      button(descriptor.enabled ? "Disable" : "Enable", () => manage(descriptor.enabled ? "disable" : "enable", descriptor.id), actions);
      button("Remove", () => manage("remove", descriptor.id), actions);
      const a = activations.get(descriptor.id);
      if (a) for (const theme of descriptor.themes) {
        const option = doc.createElement("option"); option.value = descriptor.id + ":" + theme.id; option.textContent = descriptor.name + " · " + theme.name; themeSelect.append(option);
      }
      list.append(row);
      if (a) for (const { command, id } of orderedCommands().filter(item => item.a === a)) {
        const controls = doc.createElement("div"); controls.className = "extension-command";
        button(command.title, () => invoke(a, command.id, null), controls);
        const placement = doc.createElement("select"); placement.setAttribute("aria-label", command.title + " placement");
        for (const [value, label] of [["", "Commands only"], ["sidebar.actions", "Sidebar"], ["note.actions", "Note actions"]]) {
          const item = doc.createElement("option"); item.value = value!; item.textContent = label!; placement.append(item);
        }
        placement.value = prefs.slots[id] ?? command.slot ?? "";
        placement.addEventListener("change", () => { prefs.slots[id] = placement.value; persist(); render(); });
        const shortcut = doc.createElement("input"); shortcut.type = "text"; shortcut.maxLength = 80; shortcut.placeholder = "Mod+Shift+R";
        shortcut.setAttribute("aria-label", command.title + " shortcut"); shortcut.value = prefs.shortcuts[id] ?? command.shortcut ?? "";
        shortcut.addEventListener("change", () => { prefs.shortcuts[id] = shortcut.value; persist(); render(); });
        controls.append(placement, shortcut);
        button("Move earlier", () => { const ids = orderedCommands().map(item => item.id); const index = ids.indexOf(id); if (index > 0) [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!]; prefs.order = ids; persist(); render(); }, controls);
        row.append(controls);
      }
    }
    for (const { a, command, id } of orderedCommands()) {
      const dispose = commands.register({ id, title: command.title, shortcut: prefs.shortcuts[id] ?? command.shortcut, run: input => invoke(a, command.id, (input ?? null) as Json) });
      a.disposers.push(dispose); commandDisposers.add(dispose);
      const slot = prefs.slots[id] ?? command.slot;
      if (slot !== "sidebar.actions" && slot !== "note.actions") continue;
      const area = doc.querySelector('[data-extension-slot="' + slot + '"]') as HTMLElement | null;
      if (area) button(command.title, () => commands.execute(id), area);
    }
    themeSelect.value = prefs.theme;
    settings.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button, input, select").forEach(item => { item.disabled = busy || !current(); });
    themeSelect.disabled = !current() || busy;
    if (hadFocus && focusKey) [...list.querySelectorAll<HTMLElement>("[aria-label]")].find(item => item.getAttribute("aria-label") === focusKey)?.focus();
  }
  const commandDisposers = new Set<Dispose>();
  let snapshot: ExtensionSnapshot | null = null;
  function applySnapshot(next: ExtensionSnapshot) {
    if (next?.apiVersion !== 1 || !Array.isArray(next.extensions)) throw new Error("Unsupported extension snapshot.");
    deactivate(); commandDisposers.clear();
    snapshot = next; revision = next.revision;
    if (!next.safeMode) for (const descriptor of next.extensions) {
      if (descriptor.enabled && descriptor.status === "active") activations.set(descriptor.id, { descriptor, controller: new AbortController(), uiController: new AbortController(), uiDisposers: [], disposers: [], renderers: new Map() });
    }
    message(next.safeMode ? "Extensions are paused in safe mode." : next.extensions.length ? "" : "No extensions installed.");
    render(); applyTheme();
    documentChanged();
  }
  async function manage(action: string, id?: string) {
    if (!current() || busy) return;
    if (action === "remove" && !win.confirm("Remove this extension? Its saved extension state is retained.")) return;
    busy = true; render();
    const captured = scope;
    const requestSignal = AbortSignal.any([signal, scopeLifetime.signal]);
    refresh?.abort(); refresh = null;
    try {
      const next = await options.request<ExtensionSnapshot>("/companion/extensions/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }), signal: requestSignal });
      if (current() && scope === captured && !requestSignal.aborted) { applySnapshot(next); requestedRevision = next.revision; }
    } catch { if (current()) message("Could not update extensions. Check the connection, then reload."); }
    finally { busy = false; if (!disposed) render(); }
  }
  async function sync(nextRevision?: string) {
    if (disposed || suspended) return;
    if (!nextRevision) {
      if (supported) { supported = false; scopeLifetime.abort(); refresh?.abort(); refresh = null; deactivate(); snapshot = null; revision = null; requestedRevision = null; scope = null; deliveredDocumentKey = null; render(); }
      return;
    }
    supported = true;
    const nextScope = options.scope();
    if (nextScope !== scope) {
      scopeLifetime.abort(); scopeLifetime = new AbortController();
      refresh?.abort(); refresh = null; deactivate(); snapshot = null; revision = null; requestedRevision = null; scope = nextScope; documentKey = ""; deliveredDocumentKey = null;
      render();
    }
    documentChanged();
    if (!current() || busy || !nextRevision || (nextRevision === revision) || (nextRevision === requestedRevision)) return;
    requestedRevision = nextRevision;
    deactivate(); render();
    refresh?.abort(); const request = new AbortController(); refresh = request;
    const captured = scope;
    message("Loading extensions…");
    try {
      const next = await options.request<ExtensionSnapshot>("/companion/extensions", { signal: request.signal });
      if (current() && scope === captured && refresh === request && !request.signal.aborted) applySnapshot(next);
    } catch { if (current() && refresh === request && !request.signal.aborted) message("Extensions are unavailable. Reload to retry."); }
    finally { if (refresh === request) refresh = null; }
  }
  async function emit(event: ExtensionEvent) {
    if (!snapshot || !current()) return;
    try { await options.request("/companion/extensions/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event }), signal: AbortSignal.any([signal, scopeLifetime.signal]) }); } catch { /* Observation never gates editing or saving. */ }
  }
  function documentChanged() {
    if (disposed || suspended) return;
    const currentDoc = options.currentDocument();
    const key = JSON.stringify(currentDoc);
    if (key !== documentKey) {
      documentLifetime.abort(); documentLifetime = new AbortController();
      documentKey = key; closePanel(false);
    }
    // The first descriptor activation may follow the document transition. Keep
    // delivery across descriptor-only revisions, including error status updates.
    if (snapshot && current() && deliveredDocumentKey !== key) {
      deliveredDocumentKey = key;
      void emit({ type: "document.changed", document: currentDoc });
    }
  }
  doc.getElementById("extension-panel-close")!.addEventListener("click", () => closePanel(), { signal });
  panel.addEventListener("cancel", event => { event.preventDefault(); closePanel(); }, { signal });
  panel.addEventListener("close", () => { if (!panel.open && activePanel) closePanel(); }, { signal });
  doc.getElementById("extension-reload")!.addEventListener("click", () => void manage("reload"), { signal });
  themeSelect.addEventListener("change", () => { prefs.theme = themeSelect.value; persist(); applyTheme(); void emit({ type: "theme.changed", theme: prefs.theme || doc.documentElement.dataset.theme }); }, { signal });
  doc.getElementById("color-theme")?.addEventListener("click", () => { prefs.theme = ""; persist(); clearTheme(); themeSelect.value = ""; void emit({ type: "theme.changed", theme: doc.documentElement.dataset.theme }); }, { signal });
  const themeObserver = new MutationObserver(() => {
    if (themeApplied && themeAppearance) {
      if (doc.documentElement.dataset.theme !== themeAppearance) doc.documentElement.dataset.theme = themeAppearance;
      const control = doc.getElementById("color-theme");
      if (control) { const action = themeAppearance === "dark" ? "Switch to light theme" : "Switch to dark theme"; control.setAttribute("aria-label", action); control.title = action; }
    } else void emit({ type: "theme.changed", theme: doc.documentElement.dataset.theme });
  });
  themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  win.addEventListener("storage", event => { if (!suspended && (event.key === preferenceKey || event.key === null)) { try { prefs = extensionPreferences(event.newValue ? JSON.parse(event.newValue) : null); render(); applyTheme(); } catch { /* Ignore corrupt cross-tab preferences. */ } } }, { signal });
  function suspend() {
    if (disposed || suspended) return;
    suspended = true; themeObserver.disconnect(); refresh?.abort(); refresh = null;
    scopeLifetime.abort(); documentLifetime.abort(); deactivate();
    snapshot = null; revision = null; requestedRevision = null; scope = null;
    documentKey = ""; deliveredDocumentKey = null;
    render();
  }
  function resume() {
    if (disposed || !suspended) return;
    suspended = false;
    try { prefs = extensionPreferences(JSON.parse(win.localStorage.getItem(preferenceKey) || "null")); } catch { /* Keep tab-local preferences. */ }
    themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // Companion pageshow re-registers the tab before the next existing sync.
    // Resuming this controller alone must not issue authenticated requests.
  }
  function dispose() {
    if (disposed) return;
    disposed = true; themeObserver.disconnect(); refresh?.abort(); scopeLifetime.abort(); documentLifetime.abort(); deactivate(); lifetime.abort();
    if (registryTarget.JumpyBrainExtensions === registry) registryTarget.JumpyBrainExtensions = previousRegistry;
  }
  win.addEventListener("pagehide", event => { if (event.persisted) suspend(); else dispose(); }, { signal });
  win.addEventListener("pageshow", event => { if (event.persisted) resume(); }, { signal });
  return { sync, documentChanged, emit, closePanel, dispose };
}
