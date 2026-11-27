/**
 * Warm smart search: a long-lived QMD query worker per memory root, owned by the
 * long-lived host process that runs searches (root backend daemon, `serve`).
 * Hosts opt in with `retainWarmSmartSearch`; library and one-shot callers keep
 * the one-shot `qmd query` child. The worker keeps the embedding model loaded so
 * later smart searches skip the model load; it reproduces the CLI's rows exactly
 * (see qmd-warm-worker.ts). Every query still runs inside the caller's admitted
 * operation and root lock. A timeout, abort, overflow, malformed reply, crash or
 * error kills the worker; the caller labels the lexical fallback as before.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { smartSearchIdleMs } from "../../core/execution-limits.js";
import { checkExecution, currentExecution, EXECUTION_LIMITS, MemoryExecutionError } from "./qmd-execution.js";
import { databasePath, indexStateRoot, qmdQueryEnv, resolveQmdSdk } from "./qmd-cli.js";

export const WARM_SMART_SEARCH_LIMITS = Object.freeze({
  /** Warm roots per host process; the least recently used idle worker is evicted. */
  roots: 2,
  /** Combined stdout/stderr/protocol bytes per request, as for one-shot queries. */
  outputBytes: 20 * 1024 * 1024,
  /** Graceful idle exit before the process group is signalled. */
  retireGraceMs: 3_000,
});
const WORKER = fileURLToPath(new URL("./qmd-warm-worker.js", import.meta.url));

interface Waiter { resolve(response: { rows?: unknown[] }): void; fail(error: MemoryExecutionError): void }
interface Worker {
  key: string;
  identity: string;
  child: ChildProcess;
  nextId: number;
  waiters: Map<number, Waiter>;
  /** Admitted queries currently using this worker; never evicted while nonzero. */
  busy: number;
  bytes: number;
  idle?: NodeJS.Timeout;
  failure?: MemoryExecutionError;
  exited: boolean;
  closed: Promise<void>;
}
/** Map insertion order is the LRU order (oldest first). */
const workers = new Map<string, Worker>();
let holders = 0;

/** A long-lived host enables warm smart search for its lifetime; the last release stops every worker. */
export function retainWarmSmartSearch(): () => Promise<void> {
  holders++;
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    if (--holders === 0) await stopWarmWorkers();
  };
}
export function warmSmartSearchEnabled(): boolean { return holders > 0; }
/** Validated `JUMPYBRAIN_SMART_SEARCH_IDLE_MS` (default 30 minutes; 0 = keep while the host runs). */
export function warmSmartSearchIdleMs(): number { return smartSearchIdleMs(process.env.JUMPYBRAIN_SMART_SEARCH_IDLE_MS); }

export async function stopWarmWorkers(): Promise<void> {
  const all = [...workers.values()];
  for (const worker of all) kill(worker, new MemoryExecutionError("execution_aborted"));
  await Promise.all(all.map(worker => worker.closed));
}

function rootKey(root: string): string {
  try { return realpathSync(root); } catch { return path.resolve(root); }
}
function identityFor(root: string, sdkPath: string, model: string, modelKey: string): string {
  // A different engine, model bytes/identity or index location is a new worker.
  return JSON.stringify([sdkPath, model, modelKey, databasePath(root), indexStateRoot(root)]);
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal); else child.kill(signal); }
  catch { /* Already reaped; never signal a reused PID after close. */ }
}
function setRef(worker: Worker, on: boolean): void {
  const method = on ? "ref" : "unref";
  worker.child[method]();
  for (const stream of worker.child.stdio) (stream as unknown as { ref?(): void; unref?(): void } | null)?.[method]?.();
}
/** Bad state: TERM then KILL the owned process group. Waiters fail only after close. */
function kill(worker: Worker, error: MemoryExecutionError): void {
  if (worker.exited || worker.failure) return;
  worker.failure = error;
  if (workers.get(worker.key) === worker) workers.delete(worker.key);
  if (worker.idle) clearTimeout(worker.idle);
  // Callers await `closed` (permit/lock held until the child is gone): keep the loop alive.
  setRef(worker, true);
  worker.child.stdin?.destroy();
  signalGroup(worker.child, "SIGTERM");
  setTimeout(() => { if (!worker.exited) signalGroup(worker.child, "SIGKILL"); }, EXECUTION_LIMITS.killGraceMs).unref();
}
/** Idle unload: close stdin so the worker disposes the model and exits, with a bounded fallback. */
function retire(worker: Worker): void {
  if (worker.exited || worker.failure || worker.busy || worker.waiters.size) return;
  worker.failure = new MemoryExecutionError("execution_aborted");
  if (workers.get(worker.key) === worker) workers.delete(worker.key);
  worker.child.stdin?.end();
  setTimeout(() => { if (!worker.exited) { signalGroup(worker.child, "SIGTERM"); setTimeout(() => { if (!worker.exited) signalGroup(worker.child, "SIGKILL"); }, EXECUTION_LIMITS.killGraceMs).unref(); } },
    WARM_SMART_SEARCH_LIMITS.retireGraceMs).unref();
}
function scheduleIdle(worker: Worker, idleMs: number): void {
  if (worker.idle) clearTimeout(worker.idle);
  worker.idle = undefined;
  if (worker.exited || worker.failure || worker.busy || worker.waiters.size || idleMs === 0) return;
  worker.idle = setTimeout(() => retire(worker), idleMs);
  worker.idle.unref();
}

