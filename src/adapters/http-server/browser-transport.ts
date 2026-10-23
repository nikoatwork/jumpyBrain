// Browser request construction delegates authentication and companion fencing to the host.
import { HTTP_MEMORY_ROUTES, memoryDocumentPath } from "../http-protocol.js";
export { memoryDocumentPath };
export type BrowserJson = (url: string, options?: RequestInit) => Promise<unknown>;
export function createBrowserSearchRequest(json: BrowserJson) {
  return (query: string, signal: AbortSignal, limit = 24): Promise<unknown> => json(HTTP_MEMORY_ROUTES.search, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: Math.max(1, Math.min(120, limit)), depth: "normal" }), signal,
  });
}
