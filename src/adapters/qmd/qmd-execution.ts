import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { ExecutionOptions } from "../../types.js";

export type ExecutionKind = "search" | "index";
export type ExecutionCode = "execution_timeout" | "execution_aborted" | "execution_overloaded" | "execution_output_limit" | "execution_failed";
const messages: Record<ExecutionCode, string> = {
  execution_timeout: "Memory operation deadline exceeded; retry or adjust the local deadline.",
  execution_aborted: "Memory operation canceled.",
  execution_overloaded: "Memory execution queue is full; retry shortly.",
  execution_output_limit: "Memory backend output exceeded its capture limit.",
  execution_failed: "Memory backend execution failed.",
};
export class MemoryExecutionError extends Error {
  constructor(readonly code: ExecutionCode) { super(messages[code]); this.name = "MemoryExecutionError"; }
}

export const EXECUTION_LIMITS = Object.freeze({ active: 2, queue: 16, commandMs: 30_000, searchMs: 60_000, indexMs: 600_000, killGraceMs: 250 });
export function executionTimeout(kind: ExecutionKind, options: ExecutionOptions = {}): number {
  const variable = kind === "index" ? "JUMPYBRAIN_INDEX_TIMEOUT_MS" : "JUMPYBRAIN_SEARCH_TIMEOUT_MS";
  const value = options.timeoutMs ?? (process.env[variable] === undefined ? EXECUTION_LIMITS[kind === "index" ? "indexMs" : "searchMs"] : Number(process.env[variable]));
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error("Execution timeout must be a positive integer no larger than 2147483647 ms.");
  return value;
}

