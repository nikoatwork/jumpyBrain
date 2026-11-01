export interface CollaborationSnapshot {
  documentId: string; epoch: string; revision: number; body: string; title: string; contentHash: string; saved: boolean;
  prefix?: string; file?: string; recognition?: unknown;
  operation?: { start: number; deleteCount: number; insert?: string; snapshotOnly?: boolean; actor?: string; operationId?: string };
  presence?: { actor: string; principalId?: string; clientId?: string; name: string; kind: "human" | "agent"; activity?: "viewing" | "editing" | "streaming"; epoch?: string; revision?: number; leaseExpiresAt?: number; anchor?: number; focus?: number }[];
  conflict?: { code: string; message?: string };
  recovery?: { code: "external_destructive_replacement"; recoveryId: string; baseContentHash: string; externalContentHash: string };
  recoveryDiscovery?: "incomplete";
}
export type CollaborationConnectionState = "connecting" | "ready" | "offline" | "blocked" | "closed";
export interface CollaborationPrincipal { id: string; name?: string; role: string }
export class CollaborationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "CollaborationError"; }
}
interface ClientOptions {
  url: string; token?: string; scope: string; expectedBrainId?: string;
  connectionContext?: () => { tabId?: string; generation?: number };
  onState?: (state: CollaborationConnectionState, principal?: CollaborationPrincipal, error?: CollaborationError) => void;
  onSnapshot?: (snapshot: CollaborationSnapshot) => void;
}
interface Listener { onState?: ClientOptions["onState"]; onSnapshot?: ClientOptions["onSnapshot"] }
const supervisors = new Map<string, ReturnType<typeof createSupervisor>>();
function createSupervisor(options: ClientOptions) {
  const listeners = new Set<Listener>();
  const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let socket: WebSocket | undefined, generation = 0, state: CollaborationConnectionState = "offline", principal: CollaborationPrincipal | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined, attempts = 0, closed = false;
  function transition(next: CollaborationConnectionState, error?: CollaborationError) { state = next; for (const listener of listeners) listener.onState?.(state, principal, error); }
  function rejectPending(error: Error) { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); }
  function rawRequest(method: string, params: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new CollaborationError("offline", "The backend is disconnected."));
      if (pending.size >= 64 || socket.bufferedAmount > 6 * 1024 * 1024) return reject(new CollaborationError("backpressure", "The connection is busy; the local draft is retained."));
      const id = crypto.randomUUID(), data = JSON.stringify({ id, method, params });
      if (new TextEncoder().encode(data).length > 3 * 1024 * 1024) return reject(new CollaborationError("document_limit", "This edit exceeds the live document limit."));
      const timer = setTimeout(() => { pending.delete(id); reject(new CollaborationError("unconfirmed", "The backend did not confirm this request. The draft is retained.")); }, 15_000);
      pending.set(id, { resolve, reject, timer });
      try { socket.send(data); } catch { pending.delete(id); clearTimeout(timer); reject(new CollaborationError("unconfirmed", "The request was not confirmed.")); }
    });
  }
  function connect() {
    if (closed || state === "blocked" || socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
    clearTimeout(retry); const current = ++generation; transition("connecting");
    try { socket = new WebSocket(options.url); } catch { transition("offline"); schedule(); return; }
    const currentSocket = socket;
    currentSocket.onopen = async () => {
      if (current !== generation) return;
      try {
        const hello = await rawRequest("hello", { token: options.token ?? "", protocol: 2, ...(options.expectedBrainId ? { expectedBrainId: options.expectedBrainId } : {}), ...options.connectionContext?.() });
        if (current !== generation) return;
        if (hello.protocol !== 2 || !hello.principal?.id) throw new CollaborationError("protocol", "The backend requires a coordinated client upgrade.");
        if (options.expectedBrainId && hello.brainId !== options.expectedBrainId) throw new CollaborationError("root_changed", "The backend brain changed. Reopen the intended brain before recovering or publishing this draft.");
        principal = hello.principal; attempts = 0; transition("ready");
      } catch (error) {
        if (current !== generation) return;
        const failure = error instanceof CollaborationError ? error : new CollaborationError("connection", "Authentication failed.");
        if (["unauthorized", "forbidden", "auth", "protocol", "invalid_protocol", "revoked", "root_changed"].includes(failure.code)) { transition("blocked", failure); currentSocket.close(); }
        else currentSocket.close();
      }
    };
    currentSocket.onmessage = (event) => {
      if (current !== generation || typeof event.data !== "string") return;
      if (event.data.length > 3 * 1024 * 1024) { currentSocket.close(1009); return; }
      try {
        const message = JSON.parse(event.data);
        if (typeof message.id === "string") {
          const request = pending.get(message.id); if (!request) return;
          pending.delete(message.id); clearTimeout(request.timer);
          if (message.ok === true) request.resolve(message.result);
          else request.reject(new CollaborationError(String(message.error?.code ?? "request_failed"), String(message.error?.message ?? "The backend rejected this request.")));
        } else if (state === "ready" && message.event === "document" && validSnapshot(message.snapshot) && message.documentId === message.snapshot.documentId) {
          for (const listener of listeners) listener.onSnapshot?.(message.snapshot);
        }
      } catch { currentSocket.close(1002); }
    };
    currentSocket.onclose = (event) => { if (current !== generation || closed) return; if (event.code === 1008) transition("blocked", new CollaborationError("revoked", "Access is unavailable or was revoked. The local draft is retained.")); else if (event.code === 1009) transition("blocked", new CollaborationError("document_limit", "This document exceeds the live connection limit. The local draft is retained.")); rejectPending(new CollaborationError("unconfirmed", "The connection closed before confirmation. The local draft is retained.")); if (state !== "blocked") { transition("offline"); schedule(); } };
    currentSocket.onerror = () => { /* onclose owns reconnect. */ };
  }
  function schedule() { if (!closed && state !== "blocked" && listeners.size) retry = setTimeout(connect, Math.min(10_000, 250 * 2 ** Math.min(attempts++, 6)) + Math.random() * 200); }
  return {
    add(listener: Listener) { listeners.add(listener); queueMicrotask(() => { if (listeners.has(listener)) listener.onState?.(state, principal); }); },
    remove(listener: Listener) { listeners.delete(listener); if (!listeners.size) { closed = true; generation++; clearTimeout(retry); rejectPending(new CollaborationError("closed", "The session was closed.")); socket?.close(); transition("closed"); } return listeners.size; },
    connect,
    request(method: string, params: Record<string, unknown>) { return state === "ready" ? rawRequest(method, params) : Promise.reject(new CollaborationError("offline", "Reconnect before publishing the draft.")); },
    get state() { return state; },
  };
}
export function validSnapshot(value: unknown): value is CollaborationSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as CollaborationSnapshot;
  return [snapshot.documentId, snapshot.epoch, snapshot.body, snapshot.title, snapshot.contentHash].every((part) => typeof part === "string") && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 && typeof snapshot.saved === "boolean";
}
// Tabs share one supervisor within an environment/scope; mutations are never
// replayed by the reconnect layer. Source reconciliation decides publication.
export function createCollaborationClient(options: ClientOptions) {
  const context = options.connectionContext?.();
  const key = JSON.stringify([options.url, options.scope, options.token ?? "", options.expectedBrainId, context?.tabId, context?.generation]);
  let supervisor = supervisors.get(key);
  if (!supervisor) { supervisor = createSupervisor(options); supervisors.set(key, supervisor); }
  const listener = { onState: options.onState, onSnapshot: options.onSnapshot }; supervisor.add(listener);
  let disposed = false;
  return {
    connect: () => { if (!disposed) supervisor!.connect(); },
    request: (method: string, params: Record<string, unknown>) => disposed ? Promise.reject(new CollaborationError("closed", "The session was closed.")) : supervisor!.request(method, params),
    get state() { return supervisor!.state; },
    dispose() { if (disposed) return; disposed = true; if (!supervisor!.remove(listener)) supervisors.delete(key); },
  };
}