function start(root: string, key: string, identity: string, model: string): Worker {
  // Same shell-free node, root cwd and isolated QMD environment as one-shot queries.
  const child = spawn(process.execPath, [WORKER], {
    cwd: root, env: qmdQueryEnv(root, model), detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe", "pipe"],
  });
  let close!: () => void;
  const worker: Worker = { key, identity, child, nextId: 1, waiters: new Map(), busy: 0, bytes: 0, exited: false,
    closed: new Promise<void>(resolve => { close = resolve; }) };
  const count = (bytes: number) => {
    worker.bytes += bytes;
    if (worker.bytes > WARM_SMART_SEARCH_LIMITS.outputBytes) kill(worker, new MemoryExecutionError("execution_output_limit"));
  };
  child.stdout?.on("data", (chunk: Buffer) => count(chunk.length));
  child.stderr?.on("data", (chunk: Buffer) => count(chunk.length));
  const protocol = child.stdio[3] as Readable | null;
  let buffered = "";
  protocol?.setEncoding("utf8");
  protocol?.on("data", (text: string) => {
    count(Buffer.byteLength(text));
    if (worker.failure) return;
    buffered += text;
    for (let newline = buffered.indexOf("\n"); newline >= 0; newline = buffered.indexOf("\n")) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      reply(worker, line);
    }
  });
  protocol?.on("error", () => kill(worker, new MemoryExecutionError("execution_failed")));
  child.stdin?.on("error", () => { /* Exit/close determines the outcome (including EPIPE). */ });
  child.on("error", () => kill(worker, new MemoryExecutionError("execution_failed")));
  child.once("close", () => {
    worker.exited = true;
    // Reap anything left in the owned group, as for one-shot children.
    if (process.platform !== "win32") signalGroup(child, "SIGKILL");
    if (worker.idle) clearTimeout(worker.idle);
    if (workers.get(key) === worker) workers.delete(key);
    const error = worker.failure ?? new MemoryExecutionError("execution_failed");
    for (const waiter of [...worker.waiters.values()]) waiter.fail(error);
    worker.waiters.clear();
    close();
  });
  workers.set(key, worker);
  setRef(worker, false);
  return worker;
}

function reply(worker: Worker, line: string): void {
  let response: { id?: unknown; ok?: unknown; rows?: unknown; error?: { stage?: unknown } };
  try { response = JSON.parse(line); } catch { kill(worker, new MemoryExecutionError("execution_failed")); return; }
  const waiter = typeof response?.id === "number" ? worker.waiters.get(response.id) : undefined;
  // The CLI rejects the same structured text before any search work (e.g. a
  // newline inside the query); the worker did nothing else, so keep it.
  if (waiter && response.ok === false && response.error?.stage === "parse") { waiter.fail(new MemoryExecutionError("execution_failed")); return; }
  if (!waiter || response.ok !== true || (response.rows !== undefined && !Array.isArray(response.rows))) {
    // Unknown id, worker-reported failure or malformed reply: never reuse it.
    kill(worker, new MemoryExecutionError("execution_failed"));
    return;
  }
  waiter.resolve({ rows: response.rows as unknown[] | undefined });
}

function request(worker: Worker, payload: Record<string, unknown>, signal: AbortSignal | undefined, ceilingMs: number | undefined): Promise<{ rows?: unknown[] }> {
  return new Promise((resolve, reject) => {
    if (worker.exited || worker.failure) { void worker.closed.then(() => reject(worker.failure ?? new MemoryExecutionError("execution_failed"))); return; }
    const id = worker.nextId++;
    worker.bytes = 0;
    setRef(worker, true);
    let timer: NodeJS.Timeout | undefined;
    const abort = () => kill(worker, signal?.reason instanceof MemoryExecutionError ? signal.reason : new MemoryExecutionError("execution_aborted"));
    const done = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.waiters.delete(id);
      if (!worker.waiters.size && !worker.exited) setRef(worker, false);
    };
    worker.waiters.set(id, { resolve: value => { done(); resolve(value); }, fail: error => { done(); reject(error); } });
    signal?.addEventListener("abort", abort, { once: true });
    if (ceilingMs) timer = setTimeout(() => kill(worker, new MemoryExecutionError("execution_timeout")), ceilingMs);
    if (signal?.aborted) abort();
    else worker.child.stdin?.write(`${JSON.stringify({ ...payload, id })}\n`);
  });
}

