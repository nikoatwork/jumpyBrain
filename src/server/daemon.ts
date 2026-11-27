import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccessStore } from "../adapters/access-control/index.js";
import { acquireBackendLease, backendPaths, currentBackendIdentity, publishBackendDescriptor, releaseBackendLease, readBackendLease } from "../adapters/backend-host/index.js";
import { pinBackendRuntime } from "../adapters/backend-host/runtime-pins.js";
import { startJumpyBrainHttpServer } from "./index.js";

/**
 * Bounded self-supervision of a detached root owner, in milliseconds.
 * `checkMs`: watchdog period. `graceMs`: how long an uncertain state (unreadable
 * lease, closed listener, stalled check) may persist.
 * `startupMs`: lease-to-readiness bound. `drainMs`: graceful drain bound before
 * a forced exit.
 */
export interface BackendDaemonTimings { checkMs: number; graceMs: number; startupMs: number; drainMs: number; }
export const BACKEND_DAEMON_TIMINGS: Readonly<BackendDaemonTimings> = Object.freeze({ checkMs: 1000, graceMs: 5000, startupMs: 30_000, drainMs: 30_000 });
export interface BackendDaemonOptions { timings?: Partial<BackendDaemonTimings>; exit?: (code: number) => void; }

type Health = "healthy" | "lost" | "uncertain";
/** The root itself is gone or replaced: no ownership can remain to protect. */
const rootGone = (error: unknown) => ["ENOENT", "ENOTDIR", "invalid_root"].includes(String((error as { code?: unknown } | undefined)?.code));
const exitProcess = (code: number) => process.exit(code);

/** Headless shared lifetime: deliberately independent of any app window. */
export async function runBackendDaemon(rootArgument: string, options: BackendDaemonOptions = {}): Promise<void> {
  const timings = { ...BACKEND_DAEMON_TIMINGS, ...options.timings }, exit = options.exit ?? exitProcess;
  const { root } = await backendPaths(rootArgument, true);
  const identity = await currentBackendIdentity();
  if (process.env.JUMPYBRAIN_BACKEND_GENERATION && process.env.JUMPYBRAIN_BACKEND_GENERATION !== identity.runtimeGeneration) throw new Error("Runtime changed before launch; retry from the installed runtime.");
  const lease = await acquireBackendLease(root, identity);
  if (!lease) return;
  // From here this process may own the root, so every path ends within a bound.
  // Unref'd: a forced exit is only a backstop and never extends the lifetime.
  let forced: ReturnType<typeof setTimeout> | undefined;
  const forceExitAfter = (ms: number, phase: string) => {
    if (forced) return;
    forced = setTimeout(() => { console.error(`Backend ${phase} exceeded ${ms} ms; exiting.`); exit(1); }, ms);
    forced.unref();
  };
  // Until its descriptor is published no client can reach this process, so a
  // stalled startup gets the short grace bound; once publishing, the drain bound.
  let announced = false, stopStartup: ((reason: string) => void) | undefined;
  const startup = setTimeout(() => {
    forceExitAfter(announced ? timings.drainMs : timings.graceMs, "startup stop");
    if (stopStartup) stopStartup("not ready within its startup bound");
    else console.error("Backend stopping: not ready within its startup bound.");
  }, timings.startupMs);
  startup.unref();
  try { await pinBackendRuntime(root, lease); }
  catch (error) { clearTimeout(startup); await releaseBackendLease(root, lease.instanceId); throw error; }
  const token = randomBytes(32).toString("base64url");
  const accessStore = createAccessStore(root, { bootstrapKeys: [token], bootstrapOwner: {token, id: "local-owner:" + lease.rootId} });
  let starting: ReturnType<typeof startJumpyBrainHttpServer> | undefined;
  let server: Awaited<ReturnType<typeof startJumpyBrainHttpServer>> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let stopping: Promise<void> | undefined;
  let finish!: () => void;
  const lifetime = new Promise<void>(resolve => { finish = resolve; });
  const stop = (reason?: string) => {
    if (!stopping) stopping = (async () => {
      if (reason) console.error(`Backend stopping: ${reason}.`);
      // The normal drain (requests, canonical writes, children) runs first;
      // only a drain that outlives the bound ends in a forced exit.
      forceExitAfter(timings.drainMs, "drain");
      if (watchdog) clearInterval(watchdog);
      try { await (server ?? await starting?.catch(() => undefined))?.close(); }
      finally {
        accessStore.close();
        try { await releaseBackendLease(root, lease.instanceId); }
        catch (error) { if (!rootGone(error)) throw error; }
        finally { finish(); }
      }
    })();
    return stopping;
  };
  const signal = (reason?: string) => { void stop(reason).catch(() => { process.exitCode = 1; finish(); }); };
  const onSignal = () => signal();
  process.once("SIGTERM", onSignal); process.once("SIGINT", onSignal);
  stopStartup = signal;
  try {
    const options = {
      root, apiKeys: [token], host: "127.0.0.1", port: 0, autoIndex: false as const, lazyIndex: true, warmSmartSearch: true,
      accessStore, localOwnerToken: token,
      backendControl: { ...identity, instanceId: lease.instanceId, rootId: lease.rootId, stop: () => signal() },
    };
    starting = startJumpyBrainHttpServer(options);
    server = await starting;
    if (stopping) { await stopping; return; }
    announced = true;
    await publishBackendDescriptor({ ...lease, root, url: server.url, token });
    clearTimeout(startup);
    if (!stopping) watchdog = superviseOwnership(root, lease.instanceId, server, timings, signal);
    await lifetime;
    await stopping;
  } finally {
    clearTimeout(startup); if (watchdog) clearInterval(watchdog);
    process.off("SIGTERM", onSignal); process.off("SIGINT", onSignal);
    await stop();
  }
}

