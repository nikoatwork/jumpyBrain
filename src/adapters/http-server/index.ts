import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { AccessStore, type Principal } from "../access-control/index.js";
import { createCollaborationHub } from "../../app/collaboration/index.js";
import { createLiveServer } from "../live/index.js";
import { callBackend } from "../../app/backend-rpc.js";
import { backendCallMutates, backendDocumentPrecondition } from "../backend-protocol.js";
import { packageVersion } from "../package-info/index.js";
import http, { type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { HTTP_MEMORY_ROUTES } from "../http-protocol.js";
import { createFileLogger, type FileLogger } from "../logging/index.js";
import { createRemoteIndexRunner, startRemoteAutoIndexer, type RemoteAutoIndexer, type RemoteIndexRunner } from "../../app/server-memory/auto-index.js";
import { RESPONSE_ERROR_CODE, errorResponse, routeRequest, writeJson, parseJsonBody, isJsonError } from "./routes.js";
import path from "node:path";
import { createDiagnosticStore, newDiagnosticId, type DiagnosticStore } from "../diagnostics/store.js";
import { diagnosticId } from "../diagnostics/events.js";
import { diagnosticRequestContext, diagnosticServerLogger } from "../diagnostics/server-logging.js";
import { readDiagnosticBuildInfo } from "../diagnostics/build-info.js";
import { createFeedbackForwarder, createFeedbackHandler, type FeedbackSender } from "./feedback-delivery.js";

export interface JumpyBrainHttpServerOptions {
  accessStore?: AccessStore;
  localOwnerToken?: string;
  /** Start maintenance only after an actual write; readiness and inspection remain inference-free. */
  lazyIndex?: boolean;
  onBackendActivate?: () => void;
  backendControl?: {instanceId: string; rootId: string; executable: string; executableHash?: string; build?: string; version?: string; stop: () => void};
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
  if (apiKeys.length === 0 && !options.accessStore) throw new Error("At least one server API key is required.");

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

  const access = options.accessStore ?? new AccessStore(root, { bootstrapKeys: apiKeys, ...(options.localOwnerToken && options.backendControl ? {bootstrapOwner: {token: options.localOwnerToken, id: "local-owner:" + options.backendControl.rootId}} : {}) });
  const collaboration = createCollaborationHub({root, enqueueWrite, onWrite: options.onMemoryWrite});
  const authenticate = (token: string) => access.authenticate(token);
  let cookieRoot = root; try {cookieRoot = realpathSync(root);} catch {}
  const cookieName = "jumpybrain_session_v2_" + createHash("sha256").update(cookieRoot).digest("hex").slice(0,16);
  const sessionToken = (request: http.IncomingMessage) => {
    const raw = request.headers.cookie?.split(";").map(value=>value.trim()).find(value=>value.startsWith(cookieName + "="))?.slice(cookieName.length+1);
    try {return raw ? decodeURIComponent(raw) : undefined;} catch {return undefined;}
  };
  const cookieAttributes = (request: http.IncomingMessage) => "; HttpOnly; SameSite=Strict; Path=/" + ((request.socket as any).encrypted || request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "");
  const requests = new Set<AbortController>();
  const operations = new Map<string, AbortController>();
  const cancelledOperations = new Map<string, number>();
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
      if (url.pathname === "/session" && request.method === "DELETE") {
        if (request.headers.origin !== "http://" + request.headers.host && request.headers.origin !== "https://" + request.headers.host) {writeJson(response,403,errorResponse("untrusted_origin","Use the browser session origin."));return;}
        response.setHeader("Set-Cookie",cookieName + "=; Max-Age=0" + cookieAttributes(request)); writeJson(response,200,{signedOut:true});return;
      }
      const publicPath = ["/", "/graph", "/graph/", "/favicon.svg", HTTP_MEMORY_ROUTES.health].includes(url.pathname);
      let principal: Principal | undefined;
      if (!publicPath) {
        const header = request.headers.authorization;
                const browserToken = sessionToken(request);
        const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
        const usesCookie = !bearer || bearer === "browser-session";
        if (usesCookie && browserToken && !["GET","HEAD"].includes(request.method ?? "") && request.headers.origin !== "http://" + request.headers.host && request.headers.origin !== "https://" + request.headers.host) {writeJson(response,403,errorResponse("untrusted_origin","Use the browser session origin.")); return;}
        principal = await authenticate(usesCookie ? browserToken ?? "" : bearer);
        if (!principal) { writeJson(response, 401, errorResponse(header?.startsWith("Bearer ") ? "invalid_api_key" : "auth_required", header?.startsWith("Bearer ") ? "Invalid API key." : "Missing Authorization bearer token.")); return; }
        const readPosts = [HTTP_MEMORY_ROUTES.search, HTTP_MEMORY_ROUTES.recall, HTTP_MEMORY_ROUTES.compactRecall, HTTP_MEMORY_ROUTES.expand, HTTP_MEMORY_ROUTES.resolveTitle, HTTP_MEMORY_ROUTES.dreamSources];
        if (principal.role === "reader" && !["GET", "HEAD"].includes(request.method ?? "") && !(request.method === "POST" && readPosts.includes(url.pathname as any))) {
          writeJson(response, 403, errorResponse("read_only", "This credential grants reader access.")); return;
        }
        if (url.pathname.startsWith("/_backend/") || url.pathname.startsWith("/access")) {
          if (principal.role !== "admin") { writeJson(response, 403, errorResponse("admin_required", "Backend administration requires operator access.")); return; }
        }
      }
      response.setHeader("cache-control", "no-store");
      if (url.pathname === "/session" && request.method === "GET") {
        const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7).trim() : undefined;
        if (bearer && bearer !== "browser-session") response.setHeader("Set-Cookie",cookieName + "=" + encodeURIComponent(bearer) + "; Max-Age=86400" + cookieAttributes(request));
        writeJson(response,200,{protocol:2,principal}); return;
      }
      if (url.pathname === "/capabilities" && request.method === "GET") {
        writeJson(response, 200, {protocol: 2, brainId: createHash("sha256").update(cookieRoot).digest("hex"), live: true, principal, maxDocumentBytes: collaboration.maxDocumentBytes}); return;
      }
      if (url.pathname === "/_backend/activate" && request.method === "POST") {options.onBackendActivate?.(); writeJson(response,200,{activated:true}); return;}
      if (url.pathname === "/_backend/diagnostics" && request.method === "GET") {writeJson(response, 200, await diagnostics.snapshot()); return;}
      if (url.pathname === "/_backend/cancel" && request.method === "POST") {
        const body = await parseJsonBody(request); if (isJsonError(body)) {writeJson(response,body.statusCode,body.body); return;}
        if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id)) {writeJson(response,400,errorResponse("invalid_request","Use the operation identifier.")); return;}
        const operation = operations.get(body.id);
        for (const [id,until] of cancelledOperations) if (until < Date.now()) cancelledOperations.delete(id);
        if (!operation) {if (cancelledOperations.size >= 256) {writeJson(response,429,errorResponse("execution_overloaded","Cancellation admission is full."));return;} cancelledOperations.set(body.id,Date.now()+30_000);}
        operation?.abort(); writeJson(response, 200, {cancelled: true}); return;
      }
      if (url.pathname === "/_backend/ready" && request.method === "GET" && options.backendControl) {
        const {stop: _stop, ...identity} = options.backendControl;
        writeJson(response, 200, {protocol: 2, ...identity, pid: process.pid}); return;
      }
      if (url.pathname === "/_backend/stop" && request.method === "POST" && options.backendControl) {
        writeJson(response, 200, {stopping: true}); setImmediate(options.backendControl.stop); return;
      }
      if (url.pathname === "/access" && request.method === "GET") { writeJson(response, 200, {credentials: await access.list()}); return; }
      if (url.pathname === "/access" && request.method === "POST") {
        const body = await parseJsonBody(request);
        if (isJsonError(body)) {writeJson(response, body.statusCode, body.body); return;}
        try { writeJson(response, 201, await access.issue(body as any)); }
        catch { writeJson(response, 400, errorResponse("invalid_credential", "Use a name and reader or writer role.")); } return;
      }
      if (/^\/access\/[a-f0-9-]{36}$/.test(url.pathname) && request.method === "DELETE") {
        writeJson(response, 200, await access.revoke(url.pathname.slice(8))); return;
      }
      if (url.pathname === "/_backend/call" && request.method === "POST") {
        const body = await parseJsonBody(request);
        if (isJsonError(body)) {writeJson(response, body.statusCode, body.body); return;}
        if (typeof body.method !== "string" || !Array.isArray(body.args)) {writeJson(response, 400, errorResponse("invalid_request", "Use a method and arguments.")); return;}
        const method = body.method, args = body.args;
        const operationId = request.headers["x-jumpybrain-operation"];
        if (typeof operationId === "string" && /^[a-f0-9-]{36}$/.test(operationId)) {
          if (operations.has(operationId)) {writeJson(response,409,errorResponse("duplicate_operation","Operation identifiers cannot be reused."));return;}
          operations.set(operationId, controller);
          const cancelled = cancelledOperations.get(operationId); cancelledOperations.delete(operationId);
          if (cancelled && cancelled >= Date.now()) controller.abort();
        }
        const operation = async () => {
          if (controller.signal.aborted) throw Object.assign(new Error("Memory operation canceled."),{code:"execution_aborted"});
          const guard = backendDocumentPrecondition(method, args);
          if (guard) await collaboration.beforeLegacyWrite(guard.id, guard.ifMatch);
          const result = await callBackend(root, method, args, controller.signal, await packageVersion(), typeof body.qmdBinary === "string" ? body.qmdBinary : body.qmdBinary === null ? null : undefined);
          if (backendCallMutates(method)) { await collaboration.notifyCanonicalWrite(); options.onMemoryWrite?.(); }
          return result;
        };
        try {writeJson(response, 200, {result: await (backendCallMutates(method) ? enqueueWrite(operation) : operation())});}
        catch (error) { const e = error as any; writeJson(response, 400, errorResponse(typeof e.code === "string" ? e.code : "backend_failed", e.message ?? "Backend operation failed.", e.details)); }
        if (typeof operationId === "string") operations.delete(operationId);
        return;
      }
      await routeRequest({ request, response, root, apiKeys, principal, collaboration, enqueueWrite, indexRunner, logger, signal: controller.signal, searchTimeoutMs: options.searchTimeoutMs, feedback, onMemoryWrite: options.onMemoryWrite, onMemoryActivity: options.onMemoryActivity, maintenance: options.maintenance });
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
  const live = createLiveServer({server, hub: collaboration, authenticate, sessionToken, brainId: createHash("sha256").update(cookieRoot).digest("hex")});
  // Finite body receipt, separate from the backend operation deadline.
  server.requestTimeout = 30_000;
  server.headersTimeout = 30_000;
  const close = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => {
    shuttingDown = true;
    for (const controller of requests) controller.abort();
    const stopped = Promise.all([indexRunner.stop?.(), live.close(), collaboration.close()]);
    if (!options.accessStore) access.close();
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

  const startMaintenance = () => startRemoteAutoIndexer({root,indexRunner,logger: (level,event,details) => indexLogger.log(level, `auto_index_${event}`, details)});
  const server = createJumpyBrainHttpServer({ ...options, root, indexRunner, logger, diagnostics,
    onBackendActivate: () => {if (options.lazyIndex && !autoIndex) autoIndex = startMaintenance(); options.onBackendActivate?.();},
    onMemoryWrite: () => { if (options.lazyIndex && !autoIndex) autoIndex = startMaintenance(); autoIndex?.notifyWrite(); options.onMemoryWrite?.(); },
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
  const url = `http://${address.family === "IPv6" ? "[" + address.address + "]" : address.address}:${address.port}`;
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
