import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "../websocket/index.js";
import { CollaborationError } from "../../core/collaboration/index.js";
import type {
  CollaborationHub,
  CollaborationPrincipal,
  CollaborationSnapshot,
} from "../../app/collaboration/index.js";

export interface LiveServerOptions {
  brainId?: string;
  server: Server;
  hub: CollaborationHub;
  authenticate: (token: string) => Promise<CollaborationPrincipal | undefined>;
  sessionToken?: (request: IncomingMessage) => string | undefined;
  allowedOrigin?:
    | string
    | ((origin: string, request: IncomingMessage) => boolean);
  maxFrameBytes?: number;
  maxBufferedBytes?: number;
  maxQueuedBytes?: number;
  maxTotalQueuedBytes?: number;
  maxConnections?: number;
  revalidateIntervalMs?: number;
  authenticationTimeoutMs?: number;
  authenticationCheckTimeoutMs?: number;
}
interface Subscription {
  dispose: () => void;
  clientId: string;
}
const methods = new Set([
  "edit",
  "undo",
  "redo",
  "stream.start",
  "stream.chunk",
  "stream.cancel",
  "stream.finish",
  "stream.status",
  "presence",
  "resync",
  "title",
]);
const safeCodes = new Set([
  "precondition_failed",
  "duplicate_title",
  "missing_id",
  "duplicate_id",
  "invalid_id",
  "not_found",
]);
function publicError(error: unknown) {
  if (error instanceof CollaborationError)
    return { code: error.code, message: error.message };
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "source_unavailable";
  return {
    code: safeCodes.has(code) ? code : "source_unavailable",
    message: safeCodes.has(code)
      ? code
      : "The canonical source is unavailable. Retain your draft and retry after checking the source.",
  };
}
/** Authenticated source-operation RPC. The hub owns all document state. */
export function createLiveServer(options: LiveServerOptions) {
  const frameLimit = options.maxFrameBytes ?? 3 * 1024 * 1024,
    bufferLimit = options.maxBufferedBytes ?? 6 * 1024 * 1024;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: frameLimit,
    perMessageDeflate: false,
  });
  const sockets = new Set<WebSocket>();
  const pendingChains = new Set<Promise<void>>();
  let stopping = false,
    totalQueuedBytes = 0;
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://localhost");
    } catch {
      return;
    }
    if (url.pathname !== "/ws") return;
    const reject = (status: string) => {
      socket.end(
        `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
    };
    if (stopping || sockets.size >= (options.maxConnections ?? 64)) {
      reject("503 Service Unavailable");
      return;
    }
    // A browser Origin must match exactly. Native/CLI clients omit Origin.
    const origin = request.headers.origin;
    if (origin) {
      const allowed =
        typeof options.allowedOrigin === "function"
          ? options.allowedOrigin(origin, request)
          : options.allowedOrigin
            ? origin === options.allowedOrigin
            : (() => {
                try {
                  return (
                    new URL(origin).host === request.headers.host &&
                    ["http:", "https:"].includes(new URL(origin).protocol)
                  );
                } catch {
                  return false;
                }
              })();
      if (!allowed) {
        reject("403 Forbidden");
        return;
      }
    }
    if (url.search) {
      reject("400 Bad Request");
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit("connection", ws, request),
    );
  };
  options.server.on("upgrade", upgrade);
  wss.on("connection", (socket: WebSocket, upgradeRequest: IncomingMessage) => {
    sockets.add(socket);
    let principal: CollaborationPrincipal | undefined,
      token = "",
      pending = 0,
      queuedBytes = 0,
      finished = false,
      validating = false;
    let chain = Promise.resolve();
    const subscriptions = new Map<string, Subscription>();
    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(authenticationTimer);
      clearInterval(revocationTimer);
      for (const subscription of subscriptions.values()) {
        subscription.dispose();
        if (principal) options.hub.leave(principal, subscription.clientId);
      }
      subscriptions.clear();
    };
    const close = (code: number, reason: string) => {
      if (finished) return;
      if (socket.readyState === WebSocket.OPEN) socket.close(code, reason);
      cleanup();
      const terminate = setTimeout(() => socket.terminate(), 250);
      terminate.unref?.();
    };
    const send = (value: unknown, event = false) => {
      if (finished || socket.readyState !== WebSocket.OPEN) return;
      let serialized: string;
      try {
        serialized = JSON.stringify(value);
      } catch {
        close(1011, "Serialization failed");
        return;
      }
      if (Buffer.byteLength(serialized) > frameLimit) {
        if (event) {
          close(1009, "Note exceeds live response limit; retain draft");
          return;
        }
        const id =
          typeof value === "object" && value && "id" in value ? value.id : null;
        serialized = JSON.stringify({
          id,
          ok: false,
          error: {
            code: "document_limit",
            message:
              "The escaped note exceeds the live frame limit. Reopen the canonical note before retrying; accepted edits may already be saved.",
          },
        });
      }
      if (socket.bufferedAmount + Buffer.byteLength(serialized) > bufferLimit) {
        close(1013, "Slow client; reconnect and resynchronize");
        return;
      }
      socket.send(serialized, (error) => {
        if (error) close(1011, "Transport failed");
      });
    };
    const authenticate = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined,
        current: CollaborationPrincipal | undefined;
      try {
        current = token
          ? await Promise.race([
              options.authenticate(token),
              new Promise<undefined>((resolve) => {
                timer = setTimeout(
                  () => resolve(undefined),
                  options.authenticationCheckTimeoutMs ?? 3000,
                );
                timer.unref?.();
              }),
            ])
          : undefined;
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (finished) return undefined;
      if (
        !current ||
        (principal && current.id !== principal.id) ||
        (principal && principal.role !== "reader" && current.role === "reader")
      ) {
        if (principal)
          void options.hub.revokePrincipal(principal.id).catch(() => {});
        close(1008, "Credential revoked");
        return undefined;
      }
      principal = current;
      return current;
    };
    const authenticationTimer = setTimeout(
      () => close(1008, "Authenticate first"),
      options.authenticationTimeoutMs ?? 5000,
    );
    authenticationTimer.unref?.();
    const revocationTimer = setInterval(() => {
      if (!principal || finished || validating) return;
      validating = true;
      void authenticate()
        .catch(() => close(1008, "Credential unavailable"))
        .finally(() => {
          validating = false;
        });
    }, options.revalidateIntervalMs ?? 1000);
    revocationTimer.unref?.();
    const process = async (data: RawData, isBinary: boolean) => {
      if (finished) return;
      let id: unknown = null;
      try {
        if (isBinary)
          throw new CollaborationError(
            "invalid_request",
            "Only JSON text frames are accepted.",
          );
        let request: Record<string, unknown>;
        try {
          const parsed = JSON.parse(data.toString());
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error();
          request = parsed;
        } catch {
          throw new CollaborationError("invalid_request");
        }
        id = request.id;
        if (
          !(
            (typeof id === "string" && id.length > 0 && id.length <= 128) ||
            (typeof id === "number" && Number.isSafeInteger(id))
          )
        )
          throw new CollaborationError("invalid_request");
        const method = request.method;
        if (
          typeof method !== "string" ||
          !request.params ||
          typeof request.params !== "object" ||
          Array.isArray(request.params)
        )
          throw new CollaborationError("invalid_request");
        const params = request.params as Record<string, unknown>;
        if (!principal) {
          if (method === "hello" && params.protocol !== 2)
            throw new CollaborationError(
              "invalid_protocol",
              "Update all clients to live protocol 2 before editing.",
            );
          if (
            method !== "hello" ||
            params.protocol !== 2 ||
            typeof params.token !== "string" ||
            params.token.length > 4096
          )
            throw new CollaborationError("authentication_required");
          if (params.token === "browser-session") {
            if (!upgradeRequest.headers.origin)
              throw new CollaborationError("authentication_required");
            const key = options.sessionToken?.(upgradeRequest) ?? "";
            token = key;
          } else token = params.token;
          if (!(await authenticate())) return;
          clearTimeout(authenticationTimer);
          send({
            id,
            ok: true,
            result: {
              protocol: 2,
              ...(options.brainId ? { brainId: options.brainId } : {}),
              principal,
              limits: {
                documentBytes: options.hub.maxDocumentBytes,
                frameBytes: frameLimit,
              },
            },
          });
          return;
        }
        const current = await authenticate();
        if (!current || finished) return;
        if (method === "hello")
          throw new CollaborationError("already_authenticated");
        if (method === "ping") {
          send({ id, ok: true, result: { protocol: 2 } });
          return;
        }
        if (
          typeof params.documentId !== "string" ||
          typeof params.clientId !== "string" ||
          !params.clientId ||
          params.clientId.length > 128
        )
          throw new CollaborationError("invalid_request");
        if (method === "open") {
          const previous = subscriptions.get(params.documentId);
          if (previous && previous.clientId !== params.clientId)
            throw new CollaborationError("client_identity_changed");
          if (!previous && subscriptions.size >= 16)
            throw new CollaborationError("subscription_limit");
          if (previous) {
            send({
              id,
              ok: true,
              result: await options.hub.open(
                params.documentId,
                current,
                params,
              ),
            });
            return;
          }
          const opened = await options.hub.openSubscribed(
            params.documentId,
            current,
            params,
            (snapshot: CollaborationSnapshot) =>
              send(
                {
                  event: "document",
                  documentId: snapshot.documentId,
                  snapshot,
                },
                true,
              ),
          );
          if (finished) {
            opened.dispose();
            return;
          }
          subscriptions.set(params.documentId, {
            dispose: opened.dispose,
            clientId: params.clientId,
          });
          send({ id, ok: true, result: opened.snapshot });
          return;
        }
        const subscription = subscriptions.get(params.documentId);
        if (!subscription || subscription.clientId !== params.clientId)
          throw new CollaborationError("document_not_open");
        if (method === "close") {
          subscription.dispose();
          subscriptions.delete(params.documentId);
          options.hub.leave(current, subscription.clientId, params.documentId);
          send({ id, ok: true, result: { closed: true } });
          return;
        }
        if (method === "recovery.read") {
          send({ id, ok: true, result: await options.hub.readRecovery(params, current) });
          return;
        }
        if (!methods.has(method))
          throw new CollaborationError("unknown_method");
        send({
          id,
          ok: true,
          result: await options.hub.dispatch(method, params, current),
        });
      } catch (error) {
        send({ id, ok: false, error: publicError(error) });
      }
    };
    socket.on("message", (data: RawData, isBinary: boolean) => {
      if (finished) return;
      const size = Array.isArray(data)
        ? data.reduce((sum, chunk) => sum + chunk.length, 0)
        : data.byteLength;
      if (
        pending >= 32 ||
        queuedBytes + size > (options.maxQueuedBytes ?? 6 * 1024 * 1024) ||
        totalQueuedBytes + size >
          (options.maxTotalQueuedBytes ?? 32 * 1024 * 1024)
      ) {
        close(1013, "Pending request budget exceeded");
        return;
      }
      pending++;
      queuedBytes += size;
      totalQueuedBytes += size;
      chain = chain
        .then(() => process(data, isBinary))
        .catch(() => close(1011, "Request failed"))
        .finally(() => {
          pending--;
          queuedBytes -= size;
          totalQueuedBytes -= size;
        });
      const admitted = chain;
      pendingChains.add(admitted);
      void admitted.finally(() => pendingChains.delete(admitted));
    });
    socket.on("close", () => {
      sockets.delete(socket);
      cleanup();
    });
    socket.on("error", () => {
      socket.terminate();
      cleanup();
    });
  });
  return {
    resourceUsage: () => ({
      connections: sockets.size,
      queuedBytes: totalQueuedBytes,
    }),
    async close() {
      stopping = true;
      options.server.off("upgrade", upgrade);
      for (const socket of sockets) socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await Promise.allSettled([...pendingChains]);
    },
  };
}
export const attachLiveServer = createLiveServer;
