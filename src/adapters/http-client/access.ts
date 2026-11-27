import { readBoundedResponse } from "./bounded-response.js";
import { RemoteMemoryError, remoteRouteUrl } from "./index.js";

export type RemoteAccessRole = "reader" | "writer" | "admin";
export interface RemoteAccessCredential { id: string; name: string; role: RemoteAccessRole; createdAt: string; revokedAt?: string; }
export interface RemoteAccessClient {
  list(): Promise<{ credentials: RemoteAccessCredential[] }>;
  /** The returned token is the only copy of the new secret. */
  issue(input: { name: string; role: RemoteAccessRole }): Promise<{ credential: RemoteAccessCredential; token: string }>;
  revoke(id: string): Promise<{ revoked: boolean }>;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const credential = (value: unknown): value is RemoteAccessCredential => record(value) && typeof value.id === "string" && typeof value.name === "string"
  && ["reader", "writer", "admin"].includes(value.role as string) && typeof value.createdAt === "string"
  && (value.revokedAt === undefined || typeof value.revokedAt === "string");

/** Admin-only key management for a hosted brain. Errors never include a key. */
export function createRemoteAccessClient(options: { url: string; apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): RemoteAccessClient {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new Error("Remote jumpyBrain API key is required.");
  const base = new URL(options.url.trim()); base.search = ""; base.hash = "";
  const fetchImpl = options.fetchImpl ?? fetch;
  const invalid = (mutation: boolean) => new RemoteMemoryError(502, "invalid_response", "Remote server returned an invalid response."
    + (mutation ? " The change may have been applied; run `access list` before retrying." : ""));
  async function request(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetchImpl(remoteRouteUrl(base, path), {
      method, redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      headers: { Authorization: `Bearer ${apiKey}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = record(payload) && record(payload.error) ? payload.error : undefined;
      const code = typeof error?.code === "string" ? error.code : `http_${response.status}`;
      throw new RemoteMemoryError(response.status, code, code === "admin_required" ? "Managing access keys needs an admin key for this brain."
        : typeof error?.message === "string" ? error.message : `Remote jumpyBrain request failed with HTTP ${response.status}.`);
    }
    if (!record(payload)) throw invalid(method !== "GET");
    return payload;
  }
  return {
    async list() {
      const packet = await request("/access", "GET");
      if (!Array.isArray(packet.credentials) || !packet.credentials.every(credential)) throw invalid(false);
      return { credentials: packet.credentials };
    },
    async issue(input) {
      const packet = await request("/access", "POST", { name: input.name, role: input.role });
      if (!credential(packet.credential) || typeof packet.token !== "string" || !packet.token) throw invalid(true);
      return { credential: packet.credential, token: packet.token };
    },
    async revoke(id) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Use the credential ID shown by access list.");
      const packet = await request("/access/" + id, "DELETE");
      if (typeof packet.revoked !== "boolean") throw invalid(true);
      return { revoked: packet.revoked };
    },
  };
}

export type RemoteAccessCapability = "read" | "write" | "manage_access";
const CAPABILITY_NAMES: readonly RemoteAccessCapability[] = ["read", "write", "manage_access"];

/**
 * What a server answered when asked about the key it was sent. It carries no
 * key, no response body and no remote error text: every field is a validated
 * role, a known capability name, a bounded display name, a credential ID or a
 * fixed token.
 */
export type RemoteAccessProbe =
  | {
    outcome: "confirmed"; role: RemoteAccessRole; name?: string; id?: string;
    /** The server's own list for this key in canonical order; absent when an older server sent only the role; `null` when the field was not a list of names. */
    capabilities?: RemoteAccessCapability[] | null;
    /** True when the list also held names this client does not know; they are dropped. */
    unknownCapabilities?: true;
  }
  | { outcome: "authentication_failed"; status: number }
  | { outcome: "unsupported"; detail: "redirect" | "http_status" | "invalid_response" | "unknown_role"; status?: number }
  | { outcome: "offline"; detail: "timeout" | "network" | "http_status"; status?: number };

/**
 * One GET /capabilities with the given key: the observational answer to "what
 * may this key do". It never throws for a remote condition and never retries.
 * A role this client does not know is `unsupported`, never a guess.
 */
export async function probeRemoteAccess(options: { url: string; apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<RemoteAccessProbe> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new Error("Remote jumpyBrain API key is required.");
  const base = new URL(options.url.trim()); base.search = ""; base.hash = "";
  const signal = AbortSignal.timeout(options.timeoutMs ?? 10_000);
  let response: Response, text: string;
  try {
    response = await (options.fetchImpl ?? fetch)(remoteRouteUrl(base, "/capabilities"), { method: "GET", redirect: "manual", signal, headers: { Authorization: `Bearer ${apiKey}` } });
  } catch { return { outcome: "offline", detail: signal.aborted ? "timeout" : "network" }; }
  const status = response.status;
  if (status !== 200) {
    // The body of a refusal is never read: a proxy page or server message cannot reach the caller.
    await response.body?.cancel().catch(() => {});
    if (status === 401 || status === 403) return { outcome: "authentication_failed", status };
    if (status === 429 || status >= 500) return { outcome: "offline", detail: "http_status", status };
    return { outcome: "unsupported", detail: status >= 300 && status < 400 ? "redirect" : "http_status", status };
  }
  try { text = await readBoundedResponse(response, 16_384, () => new Error("invalid")); }
  catch { return signal.aborted ? { outcome: "offline", detail: "timeout" } : { outcome: "unsupported", detail: "invalid_response", status }; }
  let packet: unknown;
  try { packet = JSON.parse(text); } catch { return { outcome: "unsupported", detail: "invalid_response", status }; }
  if (!record(packet) || !record(packet.principal)) return { outcome: "unsupported", detail: "invalid_response", status };
  const { role, name, id } = packet.principal;
  if (typeof role !== "string" || !["reader", "writer", "admin"].includes(role)) return { outcome: "unsupported", detail: "unknown_role", status };
  const stated = packet.capabilities;
  const listed = Array.isArray(stated) && stated.every(item => typeof item === "string");
  const shown = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100) : "";
  return {
    outcome: "confirmed", role: role as RemoteAccessRole,
    ...(shown ? { name: shown } : {}),
    // Issued keys have a UUID; a bootstrap key's ID is derived from the key and is not passed on.
    ...(typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? { id } : {}),
    ...(stated === undefined ? {} : { capabilities: listed ? CAPABILITY_NAMES.filter(item => (stated as string[]).includes(item)) : null }),
    ...(listed && (stated as string[]).some(item => !(CAPABILITY_NAMES as readonly string[]).includes(item)) ? { unknownCapabilities: true as const } : {}),
  };
}
