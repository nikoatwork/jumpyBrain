import { indexMemory as appIndexMemory } from "../local-memory/index.js";
import type { IndexMemoryResult } from "../../types.js";
import { markRemoteIndexFresh, readRemoteIndexState, writeRemoteIndexState, type RemoteIndexState } from "./state.js";

export const REMOTE_AUTO_INDEX_INTERVAL_MS = 5 * 60 * 1000;

type LogLevel = "info" | "warn" | "error";
export type RemoteAutoIndexLogger = (level: LogLevel, event: string, details?: Record<string, unknown>) => void;

export interface RemoteIndexRunResult {
  result: IndexMemoryResult;
  index: RemoteIndexState;
}

export interface RemoteIndexRunner {
  indexNow(reason?: string): Promise<RemoteIndexRunResult>;
  isIndexing(): boolean;
}

export interface RemoteAutoIndexer {
  tick(): Promise<"indexed" | "skipped-not-stale" | "failed">;
  stop(): void;
}

export function createRemoteIndexRunner(options: {
  root: string;
  indexMemory?: (root: string) => Promise<IndexMemoryResult>;
  markFresh?: (root: string, result: IndexMemoryResult) => Promise<RemoteIndexState>;
  logger?: RemoteAutoIndexLogger;
}): RemoteIndexRunner {
  const indexMemory = options.indexMemory ?? appIndexMemory;
  const markFresh = options.markFresh ?? markRemoteIndexFresh;
  const logger = options.logger ?? defaultAutoIndexLogger;
  let inFlight: Promise<RemoteIndexRunResult> | undefined;

  return {
    indexNow(reason = "manual") {
      if (inFlight) {
        logger("warn", "overlap-joined", { reason });
        return inFlight;
      }
      const startedAt = new Date().toISOString();
      logger("info", "start", { reason });
      inFlight = indexMemory(options.root)
        .then(async (result) => {
          const index = options.markFresh ? await markFresh(result.root, result) : await markFreshUnlessNewerWrite(result.root, result, startedAt);
          logger("info", "success", { reason, documents: result.documents, qmdCollection: result.qmdCollection, stale: index.stale });
          return { result, index };
        })
        .catch((error) => {
          logger("error", "failure", { reason, message: error instanceof Error ? error.message : String(error) });
          throw error;
        })
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
    isIndexing: () => inFlight !== undefined,
  };
}

export function startRemoteAutoIndexer(options: {
  root: string;
  indexRunner: RemoteIndexRunner;
  intervalMs?: number;
  readState?: (root: string) => Promise<RemoteIndexState>;
  logger?: RemoteAutoIndexLogger;
  startTimer?: boolean;
}): RemoteAutoIndexer {
  const intervalMs = options.intervalMs ?? REMOTE_AUTO_INDEX_INTERVAL_MS;
  const readState = options.readState ?? readRemoteIndexState;
  const logger = options.logger ?? defaultAutoIndexLogger;
  let stopped = false;

  const tick = async (): Promise<"indexed" | "skipped-not-stale" | "failed"> => {
    if (stopped) return "skipped-not-stale";
    try {
      const state = await readState(options.root);
      if (!state.stale) {
        logger("info", "skipped-not-stale", { lastIndexedAt: state.lastIndexedAt });
        return "skipped-not-stale";
      }
      await options.indexRunner.indexNow("auto");
      return "indexed";
    } catch (error) {
      logger("error", "tick-failed", { message: error instanceof Error ? error.message : String(error) });
      return "failed";
    }
  };

  const timer = options.startTimer === false ? undefined : setInterval(() => { void tick(); }, intervalMs);
  timer?.unref?.();

  return {
    tick,
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}

async function markFreshUnlessNewerWrite(root: string, result: IndexMemoryResult, startedAt: string): Promise<RemoteIndexState> {
  const current = await readRemoteIndexState(root);
  if (current.lastWriteAt && current.lastWriteAt >= startedAt) {
    return writeRemoteIndexState(root, {
      ...current,
      version: 1,
      stale: true,
      lastIndexedAt: new Date().toISOString(),
      documents: result.documents,
      qmdCollection: result.qmdCollection,
    });
  }
  return markRemoteIndexFresh(root, result);
}

export function defaultAutoIndexLogger(_level: LogLevel, _event: string, _details: Record<string, unknown> = {}): void {
  // App use cases are side-effect free by default; server/adapters inject real logging.
}
