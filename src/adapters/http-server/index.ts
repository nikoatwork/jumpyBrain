import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { AccessError, AccessStore, BrowserSessionStore, ROLE_CAPABILITIES, SESSION_COOKIE_MAX_AGE_SECONDS, browserDeviceLabel, hasCapability, roleCapabilities, type AccessRole, type Principal } from "../access-control/index.js";
import { canonicalPublicationEvidence, createCollaborationHub } from "../../app/collaboration/index.js";
import { createLiveServer } from "../live/index.js";
import { callBackend } from "../../app/backend-rpc.js";
import { backendCallMutates, backendDocumentPrecondition } from "../backend-protocol.js";
import { packageVersion } from "../package-info/index.js";
import http, { type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { HTTP_MEMORY_ROUTES } from "../http-protocol.js";
import { createFileLogger, type FileLogger } from "../logging/index.js";
import { createRemoteIndexRunner, startRemoteAutoIndexer, type RemoteAutoIndexer, type RemoteIndexRunner } from "../../app/server-memory/auto-index.js";
import { prewarmSmartSearch, retainWarmSmartSearch } from "../../app/server-memory/index.js";
import { isDrawingStaticPath } from "./drawing-assets.js";
import { browserBasePath } from "./browser-app-url.js";
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
  /**
   * Long-lived search host (root backend, `serve`): keep the smart-search model
   * loaded between searches and pre-warm it in the background when this root's
   * smart search is ready. Released when the server closes.
   */
  warmSmartSearch?: boolean;
  onBackendActivate?: () => void;
  backendControl?: {instanceId: string; rootId: string; executable: string; executableHash?: string; build?: string; version?: string; stop: () => void};
  feedbackSender?: FeedbackSender;
  root: string;
  /** Public path prefix (e.g. "/sherpa") when a reverse proxy serves this brain below "/" and strips it. */
  basePath?: string;
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
  /** Test seam: the clock for browser session renewal, inactivity and invite expiry. */
  now?: () => number;
}

export interface StartedJumpyBrainHttpServer {
  diagnostics: DiagnosticStore;
  server: Server;
  url: string;
  autoIndex?: RemoteAutoIndexer;
  close(): Promise<void>;
}

// Agents often guess X-API-Key; name the one accepted header instead.
const MISSING_BEARER = "Missing Authorization bearer token. Send the access key as `Authorization: Bearer <key>`; X-API-Key and query parameters are not accepted. Agents should prefer the jumpybrain CLI with --target-url.";