/** Free a slot by evicting the least recently used worker that no admitted query is using. */
async function makeRoom(): Promise<boolean> {
  // Re-check after each wait: a concurrent search or pre-warm may take the slot.
  while (workers.size >= WARM_SMART_SEARCH_LIMITS.roots) {
    const victim = [...workers.values()].find(worker => worker.busy === 0);
    if (!victim) return false;
    kill(victim, new MemoryExecutionError("execution_aborted"));
    await victim.closed;
  }
  return true;
}
function touch(worker: Worker): void {
  if (workers.get(worker.key) !== worker) return;
  workers.delete(worker.key);
  workers.set(worker.key, worker);
}

export interface WarmQuery {
  /** Exact structured `qmd query` text (lex:/vec: lines). */
  text: string;
  limit: number;
  collection: string;
  model: string;
  /** Model bytes identity from the searched manifest (hash/stat). */
  modelKey: string;
  idleMs: number;
}

/**
 * Run one structured `--no-rerank` query in the root's warm worker, inside the
 * caller's admitted operation (whole-operation signal plus the 30-second query
 * ceiling). Returns the CLI's JSON rows as text, or undefined when every warm
 * slot is in use (the caller then runs the one-shot CLI).
 */
export async function runWarmQmdQuery(root: string, query: WarmQuery): Promise<string | undefined> {
  const current = currentExecution();
  if (!current) throw new Error("QMD execution requires an admitted memory operation.");
  checkExecution();
  const sdkPath = resolveQmdSdk();
  const key = rootKey(root);
  const identity = identityFor(root, sdkPath, query.model, query.modelKey);
  let worker = workers.get(key);
  if (worker && worker.identity !== identity && worker.busy === 0) {
    // New model or engine: the old process (and its model) leaves first.
    kill(worker, new MemoryExecutionError("execution_aborted"));
    await worker.closed;
    worker = undefined;
  }
  if (worker && worker.identity !== identity) return undefined;
  if (!worker) {
    if (!await makeRoom()) return undefined;
    checkExecution();
    worker = workers.get(key) ?? start(root, key, identity, query.model);
    if (worker.identity !== identity) return undefined;
  }
  touch(worker);
  worker.busy++;
  if (worker.idle) clearTimeout(worker.idle);
  try {
    const response = await request(worker, { type: "query", sdkPath, model: query.model, text: query.text, limit: query.limit, collection: query.collection },
      current.signal, current.kind === "search" ? EXECUTION_LIMITS.commandMs : undefined);
    return JSON.stringify(response.rows ?? []);
  } finally {
    worker.busy--;
    scheduleIdle(worker, query.idleMs);
  }
}

/**
 * Background model load for a root whose smart search is ready. Never evicts a
 * warm worker, never touches the index or QMD config, and never throws.
 */
export async function prewarmWarmQmdWorker(root: string, model: string, modelKey: string): Promise<boolean> {
  try {
    if (!warmSmartSearchEnabled()) return false;
    const idleMs = warmSmartSearchIdleMs();
    const sdkPath = resolveQmdSdk();
    const key = rootKey(root);
    const identity = identityFor(root, sdkPath, model, modelKey);
    const existing = workers.get(key);
    if (existing) return existing.identity === identity;
    if (workers.size >= WARM_SMART_SEARCH_LIMITS.roots) return false;
    const worker = start(root, key, identity, model);
    try {
      await request(worker, { type: "warm", sdkPath, model }, undefined, EXECUTION_LIMITS.commandMs);
      return warmSmartSearchEnabled();
    } finally {
      // The host may have released warm search while the model was loading.
      if (!warmSmartSearchEnabled()) kill(worker, new MemoryExecutionError("execution_aborted"));
      else scheduleIdle(worker, idleMs);
    }
  } catch { return false; }
}

export const warmSmartSearchForTests = Object.freeze({
  workers: () => [...workers.values()].map(worker => ({ root: worker.key, pid: worker.child.pid, busy: worker.busy, exited: worker.exited })),
  stop: stopWarmWorkers,
});
