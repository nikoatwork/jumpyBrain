import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccessStore } from "../adapters/access-control/index.js";
import { acquireBackendLease, backendPaths, currentBackendIdentity, publishBackendDescriptor, releaseBackendLease, readBackendLease } from "../adapters/backend-host/index.js";
import { pinBackendRuntime } from "../adapters/backend-host/runtime-pins.js";
import { startJumpyBrainHttpServer } from "./index.js";

/** Headless shared lifetime: deliberately independent of any app window. */
export async function runBackendDaemon(rootArgument: string): Promise<void> {
  const { root } = await backendPaths(rootArgument, true);
  const identity = await currentBackendIdentity();
  if (process.env.JUMPYBRAIN_BACKEND_GENERATION && process.env.JUMPYBRAIN_BACKEND_GENERATION !== identity.runtimeGeneration) throw new Error("Runtime changed before launch; retry from the installed runtime.");
  const lease = await acquireBackendLease(root, identity);
  if (!lease) return;
  try { await pinBackendRuntime(root, lease); }
  catch (error) { await releaseBackendLease(root, lease.instanceId); throw error; }
  const token = randomBytes(32).toString("base64url");
  const accessStore = createAccessStore(root, { bootstrapKeys: [token], bootstrapOwner: {token, id: "local-owner:" + lease.rootId} });
  let server: Awaited<ReturnType<typeof startJumpyBrainHttpServer>> | undefined;
  let ownershipTimer: ReturnType<typeof setInterval> | undefined;
  let stopping: Promise<void> | undefined;
  let finish!: () => void;
  const lifetime = new Promise<void>(resolve => { finish = resolve; });
  const stop = () => {
    if (!stopping) stopping = (async () => {
      if (ownershipTimer) clearInterval(ownershipTimer);
      try { await server?.close(); }
      finally {
        accessStore.close();
        try { await releaseBackendLease(root, lease.instanceId); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        finally { finish(); }
      }
    })();
    return stopping;
  };
  const signal = () => { void stop().catch(() => { process.exitCode = 1; finish(); }); };
  try {
    const options = {
      root, apiKeys: [token], host: "127.0.0.1", port: 0, autoIndex: false as const, lazyIndex: true,
      accessStore, localOwnerToken: token,
      backendControl: { ...identity, instanceId: lease.instanceId, rootId: lease.rootId, stop: signal },
    };
    server = await startJumpyBrainHttpServer(options);
    await publishBackendDescriptor({ ...lease, root, url: server.url, token });
    process.once("SIGTERM", signal); process.once("SIGINT", signal);
    let inspecting = false;
    ownershipTimer = setInterval(() => {
      if (inspecting) return;
      inspecting = true;
      void readBackendLease(root).then(current => {
        if (current?.instanceId !== lease.instanceId || current.pid !== process.pid) signal();
      }, signal).finally(() => { inspecting = false; });
    }, 1000);
    ownershipTimer.unref();
    await lifetime;
    await stopping;
  } finally {
    process.off("SIGTERM", signal); process.off("SIGINT", signal);
    await stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.JUMPYBRAIN_BACKEND_ROOT;
  if (!root || !path.isAbsolute(root)) { console.error("Backend requires an explicit absolute memory root."); process.exitCode = 1; }
  else await runBackendDaemon(root).catch(() => { console.error("Backend startup or shutdown failed; inspect its private operational state."); process.exitCode = 1; });
}
