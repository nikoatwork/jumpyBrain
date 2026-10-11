import { resolveTemporalQuery } from "../../core/retrieval-policy/temporal.js";
import { validTemporalResponse } from "./temporal-response.js";
import type { TemporalQuery } from "../../types.js";
import { randomUUID } from "node:crypto";
import { HTTP_MEMORY_ROUTES, memoryDocumentPath, memoryDreamBatchAbandonPath, memoryDreamBatchCompletePath, memoryDreamBatchPath } from "../http-protocol.js";
import { packetFits, validatePacketMaxBytes } from "../../core/serialized-budget.js";
import type { CompactRecallOptions, CompactRecallPacket } from "../../core/retrieval-policy/compact.js";
import type { ExpansionOptions, ExpansionResult } from "../../core/canonical/expansion.js";
import { boundedErrorMessage, readBoundedErrorCode, readBoundedResponse, validBoundedPacket } from "./bounded-response.js";
import type {
  DreamAbandonResult,
  DreamBatch,
  DreamCompleteRequest,
  DreamCompleteResult,
  DreamCreateRequest,
  DreamStatus,
  DreamWindow,
  DreamWindowRequest,
  IndexMemoryOptions,
  IndexMemoryResult,
  MemoryDocumentReadResult,
  MemoryDocumentUpdateResult,
  MemoryNoteDraft,
  MemoryOverviewOptions,
  MemoryOverviewResult,
  MemoryRootStatus,
  MemoryWriteResult,
  SearchMemoryOptions,
  SearchMemoryResult,
} from "../../types.js";

export interface RemoteWrapupDraft {
  title: string;
  body: string;
  tags?: string[];
  recallTopic?: string;
}

export interface RemoteWrapupWriteResult extends MemoryWriteResult {
  title?: string;
  recallTopic?: string;
  body?: string;
  validation?: unknown;
}

export interface RemoteMemoryTransportOptions {
  url: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface RemoteMemoryTransport {
  readonly url: string;
  memoryRootStatus(): Promise<MemoryRootStatus & Record<string, unknown>>;
  indexMemory(options?: Pick<IndexMemoryOptions, "rebuild">): Promise<IndexMemoryResult & Record<string, unknown>>;
  overviewMemory(options?: MemoryOverviewOptions): Promise<MemoryOverviewResult & Record<string, unknown>>;
  searchMemory(query: string, limit: number, options?: SearchMemoryOptions & { mode?: "search" | "recall" }): Promise<SearchMemoryResult & Record<string, unknown>>;
  compactSearchMemory(query: string, limit: number, options?: CompactRecallOptions): Promise<CompactRecallPacket>;
  expandMemoryDocument(options: ExpansionOptions): Promise<ExpansionResult>;
  readMemoryDocument(id: string): Promise<MemoryDocumentReadResult & Record<string, unknown>>;
  updateMemoryDocument(id: string, content: string, options: { ifMatch: string }): Promise<MemoryDocumentUpdateResult & Record<string, unknown>>;
  getDreamWindow(request?: DreamWindowRequest): Promise<DreamWindow>;
  getDreamStatus(): Promise<DreamStatus & Record<string, unknown>>;
  createDreamBatch(request?: DreamCreateRequest): Promise<DreamBatch & Record<string, unknown>>;
  getDreamBatch(batchId: string): Promise<DreamBatch & Record<string, unknown>>;
  completeDreamBatch(request: DreamCompleteRequest): Promise<DreamCompleteResult & Record<string, unknown>>;
  abandonDreamBatch(batchId: string, summary?: string): Promise<DreamAbandonResult & Record<string, unknown>>;
  rememberMemory(options: MemoryNoteDraft): Promise<MemoryWriteResult & Record<string, unknown>>;
  writeSessionWrapup(draft: RemoteWrapupDraft): Promise<RemoteWrapupWriteResult & Record<string, unknown>>;
}

export class RemoteMemoryError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "RemoteMemoryError";
  }
}