/** Also used by joined index callers: detaching a waiter does not cancel its peers. */
export function executionScope(kind: ExecutionKind, options: ExecutionOptions = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(new MemoryExecutionError("execution_aborted"));
  const timer = setTimeout(() => controller.abort(new MemoryExecutionError("execution_timeout")), executionTimeout(kind, options));
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  return { signal: controller.signal, dispose() { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); } };
}
export function checkExecution(signal = context.getStore()?.signal): void {
  if (signal?.aborted) throw signal.reason instanceof MemoryExecutionError ? signal.reason : new MemoryExecutionError("execution_aborted");
}
/** Await read-only discovery/I/O promptly; never detach publication or owned children. */
export function readExecution<T>(work: Promise<T>, signal = context.getStore()?.signal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    work.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
export function executionSignal(): AbortSignal | undefined { return context.getStore()?.signal; }

export function isExecutionControlError(error: unknown): boolean {
  return error instanceof MemoryExecutionError && ["execution_timeout", "execution_aborted", "execution_overloaded"].includes(error.code);
}

interface Context { root: string; kind: ExecutionKind; signal: AbortSignal }
const context = new AsyncLocalStorage<Context>();
interface Waiter { root: string; signal: AbortSignal; resolve: (release: () => void) => void; reject: (error: unknown) => void; abort: () => void }
const roots = new Set<string>();
const queue: Waiter[] = [];
// FIFO among runnable roots: a busy root cannot consume all slots; new arrivals
// never pass an older runnable index/search. The permit covers the whole snapshot.
function drain(): void {
  while (roots.size < EXECUTION_LIMITS.active) {
    const index = queue.findIndex(waiter => !roots.has(waiter.root));
    if (index < 0) break;
    const [waiter] = queue.splice(index, 1);
    waiter.signal.removeEventListener("abort", waiter.abort);
    roots.add(waiter.root);
    let released = false;
    waiter.resolve(() => { if (!released) { released = true; roots.delete(waiter.root); drain(); } });
  }
}
function admit(root: string, signal: AbortSignal): Promise<() => void> {
  checkExecution(signal);
  if (queue.length >= EXECUTION_LIMITS.queue) throw new MemoryExecutionError("execution_overloaded");
  return new Promise((resolve, reject) => {
    const waiter: Waiter = { root, signal, resolve, reject, abort: () => {
      const index = queue.indexOf(waiter);
      if (index >= 0) queue.splice(index, 1);
      signal.removeEventListener("abort", waiter.abort);
      try { checkExecution(signal); } catch (error) { reject(error); }
      drain();
    } };
    signal.addEventListener("abort", waiter.abort, { once: true });
    queue.push(waiter);
    drain();
  });
}

export async function withQmdOperation<T>(root: string, kind: ExecutionKind, options: ExecutionOptions, operation: () => Promise<T>): Promise<T> {
  const current = context.getStore();
  if (current) { checkExecution(); return operation(); }
  const scope = executionScope(kind, options);
  let release: (() => void) | undefined;
  try {
    const canonicalRoot = await readExecution(realpath(root).catch(() => path.resolve(root)), scope.signal);
    release = await admit(canonicalRoot, scope.signal);
    return await context.run({ root: canonicalRoot, kind, signal: scope.signal }, async () => {
      checkExecution();
      const result = await operation();
      checkExecution();
      return result;
    });
  } finally { release?.(); scope.dispose(); }
}

/** No shell, finite combined stdout/stderr capture, terminate before releasing a permit.
 * POSIX: isolated owned process group (QMD CLI has a wrapper child). Windows:
 * kill the direct child only; arbitrary detached descendants are not portable.
 */
export async function runQmdChild(binary: string, args: string[], options: {
  cwd?: string; env?: NodeJS.ProcessEnv; input?: string; maxBytes: number;
  /** Worker protocol has content-free stage diagnostics on nonzero exit. */
  acceptNonzero?: boolean;
  /** Indexing uses the enclosing deadline, even when repair belongs to a search. */
  command?: "query" | "index";
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const current = context.getStore();
  if (!current) throw new Error("QMD execution requires an admitted memory operation.");
  checkExecution();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: options.cwd, env: options.env, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let bytes = 0;
    let failure: MemoryExecutionError | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const kill = (signal: NodeJS.Signals) => {
      try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal); else child.kill(signal); }
      catch { /* Already reaped; never signal a reused PID after close. */ }
    };
    const fail = (error: MemoryExecutionError) => {
      if (failure) return;
      failure = error;
      child.stdin.destroy();
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), EXECUTION_LIMITS.killGraceMs);
    };
    const abort = () => fail(current.signal.reason instanceof MemoryExecutionError ? current.signal.reason : new MemoryExecutionError("execution_aborted"));
    current.signal.addEventListener("abort", abort, { once: true });
    // Index workers have the operation's longer deadline, queries/recovery a
    // command ceiling as well as the request-wide signal.
    const commandTimer = current.kind === "search" && options.command !== "index" ? setTimeout(() => fail(new MemoryExecutionError("execution_timeout")), EXECUTION_LIMITS.commandMs) : undefined;
    const capture = (target: Buffer[], chunk: Buffer) => {
      if (failure) return;
      bytes += chunk.length;
      if (bytes > options.maxBytes) fail(new MemoryExecutionError("execution_output_limit"));
      else target.push(chunk);
    };
    child.stdout.on("data", chunk => capture(stdout, chunk));
    child.stderr.on("data", chunk => capture(stderr, chunk));
    child.on("error", () => fail(new MemoryExecutionError("execution_failed")));
    child.stdin.on("error", () => { /* Exit/close determines outcome (including EPIPE). */ });
    child.once("close", code => {
      if (commandTimer) clearTimeout(commandTimer);
      // The wrapper can exit/crash after spawning same-group descendants that
      // closed stdio. Reap owned leftovers on EVERY terminal outcome, not just
      // timeout/abort; otherwise admission would release while work survives.
      if (process.platform !== "win32") kill("SIGKILL");
      if (killTimer) clearTimeout(killTimer);
      current.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0 && !options.acceptNonzero) reject(new MemoryExecutionError("execution_failed"));
      else resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), exitCode: code });
    });
    if (current.signal.aborted) abort();
    else child.stdin.end(options.input ?? "");
  });
}

export const qmdExecutionForTests = { state: () => ({ active: roots.size, queued: queue.length }) };
