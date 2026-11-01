import { randomBytes } from "node:crypto";
import { claimRootBackend, startBackendControlProxy } from "../app/backend-host/index.js";
import { stringArg, stringListArg, type ParsedCliArgs } from "./args.js";

export async function serveCli(args: ParsedCliArgs): Promise<void> {
  const server = await import("../server/index.js");
  const apiKeys = stringListArg(args, "api-key");
  const config = server.resolveServerConfig({
    root: stringArg(args, "root", false).trim() || undefined,
    host: stringArg(args, "host", false).trim() || undefined,
    port: stringArg(args, "port", false).trim() || undefined,
    apiKeys: apiKeys.length > 0 ? apiKeys : undefined,
    publicBaseUrl: stringArg(args, "public-base-url", false).trim() || undefined,
  });

  const memory = server.createServerMemoryRuntime({ root: config.root });
  if (args.init) {
    await memory.initializeMemoryRoot();
  } else {
    const status = await memory.memoryRootStatus();
    if (!status.initialized || !status.compatible) {
      throw new Error(status.message ?? "Server memory root is not initialized or compatible. Re-run with --init to initialize it.");
    }
  }

  const owner = await claimRootBackend(config.root);
  const token = randomBytes(32).toString("base64url");
  let stop!: () => void;
  const lifetime = new Promise<void>(resolve => {stop = resolve;});
  const shutdown = () => stop();
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
  let started: Awaited<ReturnType<typeof server.startJumpyBrainHttpServer>> | undefined;
  let control: Awaited<ReturnType<typeof startBackendControlProxy>> | undefined;
  try {
    started = await server.startJumpyBrainHttpServer({...config, apiKeys: [...config.apiKeys, token], localOwnerToken: token,
      backendControl: {...owner.lease, stop: shutdown}});
    const address = started.server.address() as import("node:net").AddressInfo;
    control = await startBackendControlProxy(address);
    await owner.publish({url: control.url, token});
    console.log(`jumpyBrain server listening on ${started.url}`);
    await lifetime;
  } finally {
    process.off("SIGINT", shutdown); process.off("SIGTERM", shutdown);
    try { await started?.close(); }
    finally { try { await control?.close(); } finally { await owner.release(); } }
  }
}