export function createRemoteMemoryTransport(options: RemoteMemoryTransportOptions): RemoteMemoryTransport {
  const baseUrl = normalizeBaseUrl(options.url);
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new Error("Remote jumpyBrain API key is required.");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${apiKey}`);
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const response = await fetchImpl(new URL(path, baseUrl), { ...init, headers });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const remoteError = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : undefined;
      const code = typeof remoteError?.code === "string" ? remoteError.code : `http_${response.status}`;
      const message = typeof remoteError?.message === "string" ? remoteError.message : `Remote jumpyBrain request failed with HTTP ${response.status}.`;
      throw new RemoteMemoryError(response.status, code, message);
    }
    return payload;
  }

  async function boundedRequest(path: string, body: Record<string, unknown>, kind: "recall" | "expansion"): Promise<unknown> {
    if (kind === "recall") resolveTemporalQuery(body.temporal as TemporalQuery | undefined);
    const maxBytes = validatePacketMaxBytes(body.maxBytes as number | undefined);
    const unsupported = () => new RemoteMemoryError(502, "unsupported_bounded_read",
      `Remote server returned an unsupported ${kind} response. Upgrade the server; no full-document fallback was attempted.`);
    const response = await fetchImpl(new URL(path, baseUrl), {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const code = await readBoundedErrorCode(response) ?? `http_${response.status}`;
      // A supported expansion can legitimately return 404 for an unknown canonical ID.
      if ([404, 405, 501].includes(response.status) && !(kind === "expansion" && response.status === 404 && code === "missing_id")) {
        throw new RemoteMemoryError(response.status, "unsupported_bounded_read",
          `Remote server does not support bounded ${kind}. Upgrade the server; no full-document fallback was attempted.`);
      }
      throw new RemoteMemoryError(response.status, code, boundedErrorMessage(code, response.status));
    }
    const text = await readBoundedResponse(response, maxBytes, unsupported);
    let packet: unknown;
    try { packet = JSON.parse(text); } catch { throw unsupported(); }
    if (!validBoundedPacket(packet, kind, maxBytes, body) || !packetFits(packet, maxBytes)) throw unsupported();
    return packet;
  }

  return {
    url: baseUrl,
    memoryRootStatus: () => request(HTTP_MEMORY_ROUTES.status) as Promise<MemoryRootStatus & Record<string, unknown>>,
    indexMemory: (indexOptions = {}) => {
      if ("indexing" in indexOptions) throw new Error("Indexing policy must be configured on the server-local memory root.");
      return request(HTTP_MEMORY_ROUTES.index, { method: "POST", body: JSON.stringify(indexOptions.rebuild === undefined ? {} : { rebuild: indexOptions.rebuild }) }) as Promise<IndexMemoryResult & Record<string, unknown>>;
    },
    overviewMemory: (overviewOptions = {}) => {
      const params = new URLSearchParams();
      if (overviewOptions.showFiles) params.set("showFiles", "1");
      if (overviewOptions.connections) params.set("connections", "1");
      if (overviewOptions.limit) params.set("limit", String(overviewOptions.limit));
      const query = params.toString();
      return request(`${HTTP_MEMORY_ROUTES.overview}${query ? `?${query}` : ""}`) as Promise<MemoryOverviewResult & Record<string, unknown>>;
    },
    searchMemory: async (query, limit, searchOptions = {}) => {
      resolveTemporalQuery(searchOptions.temporal);
      const mode = searchOptions.mode ?? "search";
      const body = { ...(searchOptions.temporal ? { temporal: searchOptions.temporal } : {}), ...(mode === "recall"
        ? { topic: query, limit, depth: searchOptions.depth ?? "normal" }
        : { query, limit, depth: searchOptions.depth ?? "normal" }) };
      const packet = await request(mode === "recall" ? HTTP_MEMORY_ROUTES.recall : HTTP_MEMORY_ROUTES.search, { method: "POST", body: JSON.stringify(body) });
      if (searchOptions.temporal && !validTemporalResponse(packet.temporal, searchOptions.temporal)) {
        throw new RemoteMemoryError(502, "unsupported_temporal", "Remote server did not honor the temporal scope. Upgrade the server; no unfiltered fallback was attempted.");
      }
      return packet as unknown as SearchMemoryResult & Record<string, unknown>;
    },
    compactSearchMemory: (query, limit, recallOptions = {}) => boundedRequest(HTTP_MEMORY_ROUTES.compactRecall,
      { query, limit, depth: recallOptions.depth, maxBytes: recallOptions.maxBytes, diagnostics: recallOptions.diagnostics, temporal: recallOptions.temporal }, "recall") as Promise<CompactRecallPacket>,
    expandMemoryDocument: (expansionOptions) => boundedRequest(HTTP_MEMORY_ROUTES.expand, { ...expansionOptions }, "expansion") as Promise<ExpansionResult>,
    readMemoryDocument: (id) => request(memoryDocumentPath(id)) as Promise<MemoryDocumentReadResult & Record<string, unknown>>,
    updateMemoryDocument: (id, content, updateOptions) => request(memoryDocumentPath(id), {
      method: "PUT",
      headers: { "If-Match": updateOptions.ifMatch },
      body: JSON.stringify({ content }),
    }) as Promise<MemoryDocumentUpdateResult & Record<string, unknown>>,
    getDreamWindow: async (windowRequest = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(windowRequest)) {
        if (value !== undefined) params.set(key, String(value));
      }
      try {
        const packet = await request(`${HTTP_MEMORY_ROUTES.dreamWindow}?${params}`);
        if (!packet.window || !Array.isArray(packet.files) || !Array.isArray(packet.instructions)) throw new Error("Remote server returned an unsupported dream window response. Upgrade the server; no legacy batch was created.");
        return packet as unknown as DreamWindow;
      } catch (error) {
        if (error instanceof RemoteMemoryError && [404, 405].includes(error.status)) {
          throw new Error("Remote server does not support stateless dream windows. Upgrade the server; no legacy batch was created.", { cause: error });
        }
        throw error;
      }
    },
    getDreamStatus: () => request(HTTP_MEMORY_ROUTES.dreamStatus) as Promise<DreamStatus & Record<string, unknown>>,
    createDreamBatch: (dreamRequest = {}) => request(HTTP_MEMORY_ROUTES.dreamBatches, {
      method: "POST",
      body: JSON.stringify(dreamRequest),
    }) as Promise<DreamBatch & Record<string, unknown>>,
    getDreamBatch: (batchId) => request(memoryDreamBatchPath(batchId)) as Promise<DreamBatch & Record<string, unknown>>,
    completeDreamBatch: (completeRequest) => request(memoryDreamBatchCompletePath(completeRequest.batchId), {
      method: "POST",
      body: JSON.stringify(completeRequest),
    }) as Promise<DreamCompleteResult & Record<string, unknown>>,
    abandonDreamBatch: (batchId, summary) => request(memoryDreamBatchAbandonPath(batchId), {
      method: "POST",
      body: JSON.stringify(summary ? { summary } : {}),
    }) as Promise<DreamAbandonResult & Record<string, unknown>>,
    rememberMemory: (memoryOptions) => request(HTTP_MEMORY_ROUTES.notes, {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify(memoryOptions),
    }) as Promise<MemoryWriteResult & Record<string, unknown>>,
    writeSessionWrapup: (draft) => request(HTTP_MEMORY_ROUTES.wrapups, {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify(draft),
    }) as Promise<RemoteWrapupWriteResult & Record<string, unknown>>,
  };
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Remote target URL is required.");
  const parsed = new URL(trimmed);
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}
