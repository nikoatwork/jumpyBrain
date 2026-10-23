import http, { type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { HTTP_MEMORY_ROUTES } from "../http-protocol.js";
import { createFileLogger, type FileLogger } from "../logging/index.js";
import { createRemoteIndexRunner, startRemoteAutoIndexer, type RemoteAutoIndexer, type RemoteIndexRunner } from "../../app/server-memory/auto-index.js";
import { RESPONSE_ERROR_CODE, errorResponse, routeRequest, writeJson } from "./routes.js";
import path from "node:path";
import { createDiagnosticStore, newDiagnosticId, type DiagnosticStore } from "../diagnostics/store.js";
import { diagnosticId } from "../diagnostics/events.js";
import { diagnosticRequestContext, diagnosticServerLogger } from "../diagnostics/server-logging.js";
import { readDiagnosticBuildInfo } from "../diagnostics/build-info.js";
import { createFeedbackForwarder, createFeedbackHandler, type FeedbackSender } from "./feedback-delivery.js";

export interface JumpyBrainHttpServerOptions {
  feedbackSender?: FeedbackSender;
  root: string;
  apiKeys: string[];
  indexRunner?: RemoteIndexRunner;
  logger?: FileLogger;
  diagnostics?: DiagnosticStore;
  searchTimeoutMs?: number;
  indexTimeoutMs?: number;
  /** Host-owned maintenance hooks; authenticated routes only signal activity. */
  onMemoryWrite?: () => void;
  onMemoryActivity?: () => void;
  maintenance?: () => { enabled: boolean; indexing: boolean; failed: boolean };
}

export interface StartedJumpyBrainHttpServer {
  diagnostics: DiagnosticStore;
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

  const diagnostics = options.diagnostics ?? createDiagnosticStore({ directory: path.join(root, ".jumpybrain", "logs", "diagnostics"), component: "server", persist: options.logger === undefined, metadata: readDiagnosticBuildInfo() });
  const logger = diagnosticServerLogger(options.logger ?? createFileLogger({ root, name: "server" }), diagnostics);
  diagnostics.record({ operation: "startup", severity: "info", outcome: "ok", code: "none" });
  const indexRunner = options.indexRunner ?? createRemoteIndexRunner({
    root,
    timeoutMs: options.indexTimeoutMs,
    logger: (level, event, details) => logger.log(level, `auto_index_${event}`, details),
  });
  let writeQueue = Promise.resolve();
  const enqueueWrite = async <T>(operation: () => Promise<T>): Promise<T> => {
    const current = writeQueue.then(operation, operation);
    writeQueue = current.then(() => undefined, () => undefined);
    return current;
  };

  const requests = new Set<AbortController>();
  const feedback = createFeedbackHandler(options.feedbackSender ?? createFeedbackForwarder());
  const handlers = new Set<Promise<void>>();
  let shuttingDown = false;
  const server = http.createServer((request, response) => diagnosticRequestContext.run(diagnosticId(request.headers["x-jumpybrain-request"]) ?? newDiagnosticId(), async () => {
    response.setHeader("X-JumpyBrain-Request", diagnosticRequestContext.getStore()!);
    let finish!: () => void;
    const completed = new Promise<void>(resolve => { finish = resolve; });
    handlers.add(completed);
    const controller = new AbortController();
    requests.add(controller);
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    const shutdownRequest = () => { if (!request.complete) request.destroy(); };
    controller.signal.addEventListener("abort", shutdownRequest, { once: true });
    request.once("aborted", disconnect);
    response.once("close", disconnect);
    if (shuttingDown) controller.abort();
    const startedAt = performance.now();
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      await routeRequest({ request, response, root, apiKeys, enqueueWrite, indexRunner, logger, signal: controller.signal, searchTimeoutMs: options.searchTimeoutMs, feedback, onMemoryWrite: options.onMemoryWrite, onMemoryActivity: options.onMemoryActivity, maintenance: options.maintenance });
    } catch (error) {
      logger.error("http_unhandled_error", { method: request.method, path: url.pathname, code: "server_misconfigured" });
      writeJson(response, 500, errorResponse("server_misconfigured", "Server request failed."));
    } finally {
      requests.delete(controller);
      controller.signal.removeEventListener("abort", shutdownRequest);
      request.off("aborted", disconnect);
      response.off("close", disconnect);
      handlers.delete(completed);
      finish();
      if (url.pathname !== HTTP_MEMORY_ROUTES.health) {
        logger.info("http_request", {
          method: request.method,
          path: url.pathname,
          status: response.statusCode,
          duration_ms: performance.now() - startedAt,
          error_code: (response as ServerResponse & { [RESPONSE_ERROR_CODE]?: string })[RESPONSE_ERROR_CODE],
        });
      }
    }
  }));
  // Finite body receipt, separate from the backend operation deadline.
  server.requestTimeout = 30_000;
  server.headersTimeout = 30_000;
  const close = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => {
    shuttingDown = true;
    for (const controller of requests) controller.abort();
    const stopped = indexRunner.stop?.() ?? Promise.resolve();
    // A disconnected socket can be closed while its async route still owns a
    // child/lock. Native close alone is not an application-work drain.
    close(error => { void Promise.all([stopped, ...handlers]).then(async () => {
      diagnostics.record({ operation: "shutdown", severity: "info", outcome: "ok", code: "none" });
      await Promise.all([diagnostics.flush(), logger.flush?.()]); callback?.(error);
    }, () => callback?.(error)); });
    return server;
  }) as typeof server.close;
  return server;
}

