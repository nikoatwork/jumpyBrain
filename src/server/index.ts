import { packageVersion } from "../adapters/package-info/index.js";
import { createServerMemoryRuntime as createAppServerMemoryRuntime, type ServerMemoryRuntime, type ServerMemoryRuntimeOptions } from "../app/server-memory/index.js";

export * from "../adapters/http-server/index.js";
export * from "../app/server-memory/auto-index.js";
export * from "../app/server-memory/state.js";
export * from "./config.js";
export type { ServerMemoryRuntime, ServerMemoryRuntimeOptions } from "../app/server-memory/index.js";

/**
 * Compose jumpyBrain's server-memory app use cases for a server process using
 * a server-local Markdown memory root. This is intentionally not an HTTP
 * daemon and does not import CLI command parsing code.
 */
export function createServerMemoryRuntime(options: ServerMemoryRuntimeOptions): ServerMemoryRuntime {
  return createAppServerMemoryRuntime({ ...options, packageVersion });
}
