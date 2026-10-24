import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  assertId, ExtensionPackageError, extensionState, isExtensionSafeMode, jsonValue,
  listExtensions, prepareExtensions, preparedFile, setExtensionEnabled, removeExtension,
  text, leasePreparedExtension, confirmExtensionActivation, type InstalledExtension,
} from "../../adapters/extensions/index.js";
import { EXTENSION_THEME_ROLES } from "../../extensions/index.js";
import type {
  Dispose, ExtensionAPI, ExtensionCommand, ExtensionCommandResult, ExtensionContext,
  ExtensionDescriptor, ExtensionEvent, ExtensionEventName, ExtensionFactory, ExtensionPanel,
  ExtensionSnapshot, ExtensionTheme, Json,
} from "../../extensions/index.js";

export { DEFAULT_EXTENSION_DIRECTORY, installExtension, checkExtension, listExtensions, setExtensionEnabled, removeExtension, prepareExtensions } from "../../adapters/extensions/index.js";
export type { InstalledExtension, ExtensionDirectoryOptions } from "../../adapters/extensions/index.js";
export interface ExtensionHost {
  snapshot(): ExtensionSnapshot;
  reload(): Promise<ExtensionSnapshot>;
  setEnabled(id: string, enabled: boolean): Promise<ExtensionSnapshot>;
  remove(id: string): Promise<ExtensionSnapshot>;
  dispose(): Promise<void>;
  invoke(extensionId: string, commandId: string, input: unknown, context: ExtensionContext): Promise<ExtensionCommandResult | void>;
  emit(event: ExtensionEvent, context: ExtensionContext): Promise<void>;
  cancelObservations(): void;
  asset(id: string, revision: string): Promise<string>;
}
type EventHandler = (event: ExtensionEvent, context: ExtensionContext) => void | Promise<void>;
interface Activation {
  entry: InstalledExtension;
  revision: string;
  phase: "activating" | "active" | "disposed";
  controller: AbortController;
  commands: Map<string, ExtensionCommand>;
  panels: Map<string, ExtensionPanel>;
  themes: Map<string, ExtensionTheme>;
  events: Map<ExtensionEventName, Set<EventHandler>>;
  disposers: Dispose[];
  release: Dispose;
  error?: string;
}
const eventNames: ExtensionEventName[] = ["document.changed", "document.saved", "theme.changed", "scope.changed"];
// The renderer applies these existing semantic color roles; layout/CSS injection is not an API.
const themeTokens: ReadonlySet<string> = new Set(EXTENSION_THEME_ROLES);
const clone = <T>(value: T): T => structuredClone(value);
const stale = () => new ExtensionPackageError("Extension activation or invocation is no longer current.", { code: "extension_stale" });

/** A bounded wait contains async failures, but cannot preempt trusted synchronous Node code. */
async function bounded<T>(work: Promise<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      abort = () => reject(stale());
      if (signal.aborted) { reject(stale()); return; }
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => reject(new ExtensionPackageError("Extension operation timed out.")), milliseconds);
    })]);
  } finally { clearTimeout(timer); if (abort) signal.removeEventListener("abort", abort); }
}