/**
 * Watchdog for a ready owner. A readable `owner.json` that is absent or names
 * another instance/PID, or a removed root, stops at once (the established
 * lost-lease behavior). Uncertain states (unreadable lease, closed listener, a
 * check that never completes) stop only after `graceMs` of consecutive ticks.
 * The connection descriptor is deliberately not checked: a tampered descriptor
 * fails closed for clients and must not make the owner restart over it.
 * Counting ticks rather than wall time means an event-loop stall yields one
 * late tick, never a false stop of a healthy owner.
 */
function superviseOwnership(root: string, instanceId: string, server: Awaited<ReturnType<typeof startJumpyBrainHttpServer>>, timings: BackendDaemonTimings, stop: (reason: string) => void) {
  const limit = Math.max(2, Math.ceil(timings.graceMs / timings.checkMs));
  let doubtful = 0, inspecting = false;
  const doubt = (reason: string) => { if (++doubtful >= limit) stop(reason); };
  const inspect = async (): Promise<Health> => {
    try {
      const lease = await readBackendLease(root);
      if (lease?.instanceId !== instanceId || lease.pid !== process.pid) return "lost";
    } catch (error) { return rootGone(error) ? "lost" : "uncertain"; }
    return server.server.listening ? "healthy" : "uncertain";
  };
  const timer = setInterval(() => {
    if (inspecting) { doubt("ownership check stalled"); return; }
    inspecting = true;
    void inspect().then(health => {
      if (health === "healthy") doubtful = 0;
      else if (health === "lost") stop("ownership lost or memory root removed");
      else doubt("ownership or listener could not be verified");
    }, () => doubt("ownership check failed")).finally(() => { inspecting = false; });
  }, timings.checkMs);
  timer.unref();
  return timer;
}

/**
 * Process entry. Once the lifetime ends (drained, lease released) or startup
 * fails, the process exits explicitly: a stray handle must not keep an unowned
 * backend alive and its runtime generation pinned.
 */
export async function serveDetachedBackend(root: string, options: BackendDaemonOptions = {}): Promise<void> {
  const exit = options.exit ?? exitProcess;
  const baseline = resourceCounts();
  let code = 0;
  try { await runBackendDaemon(root, { ...options, exit }); }
  catch { console.error("Backend startup or shutdown failed; inspect its private operational state."); code = 1; }
  // Content-free evidence for whatever would have kept this process alive.
  const lingering = [...resourceCounts()].filter(([type, count]) => !/^(FSReq\w*|CloseReq|WriteWrap|ShutdownWrap)$/.test(type) && count > (baseline.get(type) ?? 0)).map(([type]) => type);
  if (lingering.length) console.error("Backend lifetime ended with active " + lingering.join(", ") + "; exiting anyway.");
  exit(Number(process.exitCode ?? 0) || code);
}
function resourceCounts() {
  const counts = new Map<string, number>();
  for (const type of process.getActiveResourcesInfo()) counts.set(type, (counts.get(type) ?? 0) + 1);
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.JUMPYBRAIN_BACKEND_ROOT;
  if (!root || !path.isAbsolute(root)) { console.error("Backend requires an explicit absolute memory root."); process.exitCode = 1; }
  else await serveDetachedBackend(root);
}
