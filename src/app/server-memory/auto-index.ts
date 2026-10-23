import { ensureMemoryIndexed, indexMemory as appIndexMemory } from "../local-memory/index.js";
import { checkExecution, readExecution, executionScope, EXECUTION_LIMITS, MemoryExecutionError } from "../../adapters/qmd/index.js";
import type { IndexMemoryOptions, IndexMemoryResult } from "../../types.js";
import { invalidateRemoteIndex, markRemoteIndexFresh, readRemoteIndexState, type RemoteIndexState } from "./state.js";

export const REMOTE_AUTO_INDEX_INTERVAL_MS = 5 * 60 * 1000;
export const REMOTE_AUTO_INDEX_QUIET_MS = 5_000;
export const REMOTE_AUTO_INDEX_MAX_DEFERRAL_MS = 30_000;
export const REMOTE_AUTO_INDEX_STARTUP_MS = 1_000;

export interface AutoIndexClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

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
  notifyWrite(): void;
  notifyActivity(): void;
  status(): { enabled: boolean; indexing: boolean; failed: boolean };
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
  quietMs?: number;
  maxDeferralMs?: number;
  startupMs?: number;
  readState?: (root: string) => Promise<RemoteIndexState>;
  logger?: RemoteAutoIndexLogger;
  startTimer?: boolean;
  clock?: AutoIndexClock;
}): RemoteAutoIndexer {
  const intervalMs = options.intervalMs ?? REMOTE_AUTO_INDEX_INTERVAL_MS;
  const quietMs = options.quietMs ?? REMOTE_AUTO_INDEX_QUIET_MS;
  const maxDeferralMs = options.maxDeferralMs ?? REMOTE_AUTO_INDEX_MAX_DEFERRAL_MS;
  const readState = options.readState ?? readRemoteIndexState;
  const logger = options.logger ?? defaultAutoIndexLogger;
  const clock: AutoIndexClock = options.clock ?? {
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: timer => clearTimeout(timer),
  };
  const automatic = options.startTimer !== false;
  let stopped = false;
  let active: Promise<"indexed" | "skipped-not-stale" | "failed"> | undefined;
  let controller: AbortController | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let reconciliation: ReturnType<typeof setTimeout> | undefined;
  let pendingSince: number | undefined;
  let pendingAt: number | undefined;
  let writeGeneration = 0;
  let failures = 0;
  let retryAt = 0;

  function clearScheduled() {
    if (scheduled !== undefined) clock.clearTimeout(scheduled);
    scheduled = undefined;
  }

  function arm() {
    clearScheduled();
    if (!automatic || stopped || active || pendingAt === undefined) return;
    scheduled = clock.setTimeout(() => {
      scheduled = undefined;
      void tick();
    }, Math.max(0, Math.max(pendingAt, retryAt) - clock.now()));
    scheduled?.unref?.();
  }

  function request(delayMs: number) {
    if (stopped) return;
    const now = clock.now();
    pendingSince ??= now;
    pendingAt = Math.min(now + delayMs, pendingSince + maxDeferralMs);
    arm();
  }

  // One promise/controller per maintenance tick, even if many timers/callers
  // arrive while a model job is active. They do not consume runner waiters.
  function tick(): Promise<"indexed" | "skipped-not-stale" | "failed"> {
    if (stopped) return Promise.resolve("skipped-not-stale");
    if (active) return active;
    clearScheduled();
    pendingSince = pendingAt = undefined;
    const generation = writeGeneration;
    const owner = new AbortController();
    controller = owner;
    const scope = executionScope("index", { signal: owner.signal });
    active = Promise.resolve().then(async () => {
      try {
        const state = await readExecution(readState(options.root), scope.signal);
        // Canonical discovery belongs to the joined, admitted ensure workflow;
        // legacy stale:false alone cannot detect external CLI/filesystem edits.
        const run = await options.indexRunner.indexNow("auto", { signal: scope.signal });
        failures = 0;
        retryAt = 0;
        if (run.index.stale || run.result.readiness?.freshness === "stale") request(quietMs);
        if (!state.stale && !run.result.work && run.result.readiness?.freshness === "fresh") {
          logger("info", "skipped-not-stale", { lastIndexedAt: state.lastIndexedAt });
          return "skipped-not-stale" as const;
        }
        return "indexed" as const;
      } catch (error) {
        if (!stopped) {
          failures++;
          // Backoff is host-owned; explicit tick/Settings retry may run sooner.
          retryAt = clock.now() + Math.min(intervalMs, quietMs * 2 ** Math.min(failures - 1, 10));
          request(quietMs);
          logger("error", "tick-failed", { code: error instanceof MemoryExecutionError ? error.code : "index_failed" });
        }
        return "failed" as const;
      } finally {
        scope.dispose();
        controller = undefined;
        active = undefined;
        // Confirmed writes that raced with publication need another ensure.
        if (!stopped && writeGeneration !== generation && pendingAt === undefined) request(quietMs);
        arm();
      }
    });
    return active;
  }

  function reconcile() {
    if (!automatic || stopped) return;
    reconciliation = clock.setTimeout(() => {
      if (pendingAt === undefined && !active) request(0);
      reconcile();
    }, intervalMs);
    reconciliation?.unref?.();
  }

  if (automatic) {
    request(options.startupMs ?? REMOTE_AUTO_INDEX_STARTUP_MS);
    reconcile();
  }

  return {
    tick,
    notifyWrite() { writeGeneration++; request(quietMs); },
    notifyActivity() {
      // Activity can defer queued work only, with the original maximum lag.
      // Never abort/restart an active semantic worker because a key was typed.
      if (pendingAt !== undefined) request(quietMs);
    },
    status: () => ({ enabled: automatic, indexing: options.indexRunner.isIndexing(), failed: failures > 0 }),
    stop() {
      stopped = true;
      clearScheduled();
      if (reconciliation !== undefined) clock.clearTimeout(reconciliation);
      reconciliation = undefined;
      pendingSince = pendingAt = undefined;
      controller?.abort(new MemoryExecutionError("execution_aborted"));
    },
  };
}

export function defaultAutoIndexLogger(_level: LogLevel, _event: string, _details: Record<string, unknown> = {}): void {
  // App use cases are side-effect free by default; server/adapters inject real logging.
}
