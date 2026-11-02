import { constants } from "node:fs";
import { access, lstat, mkdir, open, opendir, unlink } from "node:fs/promises";
import path from "node:path";
import { type BackendLease, processAlive, readPrivateJson, readRuntimeGeneration } from "./index.js";

/** Retention protocol 1. Pin before readiness; an updater must retire before inspecting pins. */
export async function pinBackendRuntime(root: string, lease: BackendLease): Promise<void> {
  const runtime = path.resolve(path.dirname(lease.executable), "../..");
  const owner = await lstat(runtime);
  const retiring = path.join(runtime, ".retiring"), directory = path.join(runtime, ".backend-pins");
  const check = async () => {
    if (!lease.runtimeGeneration || await readRuntimeGeneration(lease.executable) !== lease.runtimeGeneration) throw new Error("Runtime changed before readiness; retry from the installed runtime.");
    try { await access(retiring); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    throw new Error("Backend runtime is retired; start from the installed runtime.");
  };
  await check();
  // Even unpinnable runtimes must reject a stale launch generation first.
  if (owner.uid !== process.getuid?.() || !(owner.mode & 0o200)) return;
  await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new Error("Unsafe runtime pins.");
  const file = path.join(directory, lease.instanceId + ".json");
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const published = await handle.stat({ bigint: true });
  try { await handle.writeFile(JSON.stringify({ root, ...lease })); await handle.sync(); } finally { await handle.close(); }
  // Immutable dead pins are disposable; keep inspection bounded and retain uncertainty.
  try {
    const entries = await opendir(directory); let count = 0;
    for await (const entry of entries) {
      if (++count > 256) break;
      if (!/^[a-f0-9-]{36}\.json$/.test(entry.name)) continue;
      const file = path.join(directory, entry.name), previous = await readPrivateJson(file) as BackendLease;
      if (previous && Number.isSafeInteger(previous.pid) && previous.pid > 1 && !processAlive(previous.pid)) await unlink(file);
    }
  } catch { /* Unknown/busy pins stay retained. */ }
  // A retirement racing publication either sees this live pin, or prevents startup.
  await check();
  const current = await lstat(file, { bigint: true });
  if (current.dev !== published.dev || current.ino !== published.ino) throw new Error("Runtime pin moved before readiness; retry from the installed runtime.");
}