export async function startJumpyBrainHttpServer(options: JumpyBrainHttpServerOptions & { host?: string; port?: number; autoIndex?: false | { intervalMs?: number; startTimer?: boolean; quietMs?: number; maxDeferralMs?: number; startupMs?: number } }): Promise<StartedJumpyBrainHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3787;
  const root = options.root.trim();
  const logger = options.logger ?? createFileLogger({ root, name: "server" });
  const diagnostics = options.diagnostics ?? createDiagnosticStore({ directory: path.join(root, ".jumpybrain", "logs", "diagnostics"), component: "server", persist: options.logger === undefined, metadata: readDiagnosticBuildInfo() });
  const indexLogger = diagnosticServerLogger(logger, diagnostics);
  const indexRunner = options.indexRunner ?? createRemoteIndexRunner({
    root,
    timeoutMs: options.indexTimeoutMs,
    logger: (level, event, details) => indexLogger.log(level, `auto_index_${event}`, details),
  });
  let autoIndex: RemoteAutoIndexer | undefined;

  const server = createJumpyBrainHttpServer({ ...options, root, indexRunner, logger, diagnostics,
    onMemoryWrite: () => { autoIndex?.notifyWrite(); options.onMemoryWrite?.(); },
    onMemoryActivity: () => { autoIndex?.notifyActivity(); options.onMemoryActivity?.(); },
    maintenance: () => autoIndex?.status() ?? options.maintenance?.() ?? ({ enabled: false, indexing: indexRunner.isIndexing(), failed: false }),
  });
  autoIndex = options.autoIndex === false ? undefined : startRemoteAutoIndexer({
    root,
    indexRunner,
    intervalMs: options.autoIndex?.intervalMs,
    startTimer: options.autoIndex?.startTimer,
    quietMs: options.autoIndex?.quietMs,
    maxDeferralMs: options.autoIndex?.maxDeferralMs,
    startupMs: options.autoIndex?.startupMs,
    logger: (level, event, details) => indexLogger.log(level, `auto_index_${event}`, details),
  });


  // Direct server.close and the convenience close() both stop scheduled work
  // before runner shutdown, so no timer can join a draining runner.
  const closeServer = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => {
    autoIndex?.stop();
    return closeServer(callback);
  }) as typeof server.close;

  try { await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  }); } catch (error) {
    autoIndex?.stop();
    await indexRunner.stop?.();
    throw error;
  }

  const address = server.address() as AddressInfo;
  const url = `http://${address.address}:${address.port}`;
  return {
    diagnostics,
    server,
    url,
    autoIndex,
    close: () => {
      autoIndex?.stop();
      return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
