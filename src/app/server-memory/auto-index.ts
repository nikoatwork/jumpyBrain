import { indexMemory as appIndexMemory } from "../local-memory/index.js";
import type { IndexMemoryOptions, IndexMemoryResult } from "../../types.js";
import { markRemoteIndexFresh, readRemoteIndexState, type RemoteIndexState } from "./state.js";

export const REMOTE_AUTO_INDEX_INTERVAL_MS = 5 * 60 * 1000;

type LogLevel = "info" | "warn" | "error";
export type RemoteAutoIndexLogger = (level: LogLevel, event: string, details?: Record<string, unknown>) => void;

export interface RemoteIndexRunResult {
  result: IndexMemoryResult;
  index: RemoteIndexState;
}

export interface RemoteIndexRunner {
  indexNow(reason?: string, options?: Pick<IndexMemoryOptions, "rebuild">): Promise<RemoteIndexRunResult>;
  isIndexing(): boolean;
}

export interface RemoteAutoIndexer {
  tick(): Promise<"indexed" | "skipped-not-stale" | "failed">;
  stop(): void;
}

export function createRemoteIndexRunner(options: {
  root: string;
  indexMemory?: (root: string, options?: IndexMemoryOptions) => Promise<IndexMemoryResult>;
  markFresh?: typeof markRemoteIndexFresh;
  logger?: RemoteAutoIndexLogger;
}): RemoteIndexRunner {
  const indexMemory = options.indexMemory ?? appIndexMemory;
  const markFresh = options.markFresh ?? markRemoteIndexFresh;
  const logger = options.logger ?? defaultAutoIndexLogger;
  let inFlight: Promise<RemoteIndexRunResult> | undefined;

  function indexNow(reason = "manual", indexOptions: Pick<IndexMemoryOptions, "rebuild"> = {}): Promise<RemoteIndexRunResult> {
    if (inFlight) {
      logger("warn", "overlap-joined", { reason });
      // A rebuild request must not silently join an incremental run.
      if (indexOptions.rebuild) return inFlight.then(() => indexNow(reason, indexOptions));
      return inFlight;
    }
    const startedAt = new Date().toISOString();
    logger("info", "start", { reason });
    inFlight = indexMemory(options.root, indexOptions)
      .then(async (result) => {
        const index = await markFresh(result.root, result, new Date().toISOString(), startedAt);
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
  }

  return {
    indexNow,
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

export function defaultAutoIndexLogger(_level: LogLevel, _event: string, _details: Record<string, unknown> = {}): void {
  // App use cases are side-effect free by default; server/adapters inject real logging.
}