export async function createExtensionHost({ directory, safeMode: explicitSafeMode = false }: { directory: string; safeMode?: boolean }): Promise<ExtensionHost> {
  directory = path.resolve(directory);
  let disposed = false;
  let safeMode = await isExtensionSafeMode(directory, explicitSafeMode);
  let revision = randomUUID();
  let entries: InstalledExtension[] = [];
  let recovery: string | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let imports = 0;
  let scope: { generation: number; brainId: string } | undefined;
  let notifiedGeneration: number | undefined;
  const active = new Map<string, Activation>();
  const errors = new Map<string, string>();
  const pending = new Set<AbortController>();
  const observations = new Set<AbortController>();
  const changed = () => { revision = randomUUID(); };
  function live(): void { if (disposed) throw new ExtensionPackageError("Extension host is disposed."); }
  function guard(activation: Activation): void {
    live();
    if (safeMode || explicitSafeMode || existsSync(path.join(directory, "disabled")) || activation.phase === "disposed" || activation.controller.signal.aborted || (activation.phase === "active" && active.get(activation.entry.manifest.id) !== activation)) throw stale();
  }
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.catch(() => {}).then(work);
    queue = next;
    return next;
  }
  async function cleanup(activation: Activation): Promise<void> {
    if (activation.phase === "disposed") return;
    activation.phase = "disposed";
    activation.controller.abort();
    const disposers = activation.disposers.splice(0).reverse();
    activation.commands.clear(); activation.panels.clear(); activation.themes.clear(); activation.events.clear();
    await Promise.all(disposers.map(async (dispose) => {
      try { await bounded(Promise.resolve().then(dispose), new AbortController().signal, 1000); } catch { /* Other cleanup must still run. */ }
    }));
    await activation.release();
  }
  function api(activation: Activation): ExtensionAPI {
    const register = <T>(map: Map<string, T>, id: string, value: T): Dispose => {
      guard(activation); assertId(id);
      if (map.has(id)) throw new ExtensionPackageError("Duplicate extension contribution ID.");
      if (map.size >= 100) throw new ExtensionPackageError("Extension contribution limit reached.");
      map.set(id, value);
      if (activation.phase === "active") changed();
      let removed = false;
      return () => { if (removed) return; removed = true; if (map.get(id) === value) { map.delete(id); if (activation.phase === "active") changed(); } };
    };
    return Object.freeze({
      version: 1 as const,
      registerCommand(command: ExtensionCommand) {
        guard(activation);
        if (!command || typeof command.handler !== "function" || (command.slot !== undefined && command.slot !== "sidebar.actions" && command.slot !== "note.actions")) throw new ExtensionPackageError("Invalid extension command.");
        const contribution: ExtensionCommand = { id: command.id, title: text(command.title, "command title"), handler: command.handler, ...(command.shortcut === undefined ? {} : { shortcut: text(command.shortcut, "command shortcut", 80) }), ...(command.slot === undefined ? {} : { slot: command.slot }) };
        return register(activation.commands, command.id, contribution);
      },
      registerPanel(panel: ExtensionPanel) {
        guard(activation);
        return register(activation.panels, panel.id, { id: panel.id, title: text(panel.title, "panel title") });
      },
      registerTheme(theme: ExtensionTheme) {
        guard(activation);
        if (!theme || !["light", "dark"].includes(theme.appearance) || !theme.colors || Array.isArray(theme.colors) || typeof theme.colors !== "object") throw new ExtensionPackageError("Invalid extension theme.");
        const colors: Record<string, string> = {};
        for (const [key, value] of Object.entries(theme.colors)) {
          const token = key.replace(/^--/, "");
          if (!themeTokens.has(token) || typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) || Object.hasOwn(colors, token)) throw new ExtensionPackageError("Invalid extension theme color token or value.");
          colors[token] = value;
        }
        return register(activation.themes, theme.id, { id: theme.id, name: text(theme.name, "theme name"), appearance: theme.appearance, colors });
      },
      on(type: ExtensionEventName, handler: EventHandler) {
        guard(activation);
        if (!eventNames.includes(type) || typeof handler !== "function") throw new ExtensionPackageError("Invalid extension event registration.");
        const handlers = activation.events.get(type) ?? new Set<EventHandler>();
        if (handlers.size >= 100) throw new ExtensionPackageError("Extension event subscription limit reached.");
        handlers.add(handler); activation.events.set(type, handlers);
        return () => { handlers.delete(handler); };
      },
      onDispose(dispose: Dispose) {
        guard(activation);
        if (typeof dispose !== "function" || activation.disposers.length >= 200) throw new ExtensionPackageError("Invalid extension disposer or disposal limit reached.");
        activation.disposers.push(dispose);
      },
      state: Object.freeze({
        async get(key: string) { guard(activation); const result = await extensionState(directory, activation.entry.manifest.id, key, () => guard(activation)); guard(activation); return result; },
        async set(key: string, value: Json) { guard(activation); await extensionState(directory, activation.entry.manifest.id, key, () => guard(activation), jsonValue(value)); guard(activation); },
      }),
    });
  }
  async function activate(entry: InstalledExtension): Promise<Activation> {
    if (!entry.prepared) throw new ExtensionPackageError("Extension has no prepared revision; reload the package.");
    if (imports >= 64) throw new ExtensionPackageError("Extension module reload limit reached; restart the desktop host.");
    if (await isExtensionSafeMode(directory, explicitSafeMode)) throw new ExtensionPackageError("Extension safe mode is enabled.");
    const activation: Activation = { entry: clone(entry), revision: entry.prepared.revision, phase: "activating", controller: new AbortController(), commands: new Map(), panels: new Map(), themes: new Map(), events: new Map(), disposers: [], release: await leasePreparedExtension(directory, entry.manifest.id, entry.prepared.revision) };
    try {
      guard(activation);
      imports++;
      const module = await bounded(import(pathToFileURL(preparedFile(directory, entry.manifest.id, activation.revision, "main.mjs")).href), activation.controller.signal, 3000);
      guard(activation);
      if (typeof module.default !== "function") throw new ExtensionPackageError("Extension main must export a default factory.");
      const factory: ExtensionFactory = module.default;
      const result = Promise.resolve().then(() => factory(api(activation))).then(async (dispose) => {
        if (dispose !== undefined && typeof dispose !== "function") throw new ExtensionPackageError("Extension factory must return a disposer or void.");
        if (dispose) {
          if (activation.phase === "disposed") { try { await dispose(); } catch { /* Late factory cleanup. */ } }
          else activation.disposers.push(dispose);
        }
      });
      await bounded(result, activation.controller.signal, 3000);
      guard(activation);
      return activation;
    } catch (error) { await cleanup(activation); throw error; }
  }
  function snapshot(): ExtensionSnapshot {
    const extensions: ExtensionDescriptor[] = entries.map((entry) => {
      const activation = active.get(entry.manifest.id);
      const manifest = activation?.entry.manifest ?? entry.manifest;
      const current = activation?.revision ?? entry.prepared?.revision ?? "";
      const enabled = entry.enabled && !safeMode && !disposed;
      const error = errors.get(entry.manifest.id) ?? activation?.error ?? entry.error;
      return {
        id: manifest.id, name: manifest.name, version: manifest.version, enabled: entry.enabled,
        status: enabled ? (activation ? "active" : "error") : "disabled", ...(error ? { error } : {}), revision: current,
        commands: activation ? [...activation.commands.values()].map(({ handler: _handler, ...command }) => clone(command)) : [],
        panels: activation ? [...activation.panels.values()].map(clone) : [], themes: activation ? [...activation.themes.values()].map(clone) : [],
        ...(activation && manifest.ui ? { ui: `/companion/extensions/assets/${manifest.id}/${current}.js` } : {}), capabilities: [...(manifest.capabilities ?? [])],
      };
    });
    return { apiVersion: 1, revision, safeMode, extensions, ...(recovery ? { recovery } : {}) };
  }
  async function refresh(compile: boolean): Promise<ExtensionSnapshot> {
    live();
    safeMode = await isExtensionSafeMode(directory, explicitSafeMode);
    recovery = undefined;
    try { entries = await listExtensions({ directory }); }
    catch (error) {
      if (!safeMode) throw error;
      entries = [];
      recovery = "Extension registry is unreadable. Safe mode is active; preserve registry.json and registry.backup.json and restore a valid copy before enabling extensions.";
    }
    if (!safeMode && (compile || entries.some((entry) => entry.enabled && !entry.prepared))) entries = await prepareExtensions({ directory, safeMode: explicitSafeMode });
    safeMode = await isExtensionSafeMode(directory, explicitSafeMode);
    for (const [id, activation] of active) {
      if (safeMode || !entries.some((entry) => entry.manifest.id === id && entry.enabled)) { active.delete(id); await cleanup(activation); errors.delete(id); }
    }
    if (!safeMode) for (const entry of entries.filter((entry) => entry.enabled)) {
      const previous = active.get(entry.manifest.id);
      if (entry.error) { errors.set(entry.manifest.id, entry.error); if (previous) continue; }
      if (previous?.revision === entry.prepared?.revision) continue;
      try {
        const next = await activate(entry);
        try { await confirmExtensionActivation(directory, entry); }
        catch (error) { await cleanup(next); throw error; }
        next.phase = "active";
        active.set(entry.manifest.id, next);
        errors.delete(entry.manifest.id);
        if (previous) await cleanup(previous);
      } catch (error) {
        errors.set(entry.manifest.id, "Extension activation failed; fix the local factory and reload.");
        if (!previous && entry.successful && entry.successful.prepared.revision !== entry.prepared?.revision) {
          try {
            const fallback = await activate({ ...entry, ...entry.successful });
            fallback.phase = "active";
            active.set(entry.manifest.id, fallback);
          } catch { /* Keep the diagnostic; never publish success for a failed fallback. */ }
        }
      }
    }
    changed();
    return snapshot();
  }
  function observeScope(context: ExtensionContext): boolean {
    const current = context.scope;
    if (!current || !Number.isSafeInteger(current.generation) || current.generation < 0 || typeof current.brainId !== "string" || !current.brainId || typeof current.tabId !== "string" || !current.tabId) throw new ExtensionPackageError("Invalid extension invocation scope.");
    if (scope && (current.generation < scope.generation || (current.generation === scope.generation && current.brainId !== scope.brainId))) throw stale();
    if (!scope || current.generation > scope.generation) {
      for (const controller of pending) controller.abort();
      scope = { generation: current.generation, brainId: current.brainId };
      return true;
    }
    return false;
  }
  function scoped(activation: Activation, context: ExtensionContext, observational: boolean): { context: ExtensionContext; close(): void; check(): void } {
    guard(activation);
    observeScope(context);
    const controller = new AbortController();
    const signal = AbortSignal.any([context.signal, activation.controller.signal, controller.signal]);
    const capturedScope = Object.freeze({ ...context.scope });
    const allowWrites = !observational && context.allowWrites === true;
    function check(): void {
      guard(activation);
      if (signal.aborted || scope?.generation !== capturedScope.generation || scope?.brainId !== capturedScope.brainId || context.scope.generation !== capturedScope.generation || context.scope.brainId !== capturedScope.brainId || context.scope.tabId !== capturedScope.tabId) throw stale();
    }
    async function memory<T>(capability: "memory.read" | "memory.write", work: () => Promise<T>): Promise<T> {
      check();
      if (!activation.entry.manifest.capabilities?.includes(capability)) throw new ExtensionPackageError(`Extension lacks ${capability} capability.`, { code: "extension_permission_denied" });
      if (capability === "memory.write" && (!allowWrites || context.allowWrites !== true)) throw new ExtensionPackageError("Extension writes require an explicit authorized command invocation.", { code: "extension_permission_denied" });
      const result = await work(); check(); return result;
    }
    const wrapped: ExtensionContext = Object.freeze({
      signal, scope: capturedScope, document: context.document ? Object.freeze({ id: text(context.document.id, "document ID", 2048), title: text(context.document.title || "Untitled", "document title", 1024) }) : null, allowWrites,
      memory: Object.freeze({
        search(input: { query: string; limit?: number }) {
          return memory("memory.read", () => {
            const query = text(input?.query, "search query", 2000);
            const limit = input.limit ?? 10;
            if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ExtensionPackageError("Extension search limit must be between 1 and 50.");
            return context.memory.search({ query, limit });
          });
        },
        read(id: string) { return memory("memory.read", () => context.memory.read(text(id, "document ID", 2048))); },
        create(input: import("../../extensions/index.js").ExtensionCreateInput) {
          return memory("memory.write", () => {
            if (!input || input.type !== "note" || typeof input.body !== "string" || Buffer.byteLength(input.body) > 262144 || (input.title !== undefined && (typeof input.title !== "string" || input.title.length > 1024))) throw new ExtensionPackageError("Invalid extension note creation.");
            return context.memory.create({ type: "note", ...(input.title === undefined ? {} : { title: input.title }), body: input.body, idempotencyKey: text(input.idempotencyKey, "idempotency key", 200) });
          });
        },
        update(input: import("../../extensions/index.js").ExtensionUpdateInput) {
          return memory("memory.write", () => {
            if (!input || typeof input.content !== "string" || Buffer.byteLength(input.content) > 262144) throw new ExtensionPackageError("Invalid extension note update.");
            return context.memory.update({ id: text(input.id, "document ID", 2048), content: input.content, ifMatch: text(input.ifMatch, "document hash", 256) });
          });
        },
      }),
    });
    pending.add(controller);
    return { context: wrapped, check, close() { controller.abort(); pending.delete(controller); } };
  }
  async function notify(event: ExtensionEvent, context: ExtensionContext, deadline = Date.now() + 3000): Promise<void> {
    live();
    if (!event || !eventNames.includes(event.type)) throw new ExtensionPackageError("Unknown extension event.");
    const controller = new AbortController();
    observations.add(controller);
    context = { ...context, signal: AbortSignal.any([context.signal, controller.signal]) };
    try {
      const transitioned = observeScope(context);
      if (transitioned && event.type !== "scope.changed") await notify({ type: "scope.changed" }, context, deadline);
      if (event.type === "scope.changed") {
        if (notifiedGeneration === context.scope.generation) return;
        notifiedGeneration = context.scope.generation;
      }
      const observed = jsonValue(event) as unknown as ExtensionEvent;
      handlers: for (const activation of active.values()) for (const handler of [...(activation.events.get(event.type) ?? [])]) {
        if (context.signal.aborted || Date.now() >= deadline) break handlers;
        const invocation = scoped(activation, context, true);
        try { await bounded(Promise.resolve().then(() => { invocation.check(); return handler(clone(observed), invocation.context); }), invocation.context.signal, Math.max(1, deadline - Date.now())); invocation.check(); }
        catch {
          if (!invocation.context.signal.aborted) {
            const message = "Extension event handler failed; reload the package if it persists.";
            if (activation.error !== message) { activation.error = message; changed(); }
          }
        }
        finally { invocation.close(); }
      }
    } finally { controller.abort(); observations.delete(controller); }
  }
  const host: ExtensionHost = {
    snapshot,
    cancelObservations() { for (const controller of observations) controller.abort(); },
    reload: () => serial(() => refresh(true)),
    setEnabled: (id, enabled) => serial(async () => { live(); await setExtensionEnabled({ directory, id, enabled }); return refresh(enabled); }),
    remove: (id) => serial(async () => { live(); await removeExtension({ directory, id }); errors.delete(id); return refresh(false); }),
    async dispose() {
      if (disposed) return;
      // Fence immediately, even when another management operation is queued.
      disposed = true;
      host.cancelObservations();
      for (const controller of pending) controller.abort();
      for (const activation of active.values()) activation.controller.abort();
      await serial(async () => { const previous = [...active.values()]; active.clear(); await Promise.all(previous.map(cleanup)); changed(); });
    },
    async invoke(extensionId, commandId, input, context) {
      live(); assertId(extensionId); assertId(commandId);
      if (observeScope(context)) await host.emit({ type: "scope.changed" }, context);
      const activation = active.get(extensionId);
      if (!activation) throw new ExtensionPackageError("Extension is unavailable.");
      guard(activation);
      const command = activation.commands.get(commandId);
      if (!command) throw new ExtensionPackageError("Unknown extension command.");
      const invocation = scoped(activation, context, false);
      try {
        invocation.check();
        const result = await bounded(Promise.resolve().then(() => { invocation.check(); return command.handler(input === undefined ? null : jsonValue(input), invocation.context); }), invocation.context.signal, 15000);
        invocation.check();
        if (result === undefined) return;
        const output = jsonValue(result) as unknown as ExtensionCommandResult;
        if (!output || Array.isArray(output) || typeof output !== "object" || Object.keys(output).some((key) => key !== "panel" && key !== "message") || (output.message !== undefined && (typeof output.message !== "string" || output.message.length > 4000))) throw new ExtensionPackageError("Invalid extension command result.");
        if (output.panel !== undefined && (!output.panel || typeof output.panel !== "object" || Array.isArray(output.panel) || Object.keys(output.panel).some((key) => key !== "id" && key !== "data") || !activation.panels.has(output.panel.id) || !activation.entry.manifest.ui || !Object.hasOwn(output.panel, "data"))) throw new ExtensionPackageError("Command result refers to an unavailable panel.");
        return output;
      } catch (error) {
        const message = "Extension command failed; retry or reload the package.";
        if (activation.error !== message) { activation.error = message; changed(); }
        if (error instanceof ExtensionPackageError) throw error;
        throw new ExtensionPackageError("Extension command failed.", { cause: error, code: "extension_failed" });
      } finally { invocation.close(); }
    },
    emit: (event, context) => notify(event, context),
    async asset(id, assetRevision) {
      live(); assertId(id);
      const activation = active.get(id);
      if (!activation || activation.revision !== assetRevision || !activation.entry.manifest.ui) throw new ExtensionPackageError("Unknown, disabled or stale extension asset.");
      guard(activation);
      const result = await readFile(preparedFile(directory, id, assetRevision, "ui.js"), "utf8");
      guard(activation);
      return result;
    },
  };
  await refresh(false);
  return host;
}
