import { ensureMemoryIndexed, indexMemory as appIndexMemory } from "../local-memory/index.js";
import { checkExecution, readExecution, executionScope, EXECUTION_LIMITS, MemoryExecutionError } from "../../adapters/qmd/index.js";
import type { IndexMemoryOptions, IndexMemoryResult } from "../../types.js";
import { invalidateRemoteIndex, markRemoteIndexFresh, readRemoteIndexState, type RemoteIndexState } from "./state.js";

export const REMOTE_AUTO_INDEX_INTERVAL_MS = 5 * 60 * 1000;

type LogLevel = "info" | "warn" | "error";
export type RemoteAutoIndexLogger = (level: LogLevel, event: string, details?: Record<string, unknown>) => void;

export interface RemoteIndexRunResult {
  result: IndexMemoryResult;
  index: RemoteIndexState;
}

export interface RemoteIndexRunner {
  indexNow(reason?: string, options?: Pick<IndexMemoryOptions, "rebuild" | "signal" | "timeoutMs">): Promise<RemoteIndexRunResult>;
  isIndexing(): boolean;
  stop?(): Promise<void>;
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
  timeoutMs?: number;
}): RemoteIndexRunner {
  const indexMemory = options.indexMemory ?? appIndexMemory;
  const markFresh = options.markFresh ?? markRemoteIndexFresh;
  const logger = options.logger ?? defaultAutoIndexLogger;
  type Job = { promise: Promise<RemoteIndexRunResult>; controller: AbortController; waiters: number };
  let inFlight: Job | undefined;
  let stopped = false;

  function launch(reason: string, rebuild?: boolean): Job {
    const startedAt = new Date().toISOString();
    logger("info", "start", { reason });
    const job: Job = { controller: new AbortController(), waiters: 0, promise: undefined! };
    inFlight = job;
    const operation = reason === "auto" && !options.indexMemory ? ensureMemoryIndexed : indexMemory;
    job.promise = (async () => operation(options.root, { rebuild, signal: job.controller.signal, timeoutMs: options.timeoutMs }))()
      .then(async result => {
        checkExecution(job.controller.signal);
        const current = reason === "auto" && !result.work && result.readiness?.freshness === "fresh"
          ? await readExecution(readRemoteIndexState(result.root), job.controller.signal) : undefined;
        const index = current && !current.stale ? current
          : await markFresh(result.root, result, new Date().toISOString(), startedAt);
        logger("info", "success", { reason, documents: result.documents, qmdCollection: result.qmdCollection, stale: index.stale });
        return { result, index };
      }).catch(async error => {
        await invalidateRemoteIndex(options.root).catch(() => {});
        logger("error", "failure", { reason, code: error instanceof MemoryExecutionError ? error.code : "index_failed" });
        throw error;
      }).finally(() => { if (inFlight === job) inFlight = undefined; });
    return job;
  }

  function join(job: Job, signal: AbortSignal): Promise<RemoteIndexRunResult> {
    checkExecution(signal);
    if (job.waiters >= EXECUTION_LIMITS.queue) throw new MemoryExecutionError("execution_overloaded");
    job.waiters++;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error?: unknown, result?: RemoteIndexRunResult) => {
        if (done) return;
        done = true;
        signal.removeEventListener("abort", abort);
        job.waiters--;
        if (job.waiters === 0 && error && signal.aborted) job.controller.abort(new MemoryExecutionError("execution_aborted"));
        if (error) reject(error); else resolve(result!);
      };
      const abort = () => finish(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      job.promise.then(result => finish(undefined, result), error => finish(error));
      if (signal.aborted) abort();
    });
  }

  async function indexNow(reason = "manual", indexOptions: Pick<IndexMemoryOptions, "rebuild" | "signal" | "timeoutMs"> = {}): Promise<RemoteIndexRunResult> {
    if (stopped) throw new MemoryExecutionError("execution_aborted");
    const scope = executionScope("index", { ...indexOptions, timeoutMs: indexOptions.timeoutMs ?? options.timeoutMs });
    try {
      checkExecution(scope.signal);
      while (inFlight) {
        if (inFlight.controller.signal.aborted) {
          // A new caller is not an owner of a previously abandoned job. Wait
          // for child/lock cleanup, then start fresh under its own deadline.
          await readExecution(inFlight.promise.catch(() => {}), scope.signal);
          continue;
        }
        logger("warn", "overlap-joined", { reason });
        const result = await join(inFlight, scope.signal);
        // Explicit rebuild waits for successful in-flight work, with the SAME
        // caller deadline. Recheck after await: another rebuild may have started.
        if (!indexOptions.rebuild) return result;
      }
      checkExecution(scope.signal);
      if (stopped) throw new MemoryExecutionError("execution_aborted");
      return await join(launch(reason, indexOptions.rebuild), scope.signal);
    } finally { scope.dispose(); }
  }

  return {
    indexNow,
    isIndexing: () => inFlight !== undefined,
    async stop() {
      stopped = true;
      const job = inFlight;
      job?.controller.abort(new MemoryExecutionError("execution_aborted"));
      await job?.promise.catch(() => {});
    },
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
  const callers = new Set<AbortController>();

  const tick = async (): Promise<"indexed" | "skipped-not-stale" | "failed"> => {
    if (stopped) return "skipped-not-stale";
    const controller = new AbortController();
    callers.add(controller);
    const scope = executionScope("index", { signal: controller.signal });
    try {
      const state = await readExecution(readState(options.root), scope.signal);
      // Actual canonical discovery/repair belongs to the joined, admitted runner,
      // never an unbounded preflight scan trusting the legacy stale flag.
      const run = await options.indexRunner.indexNow("auto", { signal: scope.signal });
      if (!state.stale && !run.result.work && run.result.readiness?.freshness === "fresh") {
        logger("info", "skipped-not-stale", { lastIndexedAt: state.lastIndexedAt });
        return "skipped-not-stale";
      }
      return "indexed";
    } catch (error) {
      logger("error", "tick-failed", { code: error instanceof MemoryExecutionError ? error.code : "index_failed" });
      return "failed";
    } finally { scope.dispose(); callers.delete(controller); }
  };

  const timer = options.startTimer === false ? undefined : setInterval(() => { void tick(); }, intervalMs);
  timer?.unref?.();

  return {
    tick,
    stop() {
      stopped = true;
      for (const controller of callers) controller.abort();
      if (timer) clearInterval(timer);
    },
  };
}

export function defaultAutoIndexLogger(_level: LogLevel, _event: string, _details: Record<string, unknown> = {}): void {
  // App use cases are side-effect free by default; server/adapters inject real logging.
}
