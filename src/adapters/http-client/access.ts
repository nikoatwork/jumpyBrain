import { RemoteMemoryError } from "./index.js";

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
    const response = await fetchImpl(new URL(path, base), {
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
