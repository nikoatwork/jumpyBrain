import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

export async function readRemoteIndexState(root: string): Promise<RemoteIndexState> {
  const stateFile = remoteIndexStateFile(root);
  try {
    const parsed = JSON.parse(await readFile(stateFile, "utf8")) as Partial<RemoteIndexState>;
    return normalizeRemoteIndexState(parsed);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") return defaultRemoteIndexState();
    throw new Error(`Failed to read remote index state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeRemoteIndexState(root: string, state: RemoteIndexState): Promise<RemoteIndexState> {
  const stateFile = remoteIndexStateFile(root);
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export async function markRemoteIndexFresh(root: string, result: IndexMemoryResult, now = new Date().toISOString()): Promise<RemoteIndexState> {
  const current = await readRemoteIndexState(root);
  return writeRemoteIndexState(root, {
    ...current,
    version: 1,
    stale: false,
    lastIndexedAt: now,
    documents: result.documents,
    qmdCollection: result.qmdCollection,
  });
}

export async function markRemoteIndexStale(root: string, now = new Date().toISOString()): Promise<RemoteIndexState> {
  const current = await readRemoteIndexState(root);
  return writeRemoteIndexState(root, {
    ...current,
    version: 1,
    stale: true,
    lastWriteAt: now,
  });
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
