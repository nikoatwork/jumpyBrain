import {
  type BackendDescriptor, type BackendIdentity, BackendHostError, backendPaths,
  currentBackendIdentity, readBackendDescriptor, readBackendLease, processAlive,
  spawnRootBackend, verifyBackendReady, acquireBackendLease, publishBackendDescriptor, releaseBackendLease,
} from "../../adapters/backend-host/index.js";
import { pinBackendRuntime } from "../../adapters/backend-host/runtime-pins.js";
export type { BackendDescriptor, BackendIdentity } from "../../adapters/backend-host/index.js";
export { BackendHostError } from "../../adapters/backend-host/index.js";
export { startBackendControlProxy } from "../../adapters/backend-host/control-proxy.js";

/** Claim the same root ownership for an explicitly configured foreground host. */
export async function claimRootBackend(rootArgument: string, options: { executable?: string } = {}) {
  const { root } = await backendPaths(rootArgument, true), identity = await currentBackendIdentity(options.executable);
  const lease = await acquireBackendLease(root, identity);
  if (!lease) throw new BackendHostError("backend_already_running", "This brain already has a live backend owner. Stop it before starting another host.");
  try { await pinBackendRuntime(root, lease); }
  catch (error) { await releaseBackendLease(root, lease.instanceId); throw error; }
  return {
    root, lease,
    publish: (connection: { url: string; token: string }) => publishBackendDescriptor({ ...lease, root, ...connection }),
    release: () => releaseBackendLease(root, lease.instanceId),
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export interface EnsureBackendOptions { timeoutMs?: number; signal?: AbortSignal; identity?: BackendIdentity; spawn?: (root: string, identity: BackendIdentity) => Promise<void>; upgradeOlder?: boolean; }
function isOlderVersion(version: string, expected: string): boolean {
  const numeric = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (!numeric.test(version) || !numeric.test(expected)) return false;
  const previous = version.split('.').map(Number), next = expected.split('.').map(Number);
  if (![...previous, ...next].every(Number.isSafeInteger)) return false;
  for (let index = 0; index < 3; index++) {
    if (previous[index] !== next[index]) return previous[index] < next[index];
  }
  return false;
}
function assertExpected(descriptor: BackendDescriptor, expected: BackendIdentity) {
  // Separate app and CLI copies can have the same build at different paths.
  if (descriptor.executableHash !== expected.executableHash || descriptor.build !== expected.build || descriptor.version !== expected.version)
    throw new BackendHostError("backend_version_mismatch", "This brain has a backend from a different build. Stop it and update the app and CLI together before retrying.");
}
export async function ensureRootBackend(rootArg: string, options: EnsureBackendOptions = {}): Promise<BackendDescriptor> {
  const { root } = await backendPaths(rootArg, true);
  const identity = options.identity ?? await currentBackendIdentity();
  const timeout = options.timeoutMs ?? 20000, deadline = Date.now() + timeout;
  let launched = false, upgraded = false;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new BackendHostError("backend_start_aborted", "Waiting for the backend was cancelled; its shared lifetime was not stopped.");
    const lease = await readBackendLease(root), descriptor = await readBackendDescriptor(root);
    if (lease && descriptor && lease.instanceId === descriptor.instanceId && processAlive(lease.pid)) {
      if (await verifyBackendReady(descriptor, Math.min(1000, Math.max(1, deadline - Date.now())))) {
        if (options.upgradeOlder && !upgraded && isOlderVersion(descriptor.version, identity.version)) {
          const detached = await verifyBackendReady(descriptor, Math.min(1000, Math.max(1, deadline - Date.now())), { detachedOnly: true });
          if (detached) {
            // A desktop update leaves root-owned services alive. Drain only the
            // authenticated older generation; never downgrade or kill a process.
            await stopRootBackend(root, { expectedInstanceId: descriptor.instanceId, signal: options.signal, timeoutMs: Math.max(1, deadline - Date.now()) });
            upgraded = true;
            continue;
          }
          // Distinguish an explicitly configured foreground host from a daemon
          // whose endpoint closed during another caller's authenticated drain.
          if (!await verifyBackendReady(descriptor, Math.min(1000, Math.max(1, deadline - Date.now())))) { await delay(25); continue; }
        }
        assertExpected(descriptor, identity); return descriptor;
      }
    } else if ((!lease || !processAlive(lease.pid)) && !launched) {
      await (options.spawn ?? spawnRootBackend)(root, identity); launched = true;
    }
    await delay(25);
  }
  throw new BackendHostError("backend_not_ready", "The registered backend did not become ready. Inspect its private backend log; no foreign process was adopted or stopped.");
}
export type BackendStatus = { status: "stopped" | "starting" | "running" | "unavailable"; backend?: Omit<BackendDescriptor, "token">; };
export async function backendStatus(root: string, includeStopped = false): Promise<BackendStatus> {
  const lease = await readBackendLease(root), descriptor = await readBackendDescriptor(root);
  if (!lease || !processAlive(lease.pid)) {
    if (includeStopped && descriptor) { const { token: _secret, ...backend } = descriptor; return { status: "stopped", backend }; }
    return { status: "stopped" };
  }
  if (!descriptor || descriptor.instanceId !== lease.instanceId) return { status: "starting" };
  const { token: _secret, ...backend } = descriptor;
  return { status: await verifyBackendReady(descriptor) ? "running" : "unavailable", backend };
}
export interface StopBackendOptions { expectedInstanceId?: string; signal?: AbortSignal; timeoutMs?: number; }
export async function stopRootBackend(root: string, options: StopBackendOptions = {}): Promise<{ stopped: boolean; instanceId?: string }> {
  const deadline = Date.now() + (options.timeoutMs ?? 10000);
  const cancelled = () => { if (options.signal?.aborted) throw new BackendHostError("backend_start_aborted", "Waiting for the backend was cancelled; its shared lifetime was not stopped forcibly."); };
  cancelled();
  const lease = await readBackendLease(root), descriptor = await readBackendDescriptor(root);
  if (!lease || !processAlive(lease.pid)) return { stopped: false };
  if (options.expectedInstanceId && (lease.instanceId !== options.expectedInstanceId || descriptor?.instanceId !== options.expectedInstanceId)) return { stopped: false };
  if (!descriptor || descriptor.instanceId !== lease.instanceId)
    throw new BackendHostError("backend_identity_mismatch", "A registered live owner could not be authenticated; no process was stopped.");
  const ready = await verifyBackendReady(descriptor, Math.min(1500, Math.max(1, deadline - Date.now())));
  if (!ready && !options.expectedInstanceId)
    throw new BackendHostError("backend_identity_mismatch", "A registered live owner could not be authenticated; no process was stopped.");
  if (ready) {
    cancelled();
    let response: Response | undefined;
    try {
      response = await fetch(descriptor.url + "/_backend/stop", { method: "POST", headers: { Authorization: "Bearer " + descriptor.token }, signal: AbortSignal.any([AbortSignal.timeout(Math.min(5000, Math.max(1, deadline - Date.now()))), ...(options.signal ? [options.signal] : [])]), redirect: "manual" });
      await response.body?.cancel();
    } catch {
      // A concurrent authenticated handoff may close the endpoint. The only
      // success proof is release of this exact lease; never retry the POST.
      cancelled();
    }
    if (response && !response.ok) throw new BackendHostError("backend_stop_failed", "The backend refused the authenticated stop request.");
  }
  while (Date.now() < deadline) {
    cancelled();
    const current = await readBackendLease(root);
    if (!current || current.instanceId !== descriptor.instanceId || !processAlive(current.pid)) return { stopped: true, instanceId: descriptor.instanceId };
    await delay(25);
  }
  throw new BackendHostError("backend_stop_pending", "Backend shutdown has not drained yet; do not kill or adopt another process.");
}
