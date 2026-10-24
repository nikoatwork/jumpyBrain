import { access, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionManifest, Json } from "../../extensions/index.js";
import { assertId, checkedFile, ExtensionPackageError, jsonValue, validateManifest } from "./validation.js";

export const DEFAULT_EXTENSION_DIRECTORY = path.join(homedir(), "Library/Application Support/jumpyBrain Companion/extensions");
export interface ExtensionDirectoryOptions { directory: string; }
export interface PreparedExtension { revision: string; }
export interface InstalledExtension { manifest: ExtensionManifest; source: string; enabled: boolean; prepared?: PreparedExtension; successful?: { manifest: ExtensionManifest; prepared: PreparedExtension }; error?: string; }
export interface ExtensionRegistry { version: 1; entries: InstalledExtension[]; }
const queues = new Map<string, Promise<unknown>>();

export async function atomicJson(file: string, value: unknown, guard: () => void = () => {}): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
    guard();
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}
/** Serialize host/CLI updates, including separate Node processes. Never steal a live lock. */
export async function withRegistryLock<T>(directory: string, work: () => Promise<T>): Promise<T> {
  const root = path.resolve(directory);
  const previous = queues.get(root) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lock = path.join(root, ".registry-lock");
    let acquired = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await mkdir(lock, { mode: 0o700 }); acquired = true; break; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        // A killed process may leave a lock behind. Missing owner gets a grace period.
        // Recovery itself is exclusive and re-reads the owner: two waiters must not
        // delete a newly acquired lock based on the same stale owner observation.
        const recovery = `${lock}.recovery`;
        let recovering = false;
        try {
          await mkdir(recovery, { mode: 0o700 }); recovering = true;
          const owner = JSON.parse(await readFile(path.join(lock, "owner.json"), "utf8"));
          if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
            try { process.kill(owner.pid, 0); } catch (failure) { if ((failure as NodeJS.ErrnoException).code === "ESRCH") await rm(lock, { recursive: true, force: true }); }
          }
        } catch { if (recovering && Date.now() - (await stat(lock).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs > 30000) await rm(lock, { recursive: true, force: true }); }
        finally { if (recovering) await rm(recovery, { recursive: true, force: true }); }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    if (!acquired) throw new ExtensionPackageError("Extension registry is busy; retry after the current management operation.");
    try { await atomicJson(path.join(lock, "owner.json"), { pid: process.pid }); return await work(); }
    finally { await rm(lock, { recursive: true, force: true }); }
  });
  queues.set(root, pending);
  try { return await pending; } finally { if (queues.get(root) === pending) queues.delete(root); }
}
function validateRegistry(value: unknown): ExtensionRegistry {
  const registry = value as ExtensionRegistry;
  if (!registry || registry.version !== 1 || !Array.isArray(registry.entries) || registry.entries.length > 100) throw new ExtensionPackageError("Invalid extension registry.");
  const ids = new Set<string>();
  return { version: 1, entries: registry.entries.map((entry) => {
    const manifest = validateManifest(entry.manifest);
    if (ids.has(manifest.id) || typeof entry.source !== "string" || !path.isAbsolute(entry.source) || typeof entry.enabled !== "boolean" || (entry.prepared && !/^[a-f0-9-]{36}$/.test(entry.prepared.revision))) throw new ExtensionPackageError("Invalid extension registry entry.");
    let successful: InstalledExtension["successful"];
    if (entry.successful) {
      const successfulManifest = validateManifest(entry.successful.manifest);
      if (successfulManifest.id !== manifest.id || !/^[a-f0-9-]{36}$/.test(entry.successful.prepared?.revision)) throw new ExtensionPackageError("Invalid successful extension revision.");
      successful = { manifest: successfulManifest, prepared: { revision: entry.successful.prepared.revision } };
    }
    ids.add(manifest.id);
    return { manifest, source: entry.source, enabled: entry.enabled, ...(entry.prepared ? { prepared: { revision: entry.prepared.revision } } : {}), ...(successful ? { successful } : {}), ...(entry.error ? { error: "Extension preparation failed; fix the local package and reload." } : {}) };
  }) };
}
export async function readRegistry(directory: string): Promise<ExtensionRegistry> {
  let missing = false;
  try { return validateRegistry(JSON.parse(await readFile(path.join(directory, "registry.json"), "utf8"))); }
  catch (error) { missing = (error as NodeJS.ErrnoException).code === "ENOENT"; }
  try { return validateRegistry(JSON.parse(await readFile(path.join(directory, "registry.backup.json"), "utf8"))); }
  catch (error) {
    if (missing && (error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, entries: [] };
    throw new ExtensionPackageError("Extension registry is unreadable; restore registry.json or its backup. Safe mode remains available.");
  }
}
export async function writeRegistry(directory: string, registry: ExtensionRegistry): Promise<void> {
  const validated = validateRegistry(registry);
  // Backup is independently atomic and always a complete known-good registry.
  await atomicJson(path.join(directory, "registry.backup.json"), validated);
  await atomicJson(path.join(directory, "registry.json"), validated);
}
/** Record only a factory-validated candidate that still belongs to this registry entry. */
export async function confirmExtensionActivation(directory: string, candidate: InstalledExtension): Promise<void> {
  await withRegistryLock(directory, async () => {
    const registry = await readRegistry(directory);
    const entry = registry.entries.find(item => item.manifest.id === candidate.manifest.id);
    if (!entry?.enabled || !candidate.prepared || entry.prepared?.revision !== candidate.prepared.revision
      || JSON.stringify(entry.manifest) !== JSON.stringify(candidate.manifest)) throw new ExtensionPackageError("Extension candidate changed during activation; reload.");
    if (entry.successful?.prepared.revision === candidate.prepared.revision) return;
    entry.successful = { manifest: candidate.manifest, prepared: candidate.prepared };
    await writeRegistry(directory, registry);
  });
}
export async function isExtensionSafeMode(directory: string, explicit = false): Promise<boolean> {
  if (explicit) return true;
  try { await access(path.join(directory, "disabled")); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
export async function readLocalPackage(source: string): Promise<{ source: string; manifest: ExtensionManifest }> {
  if (!source || /^(?:https?:|git\+|npm:)/i.test(source)) throw new ExtensionPackageError("Only explicitly installed local package directories are supported.");
  const root = await realpath(path.resolve(source));
  if (!(await stat(root)).isDirectory()) throw new ExtensionPackageError("Extension source must be a local directory.");
  const manifestPath = await checkedFile(root, "jumpybrain-extension.json");
  if ((await stat(manifestPath)).size > 16384) throw new ExtensionPackageError("Extension manifest exceeds its size limit.");
  let value: unknown;
  try { value = JSON.parse(await readFile(manifestPath, "utf8")); } catch { throw new ExtensionPackageError("Extension manifest must contain valid JSON."); }
  const manifest = validateManifest(value);
  await checkedFile(root, manifest.main);
  if (manifest.ui) await checkedFile(root, manifest.ui);
  return { source: root, manifest };
}
export function preparedFile(directory: string, id: string, revision: string, kind: "main.mjs" | "ui.js"): string {
  assertId(id);
  if (!/^[a-f0-9-]{36}$/.test(revision)) throw new ExtensionPackageError("Invalid extension revision.");
  return path.join(directory, "cache", id, revision, kind);
}
export async function leasePreparedExtension(directory: string, id: string, revision: string): Promise<() => Promise<void>> {
  return withRegistryLock(directory, async () => {
    const file = preparedFile(directory, id, revision, "main.mjs");
    await access(file);
    const lease = path.join(path.dirname(file), `.lease-${process.pid}-${randomUUID()}`);
    await atomicJson(lease, { pid: process.pid });
    return async () => { await rm(lease, { force: true }); };
  });
}
/** Keep the last three revisions plus live host leases; fail closed at eight revisions. */
export async function pruneExtensionCache(directory: string, id: string, preserve: string[] = []): Promise<number> {
  assertId(id);
  const root = path.join(directory, "cache", id);
  const revisions = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  // Preparation holds the directory lock, so these can only be interrupted leftovers.
  for (const item of revisions) if (item.isDirectory() && /^\.[a-f0-9-]{36}\.tmp$/.test(item.name)) await rm(path.join(root, item.name), { recursive: true, force: true });
  const candidates = await Promise.all(revisions.filter((item) => item.isDirectory() && /^[a-f0-9-]{36}$/.test(item.name)).map(async (item) => ({ revision: item.name, timestamp: (await stat(path.join(root, item.name))).mtimeMs })));
  candidates.sort((a, b) => b.timestamp - a.timestamp);
  let retained = 0;
  for (const [index, item] of candidates.entries()) {
    const folder = path.join(root, item.revision);
    let leased = false;
    for (const name of await readdir(folder)) {
      const match = /^\.lease-(\d+)-/.exec(name);
      if (!match) continue;
      try { process.kill(Number(match[1]), 0); leased = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") await rm(path.join(folder, name), { force: true }); else leased = true; }
    }
    if (index < 3 || preserve.includes(item.revision) || leased) retained++;
    else await rm(folder, { recursive: true, force: true });
  }
  return retained;
}
export async function cacheBytes(directory: string): Promise<number> {
  const root = path.join(directory, "cache");
  let bytes = 0;
  const packages = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  for (const item of packages.filter((item) => item.isDirectory())) {
    const revisions = await readdir(path.join(root, item.name), { withFileTypes: true });
    for (const revision of revisions.filter((item) => item.isDirectory())) for (const kind of ["main.mjs", "ui.js"]) {
      bytes += (await stat(path.join(root, item.name, revision.name, kind)).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return { size: 0 }; throw error; })).size;
    }
  }
  return bytes;
}
export async function listExtensions({ directory }: ExtensionDirectoryOptions): Promise<InstalledExtension[]> {
  return (await readRegistry(directory)).entries;
}
/** Compile in disposable storage, without registering or executing package code. */
export async function checkExtension(source: string): Promise<{ ok: true }> {
  const local = await readLocalPackage(source);
  const directory = await mkdtemp(path.join(tmpdir(), "jumpybrain-extension-check-"));
  try {
    const { prepareExtension } = await import("./prepare.js");
    await prepareExtension(directory, { ...local, enabled: true });
    return { ok: true };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function installExtension({ directory, source }: ExtensionDirectoryOptions & { source: string }): Promise<InstalledExtension> {
  return withRegistryLock(directory, async () => {
    const local = await readLocalPackage(source);
    const registry = await readRegistry(directory);
    if (registry.entries.some((entry) => entry.manifest.id === local.manifest.id)) throw new ExtensionPackageError("Extension ID is already installed; use reload or remove it first.");
    if (registry.entries.length >= 100) throw new ExtensionPackageError("Extension registry limit reached.");
    const entry: InstalledExtension = { ...local, enabled: true };
    if (!await isExtensionSafeMode(directory)) {
      const { prepareExtension } = await import("./prepare.js");
      entry.prepared = await prepareExtension(directory, entry);
    }
    registry.entries.push(entry);
    await writeRegistry(directory, registry);
    return entry;
  });
}
export async function setExtensionEnabled({ directory, id, enabled }: ExtensionDirectoryOptions & { id: string; enabled: boolean }): Promise<InstalledExtension> {
  assertId(id);
  if (typeof enabled !== "boolean") throw new ExtensionPackageError("Enabled must be a boolean.");
  return withRegistryLock(directory, async () => {
    const registry = await readRegistry(directory);
    const entry = registry.entries.find((entry) => entry.manifest.id === id);
    if (!entry) throw new ExtensionPackageError("Unknown extension.");
    entry.enabled = enabled;
    await writeRegistry(directory, registry);
    return entry;
  });
}
export async function removeExtension({ directory, id }: ExtensionDirectoryOptions & { id: string }): Promise<void> {
  assertId(id);
  await withRegistryLock(directory, async () => {
    const registry = await readRegistry(directory);
    if (!registry.entries.some((entry) => entry.manifest.id === id)) throw new ExtensionPackageError("Unknown extension.");
    registry.entries = registry.entries.filter((entry) => entry.manifest.id !== id);
    await writeRegistry(directory, registry);
    // State deliberately survives removal. Cached ESM may still be held by a live host.
  });
}
export async function prepareExtensions({ directory, safeMode = false }: ExtensionDirectoryOptions & { safeMode?: boolean }): Promise<InstalledExtension[]> {
  return withRegistryLock(directory, async () => {
    const registry = await readRegistry(directory);
    if (await isExtensionSafeMode(directory, safeMode)) return registry.entries;
    for (const entry of registry.entries.filter((entry) => entry.enabled)) {
      try {
        const local = await readLocalPackage(entry.source);
        if (local.manifest.id !== entry.manifest.id) throw new ExtensionPackageError("Installed extension ID changed; remove and install explicitly.");
        if (await isExtensionSafeMode(directory, safeMode)) break;
        const { prepareExtension } = await import("./prepare.js");
        const prepared = await prepareExtension(directory, { ...entry, ...local });
        entry.manifest = local.manifest;
        entry.prepared = prepared;
        delete entry.error;
      } catch { entry.error = "Extension preparation failed; fix the local package and reload."; }
    }
    await writeRegistry(directory, registry);
    return registry.entries;
  });
}
export async function extensionState(directory: string, id: string, key: string, guard: () => void, ...value: [] | [Json]): Promise<Json | undefined> {
  assertId(id);
  if (typeof key !== "string" || !key || key.length > 160 || ["__proto__", "constructor", "prototype"].includes(key)) throw new ExtensionPackageError("Invalid extension state key.");
  return withRegistryLock(directory, async () => {
    guard();
    const file = path.join(directory, "state", `${id}.json`);
    let state: Record<string, Json> = Object.create(null);
    try {
      const parsed = jsonValue(JSON.parse(await readFile(file, "utf8")), 1048576);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Invalid state");
      state = parsed;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new ExtensionPackageError("Extension state is unreadable; restore its state file."); }
    guard();
    if (!value.length) return Object.hasOwn(state, key) ? jsonValue(state[key]) : undefined;
    Object.defineProperty(state, key, { value: jsonValue(value[0]), enumerable: true, configurable: true, writable: true });
    jsonValue(state, 1048576);
    await atomicJson(file, state, guard);
    guard();
    return undefined;
  });
}