export function createJumpyBrainHttpServer(options: JumpyBrainHttpServerOptions): Server {
  const root = options.root.trim();
  if (!root) throw new Error("Server memory root is required.");
  const apiKeys = options.apiKeys.map((key) => key.trim()).filter(Boolean);
  if (apiKeys.length === 0 && !options.accessStore) throw new Error("At least one server API key is required.");
  // Plain segments only (as from --public-base-url): the value also becomes a cookie Path.
  const basePath = browserBasePath(options.basePath ?? "");
  if (basePath && !/^(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+$/.test(basePath)) throw new Error("Server base path must be plain segments such as /sherpa.");

  const diagnostics = options.diagnostics ?? createDiagnosticStore({ directory: path.join(root, ".jumpybrain", "logs", "diagnostics"), createBelow: root, component: "server", persist: options.logger === undefined, metadata: readDiagnosticBuildInfo() });
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
  const sessions = new BrowserSessionStore(root, {now: options.now});
  let cookieRoot = root; try {cookieRoot = realpathSync(root);} catch {}
  // A prefixed brain's cookie name also carries its prefix: containers on one host may share an internal root path.
  const cookieSuffix = createHash("sha256").update(basePath ? cookieRoot + "\0" + basePath : cookieRoot).digest("hex").slice(0,16);
  // v3 holds an opaque session secret; v2 (before 2026-11-25) held the raw access key for 24 hours.
  const cookieName = "jumpybrain_session_v3_" + cookieSuffix, legacyCookieName = "jumpybrain_session_v2_" + cookieSuffix;
  const readCookie = (request: http.IncomingMessage, name: string) => {
    const raw = request.headers.cookie?.split(";").map(value=>value.trim()).find(value=>value.startsWith(name + "="))?.slice(name.length+1);
    try {return raw ? decodeURIComponent(raw) : undefined;} catch {return undefined;}
  };
  // The browser credential, tagged by kind. Only cookie paths resolve these values.
  const browserCredential = (request: http.IncomingMessage) => {
    const session = readCookie(request, cookieName); if (session) return "s:" + session;
    const legacy = readCookie(request, legacyCookieName); return legacy ? "k:" + legacy : undefined;
  };
  const resolveSession = async (secret: string) => {
    const found = await sessions.resolve(secret); if (!found) return undefined;
    const principal = await access.authenticateId(found.session.keyId);
    return principal ? {principal, session: found.session, renew: found.renew} : undefined;
  };
  const authenticateBrowser = async (value: string) => value.startsWith("s:") ? (await resolveSession(value.slice(2)))?.principal
    : value.startsWith("k:") ? access.authenticate(value.slice(2)) : undefined;
  // Under a prefix the browser only sends this brain's cookie to this brain's paths.
  const cookieAttributes = (request: http.IncomingMessage) => "; HttpOnly; SameSite=Strict; Path=" + (basePath || "/") + ((request.socket as any).encrypted || request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "");
  const setCookies = (response: ServerResponse, cookies: string[]) => {
    const existing = response.getHeader("Set-Cookie");
    response.setHeader("Set-Cookie", [...(Array.isArray(existing) ? existing : existing ? [String(existing)] : []), ...cookies]);
  };
  const sessionCookie = (request: http.IncomingMessage, secret: string) => cookieName + "=" + encodeURIComponent(secret) + "; Max-Age=" + SESSION_COOKIE_MAX_AGE_SECONDS + cookieAttributes(request);
  const clearCookie = (request: http.IncomingMessage, name: string) => name + "=; Max-Age=0" + cookieAttributes(request);
  const sessionLimit = (response: ServerResponse, error: unknown) => {
    if (!(error instanceof AccessError) || error.code !== "session_limit") return false;
    writeJson(response, 503, errorResponse("session_limit", "This brain has too many signed-in browsers. Ask an admin to sign some out.")); return true;
  };
  const sameOrigin = (request: http.IncomingMessage) => request.headers.origin === "http://" + request.headers.host || request.headers.origin === "https://" + request.headers.host;
  /** Start a browser session for an authenticated key, replacing this browser's previous one. */
  const keyActive = (id: string) => access.authenticateId(id).then(Boolean);
  const startBrowserSession = async (request: http.IncomingMessage, response: ServerResponse, principal: Principal) => {
    const previous = readCookie(request, cookieName), legacy = readCookie(request, legacyCookieName) ? [clearCookie(request, legacyCookieName)] : [];
    // The same key again (Update key with an unchanged key) keeps this browser's session, so other tabs stay connected.
    const current = previous ? await sessions.resolve(previous) : undefined;
    if (current?.session.keyId === principal.id) {
      // The cookie's lifetime restarts only together with the server's record of use.
      if (current.renew && await sessions.touch(current.session.id)) setCookies(response, [sessionCookie(request, previous!)]);
      if (legacy.length) setCookies(response, legacy);
      return current.session;
    }
    const started = await sessions.create({keyId: principal.id, role: principal.role, label: browserDeviceLabel(request.headers["user-agent"]), replacing: previous, keyActive});
    setCookies(response, [sessionCookie(request, started.secret), ...legacy]);
    return started.session;
  };
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
        if (!sameOrigin(request)) {writeJson(response,403,errorResponse("untrusted_origin","Use the browser session origin."));return;}
        // Sign out: the server-side session ends, so a copied cookie stops working too.
        const current = readCookie(request, cookieName); if (current) await sessions.end(current);
        setCookies(response, [clearCookie(request, cookieName), clearCookie(request, legacyCookieName)]); writeJson(response,200,{signedOut:true});return;
      }
      if (url.pathname === "/session/invite") {
        if (request.method !== "POST") {writeJson(response,405,errorResponse("method_not_allowed","Use POST.")); return;}
        // Exact Origin, scheme included: another site cannot sign this browser in to a session of its choosing.
        const scheme = (request.socket as any).encrypted || request.headers["x-forwarded-proto"] === "https" ? "https://" : "http://";
        if (request.headers.origin !== scheme + request.headers.host) {writeJson(response,403,errorResponse("untrusted_origin","Use the browser session origin."));return;}
        response.setHeader("cache-control", "no-store");
        const body = await parseJsonBody(request); if (isJsonError(body)) {writeJson(response,body.statusCode,body.body); return;}
        // An invite never replaces a live sign-in: the code stays unused and the browser keeps its identity.
        // Both cookie kinds are checked on their own: a dead v3 cookie must not hide a live v2 sign-in.
        const previous = readCookie(request, cookieName), legacyKey = readCookie(request, legacyCookieName);
        if ((previous && await resolveSession(previous)) || (legacyKey && await access.authenticate(legacyKey))) {writeJson(response,409,errorResponse("already_signed_in","This browser is already signed in. Sign out first to use this invite link.")); return;}
        let redeemed;
        try { redeemed = await sessions.redeemInvite(typeof body.code === "string" ? body.code : "", {label: browserDeviceLabel(request.headers["user-agent"]), replacing: previous, principal: id => access.authenticateId(id), keyActive}); }
        catch (error) { if (sessionLimit(response, error)) return; throw error; }
        if (!redeemed) {writeJson(response,410,errorResponse("invite_invalid","This invite link has expired or was already used. Ask for a new link.")); return;}
        setCookies(response, [sessionCookie(request, redeemed.secret), ...(readCookie(request, legacyCookieName) ? [clearCookie(request, legacyCookieName)] : [])]);
        writeJson(response,200,{protocol:2,principal:redeemed.principal,session:redeemed.session}); return;
      }
      const publicPath = ["/", "/graph", "/graph/", "/favicon.svg", HTTP_MEMORY_ROUTES.health].includes(url.pathname) || isDrawingStaticPath(url.pathname);
      let principal: Principal | undefined, browserSessionId: string | undefined;
      if (!publicPath) {
        const header = request.headers.authorization;
        const browserValue = browserCredential(request);
        const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
        const usesCookie = !bearer || bearer === "browser-session";
        if (usesCookie && browserValue && !["GET","HEAD"].includes(request.method ?? "") && !sameOrigin(request)) {writeJson(response,403,errorResponse("untrusted_origin","Use the browser session origin.")); return;}
        if (!usesCookie) principal = await authenticate(bearer!);
        else if (browserValue?.startsWith("s:")) {
          const resolved = await resolveSession(browserValue.slice(2));
          principal = resolved?.principal; browserSessionId = resolved?.session.id;
          // Use renews the session: last use is recorded and the 400-day cookie re-issued at most once a day.
          if (resolved?.renew && await sessions.touch(resolved.session.id)) setCookies(response, [sessionCookie(request, browserValue.slice(2))]);
          // A 401 does not clear the cookie: a late reply for an ended session could otherwise erase
          // the newer session another tab just installed. Sign-in overwrites it; sign-out clears it.
        } else if (browserValue) principal = await authenticate(browserValue.slice(2));
        if (!principal) { writeJson(response, 401, errorResponse(header?.startsWith("Bearer ") ? "invalid_api_key" : "auth_required", header?.startsWith("Bearer ") ? "Invalid API key." : MISSING_BEARER)); return; }
        const readPosts = [HTTP_MEMORY_ROUTES.search, HTTP_MEMORY_ROUTES.recall, HTTP_MEMORY_ROUTES.compactRecall, HTTP_MEMORY_ROUTES.expand, HTTP_MEMORY_ROUTES.resolveTitle, HTTP_MEMORY_ROUTES.dreamSources];
        // Roles are fixed capability sets (access-control). Every request is authorized
        // here from the freshly authenticated principal, never from what a client was told.
        if (!hasCapability(principal, "write") && !["GET", "HEAD"].includes(request.method ?? "") && !(request.method === "POST" && readPosts.includes(url.pathname as any))) {
          writeJson(response, 403, errorResponse("read_only", "This credential grants reader access.")); return;
        }
        if (url.pathname.startsWith("/access") && !hasCapability(principal, "manage_access")) {
          writeJson(response, 403, errorResponse("admin_required", "Managing access keys requires an admin key.")); return;
        }
        if (url.pathname.startsWith("/_backend/") && principal.role !== "admin") {
          writeJson(response, 403, errorResponse("admin_required", "Backend administration requires operator access.")); return;
        }
      }
      response.setHeader("cache-control", "no-store");
      if (url.pathname === "/session" && request.method === "GET") {
        const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7).trim() : undefined;
        // A key entered in Connect, or a v2 key cookie from an earlier version, becomes an opaque session.
        const exchange = bearer && bearer !== "browser-session" || (!bearer || bearer === "browser-session") && browserCredential(request)?.startsWith("k:");
        let session;
        try { session = exchange && principal ? await startBrowserSession(request, response, principal) : undefined; }
        catch (error) { if (sessionLimit(response, error)) return; throw error; }
        writeJson(response,200,{protocol:2,principal,...(session ? {session} : {})}); return;
      }
      if (url.pathname === "/capabilities" && request.method === "GET") {
        // `capabilities` describes this credential; `roles` names every fixed set. Both are
        // advisory for presentation: the checks above remain the only authorization.
        writeJson(response, 200, {protocol: 2, brainId: createHash("sha256").update(cookieRoot).digest("hex"), live: true, principal, capabilities: roleCapabilities(principal?.role), roles: ROLE_CAPABILITIES, maxDocumentBytes: collaboration.maxDocumentBytes}); return;
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
        const keys = Object.keys(body);
        if (keys.some(key => key !== "name" && key !== "role")) {writeJson(response, 400, errorResponse("invalid_credential", "Use a name and reader, writer or admin role.")); return;}
        try { writeJson(response, 201, await access.issue({name: body.name as string, role: (body.role ?? "writer") as AccessRole})); }
        catch (error) {
          if (!(error instanceof AccessError) || !["invalid_credential", "credential_limit"].includes(error.code)) throw error;
          if (error.code === "credential_limit") writeJson(response, 409, errorResponse("credential_limit", "This brain has reached its access key limit."));
          else writeJson(response, 400, errorResponse("invalid_credential", "Use a name and reader, writer or admin role."));
        } return;
      }
      if (/^\/access\/[a-f0-9-]{36}$/.test(url.pathname) && request.method === "DELETE") {
        const id = url.pathname.slice(8);
        // Revoking the key that authorizes this request would lock the caller out mid-task.
        if (principal?.id === id) {writeJson(response, 409, errorResponse("cannot_revoke_current", "This key is in use for this request. Sign in with another admin key to revoke it.")); return;}
        const revoked = await access.revoke(id);
        // Authorization already fails for the revoked key; this also drops its sessions and open invites.
        await sessions.endForKey(id);
        writeJson(response, 200, {revoked}); return;
      }
      if (url.pathname === "/access/sessions" && request.method === "GET") {
        // Sessions of keys revoked elsewhere (for example `access revoke --root`) no longer authorize anything; leave them out.
        const revoked = new Set((await access.list()).filter(item => item.revokedAt).map(item => item.id));
        writeJson(response, 200, {sessions: (await sessions.list()).filter(item => !revoked.has(item.keyId)).map(item => ({...item, ...(item.id === browserSessionId ? {current: true} : {})}))}); return;
      }
      if (/^\/access\/sessions\/[a-f0-9-]{36}$/.test(url.pathname) && request.method === "DELETE") {
        writeJson(response, 200, {ended: Boolean(await sessions.endById(url.pathname.slice("/access/sessions/".length)))}); return;
      }
      if (/^\/access\/[a-f0-9-]{36}\/sessions$/.test(url.pathname) && request.method === "DELETE") {
        writeJson(response, 200, {ended: await sessions.endForKey(url.pathname.slice(8, 44))}); return;
      }
      if (/^\/access\/[a-f0-9-]{36}\/invites$/.test(url.pathname) && request.method === "POST") {
        const id = url.pathname.slice(8, 44);
        const credential = (await access.list()).find(item => item.id === id && !item.revokedAt);
        if (!credential) {writeJson(response, 404, errorResponse("not_found", "No active access key has this ID.")); return;}
        try { const invite = await sessions.createInvite(id); writeJson(response, 201, {code: invite.code, expiresAt: invite.expiresAt, credential: {id: credential.id, name: credential.name, role: credential.role}}); }
        catch (error) { if (error instanceof AccessError && error.code === "invite_limit") writeJson(response, 409, errorResponse("invite_limit", error.message)); else throw error; }
        return;
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
          if (backendCallMutates(method)) { await collaboration.notifyCanonicalWrite(undefined, canonicalPublicationEvidence(result, guard?.ifMatch)); options.onMemoryWrite?.(); }
          return result;
        };
        try {writeJson(response, 200, {result: await (backendCallMutates(method) ? enqueueWrite(operation) : operation())});}
        catch (error) { const e = error as any; writeJson(response, 400, errorResponse(typeof e.code === "string" ? e.code : "backend_failed", e.message ?? "Backend operation failed.", e.details)); }
        if (typeof operationId === "string") operations.delete(operationId);
        return;
      }
      await routeRequest({ request, response, root, basePath, apiKeys, principal, collaboration, enqueueWrite, indexRunner, logger, signal: controller.signal, searchTimeoutMs: options.searchTimeoutMs, feedback, onMemoryWrite: options.onMemoryWrite, onMemoryActivity: options.onMemoryActivity, maintenance: options.maintenance });
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
  const live = createLiveServer({server, hub: collaboration, authenticate, sessionToken: browserCredential, authenticateSession: authenticateBrowser, brainId: createHash("sha256").update(cookieRoot).digest("hex")});
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
  const diagnostics = options.diagnostics ?? createDiagnosticStore({ directory: path.join(root, ".jumpybrain", "logs", "diagnostics"), createBelow: root, component: "server", persist: options.logger === undefined, metadata: readDiagnosticBuildInfo() });
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
  let releaseWarm: (() => Promise<void>) | undefined;
  const closeServer = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => {
    autoIndex?.stop();
    // After in-flight work drains, stop warm search workers this host owns.
    return closeServer(error => { const release = releaseWarm; releaseWarm = undefined; void (release?.() ?? Promise.resolve()).then(() => callback?.(error), () => callback?.(error)); });
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

  if (options.warmSmartSearch) {
    releaseWarm = retainWarmSmartSearch();
    // Background only: startup, readiness and keyword search never wait for it.
    setTimeout(() => { void prewarmSmartSearch(root); }, 0);
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
