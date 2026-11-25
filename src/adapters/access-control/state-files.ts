import { randomUUID } from "node:crypto";
import { mkdir, lstat, open, readFile, rename, unlink, link, rmdir } from "node:fs/promises";
import path from "node:path";

// Private operational state files under `<root>/.jumpybrain`: access keys and browser sessions.
export class AccessError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "AccessError"; }
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; } };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const privateMode = (mode: number) => (mode & 0o077) === 0;

/** Run `operation` while holding `<base>.lock` in a private state directory. An exclusive hard link
 * publishes an already complete lock candidate, so a killed writer leaves a recoverable PID/nonce. */
export async function withPrivateStateLock<T>(directory: string, base: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, base + ".lock");
  const owner = { pid: process.pid, nonce: randomUUID() };
  const candidate = path.join(directory, base + "." + owner.nonce + ".candidate");
  const candidateHandle = await open(candidate, "wx", 0o600);
  try { await candidateHandle.writeFile(JSON.stringify(owner)); await candidateHandle.sync(); }
  finally { await candidateHandle.close(); }
  let acquired = false;
  const deadline = Date.now() + 5000;
  try {
    while (!acquired) {
      try {
        await link(candidate, lock);
        acquired = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new AccessError("access_busy", "Access state is busy; no change was made.");
        // Unknown/incomplete locks fail closed. A confirmed dead owner is recoverable.
        try {
          const before = await lstat(lock);
          if (!before.isFile() || before.isSymbolicLink() || !privateMode(before.mode) || before.size > 1024) throw new Error();
          const previous = JSON.parse(await readFile(lock, "utf8"));
          if (Number.isSafeInteger(previous.pid) && previous.pid > 0 && /^[a-f0-9-]{36}$/.test(previous.nonce) && !alive(previous.pid)) {
            const guard = lock + ".reap." + previous.nonce;
            await mkdir(guard, { mode: 0o700 });
            try {
              const current = JSON.parse(await readFile(lock, "utf8"));
              if (current.nonce === previous.nonce && !alive(current.pid)) await unlink(lock);
            } finally { await rmdir(guard).catch(() => {}); }
          }
        } catch {}
        await delay(15);
      }
    }
  } finally { await unlink(candidate).catch(() => {}); }
  try { return await operation(); }
  finally { try { if (JSON.parse(await readFile(lock, "utf8")).nonce === owner.nonce) await unlink(lock); } catch {} }
}
/** Atomically replace `file` with fsynced private JSON. Call while holding the matching lock. */
export async function publishPrivateState(directory: string, base: string, file: string, value: unknown): Promise<void> {
  let temporary: string | undefined = path.join(directory, base + "." + randomUUID() + ".tmp");
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(value, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file); temporary = undefined;
    try { const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } } catch {}
  } finally { if (temporary) await unlink(temporary).catch(() => {}); }
}
/** The private `.jumpybrain` state directory of a root; a symlinked or non-directory entry fails closed. */
export async function privateStateDirectory(root: string): Promise<string> {
  const directory = path.join(root, ".jumpybrain");
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AccessError("access_state_unsafe", "Access state directory is unsafe.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return directory;
}
