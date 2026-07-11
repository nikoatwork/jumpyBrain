import { randomUUID } from "node:crypto";
import { HTTP_MEMORY_ROUTES, memoryDocumentPath, memoryDreamBatchAbandonPath, memoryDreamBatchCompletePath, memoryDreamBatchPath } from "../http-protocol.js";
import type {
  DreamAbandonResult,
  DreamBatch,
  DreamCompleteRequest,
  DreamCompleteResult,
  DreamCreateRequest,
  DreamStatus,
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
  indexMemory(): Promise<IndexMemoryResult & Record<string, unknown>>;
  overviewMemory(options?: MemoryOverviewOptions): Promise<MemoryOverviewResult & Record<string, unknown>>;
  searchMemory(query: string, limit: number, options?: SearchMemoryOptions & { mode?: "search" | "recall" }): Promise<SearchMemoryResult & Record<string, unknown>>;
  readMemoryDocument(id: string): Promise<MemoryDocumentReadResult & Record<string, unknown>>;
  updateMemoryDocument(id: string, content: string, options: { ifMatch: string }): Promise<MemoryDocumentUpdateResult & Record<string, unknown>>;
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

  return {
    url: baseUrl,
    memoryRootStatus: () => request(HTTP_MEMORY_ROUTES.status) as Promise<MemoryRootStatus & Record<string, unknown>>,
    indexMemory: () => request(HTTP_MEMORY_ROUTES.index, { method: "POST", body: "{}" }) as Promise<IndexMemoryResult & Record<string, unknown>>,
    overviewMemory: (overviewOptions = {}) => {
      const params = new URLSearchParams();
      if (overviewOptions.showFiles) params.set("showFiles", "1");
      if (overviewOptions.connections) params.set("connections", "1");
      if (overviewOptions.limit) params.set("limit", String(overviewOptions.limit));
      const query = params.toString();
      return request(`${HTTP_MEMORY_ROUTES.overview}${query ? `?${query}` : ""}`) as Promise<MemoryOverviewResult & Record<string, unknown>>;
    },
    searchMemory: (query, limit, searchOptions = {}) => {
      const mode = searchOptions.mode ?? "search";
      const body = mode === "recall"
        ? { topic: query, limit, depth: searchOptions.depth ?? "normal" }
        : { query, limit, depth: searchOptions.depth ?? "normal" };
      return request(mode === "recall" ? HTTP_MEMORY_ROUTES.recall : HTTP_MEMORY_ROUTES.search, { method: "POST", body: JSON.stringify(body) }) as Promise<SearchMemoryResult & Record<string, unknown>>;
    },
    readMemoryDocument: (id) => request(memoryDocumentPath(id)) as Promise<MemoryDocumentReadResult & Record<string, unknown>>,
    updateMemoryDocument: (id, content, updateOptions) => request(memoryDocumentPath(id), {
      method: "PUT",
      headers: { "If-Match": updateOptions.ifMatch },
      body: JSON.stringify({ content }),
    }) as Promise<MemoryDocumentUpdateResult & Record<string, unknown>>,
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
