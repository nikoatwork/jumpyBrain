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

  const started = await server.startJumpyBrainHttpServer(config);
  console.log(`jumpyBrain server listening on ${started.url}`);

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      await started.close();
      resolve();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
