import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, lstat, open, readFile, realpath, rename, unlink, link, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKEND_PROTOCOL = 2 as const;
export interface BackendIdentity { executable: string; executableHash: string; build: string; version: string; }
export interface BackendLease extends BackendIdentity { protocol: 2; rootId: string; pid: number; instanceId: string; startedAt: string; }
export interface BackendDescriptor extends BackendLease { root: string; url: string; token: string; }
export class BackendHostError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "BackendHostError"; }
}
export const rootIdentity = (root: string) => createHash("sha256").update(root).digest("hex");
export const processAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; } };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkDirectory(directory: string, create: boolean) {
  if (create) await mkdir(directory, { recursive: false, mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
  try { const stat = await lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new BackendHostError("backend_state_unsafe", "Backend state directory is unsafe."); }
  catch (error) { if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
}
export async function backendPaths(rootArg: string, create = false) {
  const root = await realpath(path.resolve(rootArg));
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new BackendHostError("invalid_root", "A memory directory is required.");
  const support = path.join(root, ".jumpybrain"), directory = path.join(support, "backend");
  await checkDirectory(support, create); await checkDirectory(directory, create);
  return { root, directory, lease: path.join(directory, "owner.json"), descriptor: path.join(directory, "connection.json"), log: path.join(directory, "backend.log") };
}
async function readPrivateJson(file: string): Promise<unknown | undefined> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 2 || (stat.mode & 0o077) !== 0 || stat.size > 16384)
      throw new BackendHostError("backend_state_unsafe", "Backend state must be bounded private regular files.");
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw new BackendHostError("backend_state_invalid", "Backend state is invalid; inspect it before recovery."); }
}
function validLease(value: unknown): value is BackendLease {
  const item = value as BackendLease;
  return !!item && item.protocol === 2 && /^[a-f0-9]{64}$/.test(item.rootId) && Number.isSafeInteger(item.pid) && item.pid > 0
    && /^[a-f0-9-]{36}$/.test(item.instanceId) && typeof item.executable === "string" && path.isAbsolute(item.executable)
    && /^[a-f0-9]{64}$/.test(item.executableHash) && typeof item.build === "string" && item.build.length > 0 && item.build.length < 200
    && typeof item.version === "string" && item.version.length > 0 && item.version.length < 100 && Number.isFinite(Date.parse(item.startedAt));
}
export async function readBackendLease(root: string): Promise<BackendLease | undefined> {
  const paths = await backendPaths(root), value = await readPrivateJson(paths.lease);
  if (value === undefined) return undefined;
  if (!validLease(value) || value.rootId !== rootIdentity(paths.root)) throw new BackendHostError("backend_state_invalid", "Backend ownership state does not match this brain.");
  return value;
}
export async function readBackendDescriptor(root: string): Promise<BackendDescriptor | undefined> {
  const paths = await backendPaths(root), value = await readPrivateJson(paths.descriptor) as BackendDescriptor | undefined;
  if (value === undefined) return undefined;
  let endpoint: URL;
  try { endpoint = new URL(value.url); } catch { throw new BackendHostError("backend_state_invalid", "Backend endpoint is malformed."); }
  if (!validLease(value) || value.rootId !== rootIdentity(paths.root) || value.root !== paths.root || typeof value.token !== "string"
    || !/^[a-zA-Z0-9_-]{40,100}$/.test(value.token) || endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1"
    || !endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== "/" || endpoint.search || endpoint.hash || endpoint.origin !== value.url)
    throw new BackendHostError("backend_state_invalid", "Backend connection state does not match this brain.");
  return value;
}
async function privateJson(file: string, value: unknown) {
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(directory: string) {
  try { const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } } catch {}
}
export async function currentBackendIdentity(executableArgument?: string): Promise<BackendIdentity> {
  const executable = await realpath(executableArgument ?? fileURLToPath(new URL("../../server/daemon.js", import.meta.url)));
  const buildFile = fileURLToPath(new URL("../diagnostics/build-info.json", import.meta.url));
  const info = JSON.parse(await readFile(buildFile, "utf8")) as { version: string; build: string };
  if (typeof info.version !== "string" || !info.version || typeof info.build !== "string" || !info.build) throw new BackendHostError("backend_runtime_missing", "Build the runtime before starting its backend.");
  return { executable, executableHash: createHash("sha256").update(await readFile(executable)).digest("hex"), version: info.version, build: info.build };
}
/** Fully write a candidate, then hard-link it exclusively: no empty lock window. */
export async function acquireBackendLease(root: string, identity: BackendIdentity, instanceId = randomUUID()): Promise<BackendLease | undefined> {
  const paths = await backendPaths(root, true);
  const lease: BackendLease = { ...identity, protocol: 2, rootId: rootIdentity(paths.root), pid: process.pid, instanceId, startedAt: new Date().toISOString() };
  const candidate = path.join(paths.directory, "owner." + instanceId + ".candidate");
  await privateJson(candidate, lease);
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await link(candidate, paths.lease); await syncDirectory(paths.directory); return lease; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const previous = await readBackendLease(root);
      if (!previous) continue;
      if (processAlive(previous.pid)) return undefined;
      // Serialize reapers for the immutable dead generation. A crashed reaper
      // before unlink fails closed; it never makes a second live owner possible.
      const guard = path.join(paths.directory, "reap." + previous.instanceId);
      try { await mkdir(guard, { mode: 0o700 }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await delay(25); continue;
      }
      try {
        const current = await readBackendLease(root);
        if (current?.instanceId === previous.instanceId && !processAlive(current.pid)) {
          await unlink(paths.lease); await syncDirectory(paths.directory);
        }
      } finally { await rmdir(guard).catch(() => {}); }
    }
    throw new BackendHostError("backend_recovery_busy", "Backend ownership recovery is busy; inspect the confirmed dead generation before retrying.");
  } finally { await unlink(candidate).catch(() => {}); }
}
export async function publishBackendDescriptor(descriptor: BackendDescriptor) {
  const paths = await backendPaths(descriptor.root, true), lease = await readBackendLease(descriptor.root);
  if (lease?.instanceId !== descriptor.instanceId || lease.pid !== process.pid) throw new BackendHostError("backend_owner_changed", "Backend ownership changed before readiness.");
  const temporary = path.join(paths.directory, "connection." + descriptor.instanceId + ".tmp");
  await privateJson(temporary, descriptor);
  try { await rename(temporary, paths.descriptor); await syncDirectory(paths.directory); }
  finally { await unlink(temporary).catch(() => {}); }
}
export async function releaseBackendLease(root: string, instanceId: string) {
  const paths = await backendPaths(root), current = await readBackendLease(root);
  if (current?.instanceId !== instanceId || current.pid !== process.pid) return;
  const descriptor = await readBackendDescriptor(root);
  if (descriptor?.instanceId === instanceId) await unlink(paths.descriptor).catch(error => { if (error.code !== "ENOENT") throw error; });
  await unlink(paths.lease); await syncDirectory(paths.directory);
}
export async function verifyBackendReady(descriptor: BackendDescriptor, timeoutMs = 1500): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(descriptor.url + "/_backend/ready", { headers: { Authorization: "Bearer " + descriptor.token }, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
  } catch { return false; }
  if (!response.ok) { await response.body?.cancel(); return false; }
  const reader = response.body?.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) for (;;) {
    const next = await reader.read(); if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > 16384) { await reader.cancel(); throw new BackendHostError("backend_identity_mismatch", "Backend readiness response exceeds its bound."); }
    chunks.push(next.value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let ready: Record<string, unknown>;
  try { ready = JSON.parse(text); } catch { throw new BackendHostError("backend_identity_mismatch", "Backend readiness response is malformed."); }
  for (const field of ["protocol", "instanceId", "rootId", "pid", "executable", "executableHash", "build", "version"] as const)
    if (ready[field] !== descriptor[field]) throw new BackendHostError("backend_identity_mismatch", "The endpoint is not the registered root owner.");
  return true;
}
export async function spawnRootBackend(root: string, identity: BackendIdentity): Promise<void> {
  const paths = await backendPaths(root, true);
  const stat = await lstat(paths.log).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
  if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0)) throw new BackendHostError("backend_state_unsafe", "Backend log destination is unsafe.");
  const log = await open(paths.log, stat && stat.size > 256 * 1024 ? "w" : "a", 0o600);
  try {
    const child = spawn(process.execPath, [identity.executable], {
      env: { ...process.env, JUMPYBRAIN_BACKEND_ROOT: paths.root }, detached: true,
      stdio: ["ignore", log.fd, log.fd],
    });
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
  } finally { await log.close(); }
}
