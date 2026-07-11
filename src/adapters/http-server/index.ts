import http, { type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { HTTP_MEMORY_ROUTES } from "../http-protocol.js";
import { createFileLogger, type FileLogger } from "../logging/index.js";
import { createRemoteIndexRunner, startRemoteAutoIndexer, type RemoteAutoIndexer, type RemoteIndexRunner } from "../../app/server-memory/auto-index.js";
import { RESPONSE_ERROR_CODE, errorResponse, routeRequest, writeJson } from "./routes.js";

export interface JumpyBrainHttpServerOptions {
  root: string;
  apiKeys: string[];
  indexRunner?: RemoteIndexRunner;
  logger?: FileLogger;
}

export interface StartedJumpyBrainHttpServer {
  server: Server;
  url: string;
  autoIndex?: RemoteAutoIndexer;
  close(): Promise<void>;
}

export function createJumpyBrainHttpServer(options: JumpyBrainHttpServerOptions): Server {
  const root = options.root.trim();
  if (!root) throw new Error("Server memory root is required.");
  const apiKeys = options.apiKeys.map((key) => key.trim()).filter(Boolean);
  if (apiKeys.length === 0) throw new Error("At least one server API key is required.");

  const logger = options.logger ?? createFileLogger({ root, name: "server" });
  const indexRunner = options.indexRunner ?? createRemoteIndexRunner({
    root,
    logger: (level, event, details) => logger.log(level, `auto_index_${event}`, details),
  });
  let writeQueue = Promise.resolve();
  const enqueueWrite = async <T>(operation: () => Promise<T>): Promise<T> => {
    const current = writeQueue.then(operation, operation);
    writeQueue = current.then(() => undefined, () => undefined);
    return current;
  };

  return http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      await routeRequest({ request, response, root, apiKeys, enqueueWrite, indexRunner, logger });
    } catch (error) {
      logger.error("http_unhandled_error", { method: request.method, path: url.pathname, message: error instanceof Error ? error.message : String(error) });
      writeJson(response, 500, errorResponse("server_misconfigured", "Server request failed."));
    } finally {
      if (url.pathname !== HTTP_MEMORY_ROUTES.health) {
        logger.info("http_request", {
          method: request.method,
          path: url.pathname,
          status: response.statusCode,
          duration_ms: Date.now() - startedAt,
          error_code: (response as ServerResponse & { [RESPONSE_ERROR_CODE]?: string })[RESPONSE_ERROR_CODE],
        });
      }
    }
  });
}

export async function startJumpyBrainHttpServer(options: JumpyBrainHttpServerOptions & { host?: string; port?: number; autoIndex?: false | { intervalMs?: number; startTimer?: boolean } }): Promise<StartedJumpyBrainHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3787;
  const root = options.root.trim();
  const logger = options.logger ?? createFileLogger({ root, name: "server" });
  const indexRunner = options.indexRunner ?? createRemoteIndexRunner({
    root,
    logger: (level, event, details) => logger.log(level, `auto_index_${event}`, details),
  });
  const server = createJumpyBrainHttpServer({ ...options, root, indexRunner, logger });
  const autoIndex = options.autoIndex === false ? undefined : startRemoteAutoIndexer({
    root,
    indexRunner,
    intervalMs: options.autoIndex?.intervalMs,
    startTimer: options.autoIndex?.startTimer,
    logger: (level, event, details) => logger.log(level, `auto_index_${event}`, details),
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const url = `http://${address.address}:${address.port}`;
  return {
    server,
    url,
    autoIndex,
    close: () => {
      autoIndex?.stop();
      return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
