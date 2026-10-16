import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { IndexMemoryResult } from "../../types.js";

export interface RemoteIndexState {
  version: 1;
  stale: boolean;
  lastWriteAt?: string;
  lastIndexedAt?: string;
  documents?: number;
  qmdCollection?: string;
}

export function defaultRemoteIndexState(): RemoteIndexState {
  return { version: 1, stale: true };
}

const stateQueues = new Map<string, Promise<unknown>>();

function serializeState<T>(root: string, operation: () => Promise<T>): Promise<T> {
  let key = path.resolve(root);
  // App results may canonicalize a symlinked server root; share that same queue.
  try { key = realpathSync(key); } catch { /* A not-yet-created root uses its absolute path. */ }
  const previous = stateQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  stateQueues.set(key, next);
  void next.finally(() => {
    if (stateQueues.get(key) === next) stateQueues.delete(key);
  }).catch(() => {});
  return next;
}

export function readRemoteIndexState(root: string): Promise<RemoteIndexState> {
  return serializeState(root, () => readState(root));
}

async function readState(root: string): Promise<RemoteIndexState> {
  const stateFile = remoteIndexStateFile(root);
  try {
    const parsed = JSON.parse(await readFile(stateFile, "utf8")) as Partial<RemoteIndexState>;
    return normalizeRemoteIndexState(parsed);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") return defaultRemoteIndexState();
    throw new Error("Failed to read remote index state.");
  }
}

export function writeRemoteIndexState(root: string, state: RemoteIndexState): Promise<RemoteIndexState> {
  return serializeState(root, () => writeState(root, state));
}

async function writeState(root: string, state: RemoteIndexState): Promise<RemoteIndexState> {
  const stateFile = remoteIndexStateFile(root);
  const temporary = `${stateFile}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, stateFile);
  } catch {
    throw new Error("Failed to write remote index state.");
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
  return state;
}

export function markRemoteIndexFresh(root: string, result: IndexMemoryResult, now = new Date().toISOString(), startedAt?: string): Promise<RemoteIndexState> {
  return serializeState(root, async () => {
    const current = await readState(root);
    return writeState(root, {
      ...current,
      version: 1,
      stale: result.readiness?.freshness === "stale" || Boolean(startedAt && current.lastWriteAt && current.lastWriteAt >= startedAt),
      lastIndexedAt: now,
      documents: result.documents,
      qmdCollection: result.qmdCollection,
    });
  });
}

export function markRemoteIndexStale(root: string, now = new Date().toISOString()): Promise<RemoteIndexState> {
  return serializeState(root, async () => {
    const current = await readState(root);
    return writeState(root, { ...current, version: 1, stale: true, lastWriteAt: now });
  });
}

/** Backend failure is not a canonical write; preserve the genuine write timestamp. */
export function invalidateRemoteIndex(root: string): Promise<RemoteIndexState> {
  return serializeState(root, async () => writeState(root, { ...await readState(root), stale: true }));
}

function remoteIndexStateFile(root: string): string {
  return path.join(root, ".jumpybrain", "remote", "index-state.json");
}

function normalizeRemoteIndexState(value: Partial<RemoteIndexState>): RemoteIndexState {
  return {
    version: 1,
    stale: typeof value.stale === "boolean" ? value.stale : true,
    lastWriteAt: typeof value.lastWriteAt === "string" ? value.lastWriteAt : undefined,
    lastIndexedAt: typeof value.lastIndexedAt === "string" ? value.lastIndexedAt : undefined,
    documents: typeof value.documents === "number" ? value.documents : undefined,
    qmdCollection: typeof value.qmdCollection === "string" ? value.qmdCollection : undefined,
  };
}
