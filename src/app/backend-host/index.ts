import {
  type BackendDescriptor, type BackendIdentity, BackendHostError, backendPaths,
  currentBackendIdentity, readBackendDescriptor, readBackendLease, processAlive,
  spawnRootBackend, verifyBackendReady, acquireBackendLease, publishBackendDescriptor, releaseBackendLease,
} from "../../adapters/backend-host/index.js";
export type { BackendDescriptor, BackendIdentity } from "../../adapters/backend-host/index.js";
export { BackendHostError } from "../../adapters/backend-host/index.js";
export { startBackendControlProxy } from "../../adapters/backend-host/control-proxy.js";

/** Claim the same root ownership for an explicitly configured foreground host. */
export async function claimRootBackend(rootArgument: string, options: { executable?: string } = {}) {
  const { root } = await backendPaths(rootArgument, true), identity = await currentBackendIdentity(options.executable);
  const lease = await acquireBackendLease(root, identity);
  if (!lease) throw new BackendHostError("backend_already_running", "This brain already has a live backend owner. Stop it before starting another host.");
  return {
    root, lease,
    publish: (connection: { url: string; token: string }) => publishBackendDescriptor({ ...lease, root, ...connection }),
    release: () => releaseBackendLease(root, lease.instanceId),
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export interface EnsureBackendOptions { timeoutMs?: number; signal?: AbortSignal; identity?: BackendIdentity; spawn?: (root: string, identity: BackendIdentity) => Promise<void>; }
function assertExpected(descriptor: BackendDescriptor, expected: BackendIdentity) {
  // Separate app and CLI copies can have the same build at different paths.
  if (descriptor.executableHash !== expected.executableHash || descriptor.build !== expected.build || descriptor.version !== expected.version)
    throw new BackendHostError("backend_version_mismatch", "This brain has a backend from a different build. Stop it and update the app and CLI together before retrying.");
}
export async function ensureRootBackend(rootArg: string, options: EnsureBackendOptions = {}): Promise<BackendDescriptor> {
  const { root } = await backendPaths(rootArg, true);
  const identity = options.identity ?? await currentBackendIdentity();
  const timeout = options.timeoutMs ?? 20000, deadline = Date.now() + timeout;
  let launched = false;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new BackendHostError("backend_start_aborted", "Waiting for the backend was cancelled; its shared lifetime was not stopped.");
    const lease = await readBackendLease(root), descriptor = await readBackendDescriptor(root);
    if (lease && descriptor && lease.instanceId === descriptor.instanceId && processAlive(lease.pid)) {
      if (await verifyBackendReady(descriptor, Math.min(1000, Math.max(1, deadline - Date.now())))) { assertExpected(descriptor, identity); return descriptor; }
    } else if ((!lease || !processAlive(lease.pid)) && !launched) {
      await (options.spawn ?? spawnRootBackend)(root, identity); launched = true;
    }
    await delay(25);
  }
  throw new BackendHostError("backend_not_ready", "The registered backend did not become ready. Inspect its private backend log; no foreign process was adopted or stopped.");
}
export type BackendStatus = { status: "stopped" | "starting" | "running" | "unavailable"; backend?: Omit<BackendDescriptor, "token">; };
export async function backendStatus(root: string): Promise<BackendStatus> {
  const lease = await readBackendLease(root), descriptor = await readBackendDescriptor(root);
  if (!lease || !processAlive(lease.pid)) return { status: "stopped" };
  if (!descriptor || descriptor.instanceId !== lease.instanceId) return { status: "starting" };
  const { token: _secret, ...backend } = descriptor;
  return { status: await verifyBackendReady(descriptor) ? "running" : "unavailable", backend };
}
export async function stopRootBackend(root: string): Promise<{ stopped: boolean; instanceId?: string }> {
  const lease = await readBackendLease(root), descriptor = await readBackendDescriptor(root);
  if (!lease || !processAlive(lease.pid)) return { stopped: false };
  if (!descriptor || descriptor.instanceId !== lease.instanceId || !await verifyBackendReady(descriptor))
    throw new BackendHostError("backend_identity_mismatch", "A registered live owner could not be authenticated; no process was stopped.");
  const response = await fetch(descriptor.url + "/_backend/stop", { method: "POST", headers: { Authorization: "Bearer " + descriptor.token }, signal: AbortSignal.timeout(5000), redirect: "manual" });
  if (!response.ok) { await response.body?.cancel(); throw new BackendHostError("backend_stop_failed", "The backend refused the authenticated stop request."); }
  await response.body?.cancel();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const current = await readBackendLease(root);
    if (!current || current.instanceId !== descriptor.instanceId || !processAlive(current.pid)) return { stopped: true, instanceId: descriptor.instanceId };
    await delay(25);
  }
  throw new BackendHostError("backend_stop_pending", "Backend shutdown has not drained yet; do not kill or adopt another process.");
}
