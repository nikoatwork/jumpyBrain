import type { Board, BoardRecord, BoardList } from "../../core/boards/model.js";
import { normalizeRecognitionOptions } from "../../core/search-recognition.js";
import { resolveTemporalQuery } from "../../core/retrieval-policy/temporal.js";
import { normalizeEvidenceDate } from "../../core/writing/metadata.js";
import { validTemporalResponse } from "./temporal-response.js";
import type { ExecutionOptions, TemporalQuery } from "../../types.js";
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
  listBoards(): Promise<BoardList>;
  readBoard(id: string): Promise<BoardRecord>;
  saveBoard(board: Board, ifMatch?: string): Promise<BoardRecord>;
  deleteBoard(id: string, ifMatch: string): Promise<{id:string;deleted:true;notesPreserved:true}>;
  getBoardStatus(id: string, limit?: number): Promise<Record<string, any>>;
  memoryRootStatus(): Promise<MemoryRootStatus & Record<string, unknown>>;
  indexMemory(options?: Pick<IndexMemoryOptions, "rebuild" | "signal" | "timeoutMs">): Promise<IndexMemoryResult & Record<string, unknown>>;
  overviewMemory(options?: MemoryOverviewOptions): Promise<MemoryOverviewResult & Record<string, unknown>>;
  searchMemory(query: string, limit: number, options?: SearchMemoryOptions & { mode?: "search" | "recall" }): Promise<SearchMemoryResult & Record<string, unknown>>;
  compactSearchMemory(query: string, limit: number, options?: CompactRecallOptions): Promise<CompactRecallPacket>;
  expandMemoryDocument(options: ExpansionOptions): Promise<ExpansionResult>;
  previewMemoryDocumentDeletion(id: string): Promise<import("../../types.js").MemoryDocumentDeletePreview>;
  deleteMemoryDocument(id: string, options: { ifMatch: string; apply: true }): Promise<import("../../types.js").MemoryDocumentDeleteResult>;
  readMemoryDocument(id: string): Promise<MemoryDocumentReadResult & Record<string, unknown>>;
  updateMemoryDocument(id: string, content: string, options: { ifMatch: string; actor?: import("../../types.js").MemoryActor }): Promise<MemoryDocumentUpdateResult & Record<string, unknown>>;
  checkDreamSources(request: import("../../core/dream/source-references.js").SourceCheckRequest): Promise<import("../../core/dream/source-references.js").SourceCheckResult>;
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

  async function execute<T>(execution: ExecutionOptions, index: boolean, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const timeoutMs = execution.timeoutMs ?? (index ? 610_000 : 70_000);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw new Error("Invalid execution timeout.");
    const controller = new AbortController();
    const error = (code: string) => new RemoteMemoryError(code === "execution_timeout" ? 504 : 499, code, code === "execution_timeout" ? "Memory operation deadline exceeded; retry or adjust the local deadline." : "Memory operation canceled.");
    const abort = () => controller.abort(error("execution_aborted"));
    const timer = setTimeout(() => controller.abort(error("execution_timeout")), timeoutMs);
    execution.signal?.addEventListener("abort", abort, { once: true });
    if (execution.signal?.aborted) abort();
    try {
      if (controller.signal.aborted) throw controller.signal.reason;
      const result = await operation(controller.signal);
      if (controller.signal.aborted) throw controller.signal.reason;
      return result;
    } catch (caught) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw caught;
    } finally { clearTimeout(timer); execution.signal?.removeEventListener("abort", abort); }
  }

  async function request(path: string, init: RequestInit = {}, execution: ExecutionOptions = {}, index = false): Promise<Record<string, unknown>> {
    return execute(execution, index, signal => requestInScope(path, init, signal));
  }

  // Internal requests inherit the public operation's deadline through its signal.
  // In particular, observational preflight must not reset or cap that lifetime.
  async function requestInScope(path: string, init: RequestInit, signal: AbortSignal): Promise<Record<string, unknown>> {
    if (signal.aborted) throw signal.reason;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${apiKey}`);
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const response = await fetchImpl(new URL(path, baseUrl), { ...init, headers, signal });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const remoteError = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : undefined;
      const code = typeof remoteError?.code === "string" ? remoteError.code : `http_${response.status}`;
      const message = typeof remoteError?.message === "string" ? remoteError.message : `Remote jumpyBrain request failed with HTTP ${response.status}.`;
      throw new RemoteMemoryError(response.status, code, message);
    }
    return payload;
  }

  async function boundedRequest(path: string, body: Record<string, unknown>, kind: "recall" | "expansion", execution: ExecutionOptions = {}): Promise<unknown> {
    return execute(execution, false, async signal => {
    if (kind === "recall") {
      resolveTemporalQuery(body.temporal as TemporalQuery | undefined);
      if (body.readOnly === true) await assertReadOnlySupport(signal);
    }
    const maxBytes = validatePacketMaxBytes(body.maxBytes as number | undefined);
    const unsupported = () => new RemoteMemoryError(502, "unsupported_bounded_read",
      `Remote server returned an unsupported ${kind} response. Upgrade the server; no full-document fallback was attempted.`);
    const response = await fetchImpl(new URL(path, baseUrl), {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal,
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
    if (kind === "recall" && body.readOnly === true && !(packet as CompactRecallPacket).retrieval.warnings.includes("read_only_index")) throw unsupported();
    return packet;
    });
  }

  async function assertReadOnlySupport(signal: AbortSignal): Promise<void> {
    // Status is observational even on older servers. Do not send an ignored
    // strict flag to a legacy read endpoint that can create locks/cache/schema.
    const status = await requestInScope(HTTP_MEMORY_ROUTES.status, {}, signal);
    if (status.readOnlyRetrieval !== "lexical-immutable-v1") throw new RemoteMemoryError(502, "unsupported_read_only",
      "Remote server does not advertise strict read-only retrieval. Upgrade the server; no retrieval or mutation was attempted.");
  }

  return {
    listBoards: () => request(HTTP_MEMORY_ROUTES.boards) as unknown as Promise<BoardList>,
    readBoard: id => request(HTTP_MEMORY_ROUTES.boardsPrefix + encodeURIComponent(id)) as unknown as Promise<BoardRecord>,
    saveBoard: (board, ifMatch) => request(ifMatch === undefined ? HTTP_MEMORY_ROUTES.boards : HTTP_MEMORY_ROUTES.boardsPrefix + encodeURIComponent(board.id), {
      method: ifMatch === undefined ? "POST" : "PUT", headers: ifMatch === undefined ? {} : {"If-Match":ifMatch}, body:JSON.stringify(board),
    }) as unknown as Promise<BoardRecord>,
    deleteBoard: (id, ifMatch) => request(HTTP_MEMORY_ROUTES.boardsPrefix + encodeURIComponent(id), {method:"DELETE",headers:{"If-Match":ifMatch}}) as Promise<{id:string;deleted:true;notesPreserved:true}>,
    getBoardStatus: (id, limit = 12) => request(HTTP_MEMORY_ROUTES.boardsPrefix + encodeURIComponent(id) + "/status?limit=" + limit),
    url: baseUrl,
    memoryRootStatus: () => request(HTTP_MEMORY_ROUTES.status) as Promise<MemoryRootStatus & Record<string, unknown>>,
    indexMemory: (indexOptions = {}) => {
      if ("indexing" in indexOptions) throw new Error("Indexing policy must be configured on the server-local memory root.");
      return request(HTTP_MEMORY_ROUTES.index, { method: "POST", body: JSON.stringify(indexOptions.rebuild === undefined ? {} : { rebuild: indexOptions.rebuild }) }, indexOptions, true) as Promise<IndexMemoryResult & Record<string, unknown>>;
    },
    overviewMemory: (overviewOptions = {}) => {
      const params = new URLSearchParams();
      if (overviewOptions.showFiles) params.set("showFiles", "1");
      if (overviewOptions.connections) params.set("connections", "1");
      if (overviewOptions.limit) params.set("limit", String(overviewOptions.limit));
      const query = params.toString();
      return request(`${HTTP_MEMORY_ROUTES.overview}${query ? `?${query}` : ""}`) as Promise<MemoryOverviewResult & Record<string, unknown>>;
    },
    searchMemory: async (query, limit, searchOptions = {}) => execute(searchOptions, false, async signal => {
      if (searchOptions.readOnly !== undefined && typeof searchOptions.readOnly !== "boolean") throw new Error("readOnly must be boolean.");
      resolveTemporalQuery(searchOptions.temporal);
      const recognition = normalizeRecognitionOptions(searchOptions.recognition);
      if (searchOptions.readOnly === true) await assertReadOnlySupport(signal);
      const mode = searchOptions.mode ?? "search";
      const body = { ...(recognition ? { recognition } : {}), ...(searchOptions.readOnly === true ? { readOnly: true } : {}), ...(searchOptions.temporal ? { temporal: searchOptions.temporal } : {}), ...(mode === "recall"
        ? { topic: query, limit, depth: searchOptions.depth ?? "normal" }
        : { query, limit, depth: searchOptions.depth ?? "normal" }) };
      const packet = await requestInScope(mode === "recall" ? HTTP_MEMORY_ROUTES.recall : HTTP_MEMORY_ROUTES.search, { method: "POST", body: JSON.stringify(body) }, signal);
      if (recognition && (packet.recognition as { version?: number; options?: unknown })?.version !== 1) throw new RemoteMemoryError(502, "unsupported_recognition", "Remote server did not honor search recognition. Upgrade the server; no unfiltered fallback was attempted.");
      if (recognition && JSON.stringify((packet.recognition as { options?: unknown }).options) !== JSON.stringify(recognition)) throw new RemoteMemoryError(502, "unsupported_recognition", "Remote search filter scope did not match the request.");
      if (searchOptions.temporal && !validTemporalResponse(packet.temporal, searchOptions.temporal)) {
        throw new RemoteMemoryError(502, "unsupported_temporal", "Remote server did not honor the temporal scope. Upgrade the server; no unfiltered fallback was attempted.");
      }
      if (searchOptions.readOnly === true && !(packet.retrieval as SearchMemoryResult["retrieval"])?.warnings.includes("read_only_index")) {
        throw new RemoteMemoryError(502, "unsupported_read_only", "Remote server did not honor strict read-only retrieval. Upgrade the server; no fallback was attempted.");
      }
      return packet as unknown as SearchMemoryResult & Record<string, unknown>;
    }),
    compactSearchMemory: async (query, limit, recallOptions = {}) => {
      if (recallOptions.readOnly !== undefined && typeof recallOptions.readOnly !== "boolean") throw new Error("readOnly must be boolean.");
      return boundedRequest(HTTP_MEMORY_ROUTES.compactRecall,
        { query, limit, depth: recallOptions.depth, maxBytes: recallOptions.maxBytes, diagnostics: recallOptions.diagnostics, temporal: recallOptions.temporal, ...(recallOptions.readOnly === true ? { readOnly: true } : {}) }, "recall", recallOptions) as Promise<CompactRecallPacket>;
    },
    expandMemoryDocument: (expansionOptions) => boundedRequest(HTTP_MEMORY_ROUTES.expand, { ...expansionOptions }, "expansion") as Promise<ExpansionResult>,
    previewMemoryDocumentDeletion: (id) => request(memoryDocumentPath(id) + "?deletePreview=1") as Promise<import("../../types.js").MemoryDocumentDeletePreview & Record<string, unknown>>,
    deleteMemoryDocument: (id, options) => request(memoryDocumentPath(id), {
      method: "DELETE", headers: { "If-Match": options.ifMatch }, body: JSON.stringify({ apply: options.apply }),
    }) as Promise<import("../../types.js").MemoryDocumentDeleteResult & Record<string, unknown>>,
    readMemoryDocument: (id) => request(memoryDocumentPath(id)) as Promise<MemoryDocumentReadResult & Record<string, unknown>>,
    updateMemoryDocument: (id, content, updateOptions) => request(memoryDocumentPath(id), {
      method: "PUT",
      headers: { "If-Match": updateOptions.ifMatch },
      body: JSON.stringify({ content, ...(updateOptions.actor ? { actor: updateOptions.actor } : {}) }),
    }) as Promise<MemoryDocumentUpdateResult & Record<string, unknown>>,
    checkDreamSources: async (sourceRequest) => {
      try {
        const packet = await request(HTTP_MEMORY_ROUTES.dreamSources, { method: "POST", body: JSON.stringify(sourceRequest) });
        if (!packet.page || typeof packet.checkedAt !== "string" || !Array.isArray(packet.sources) || !["complete", "partial"].includes(String(packet.coverage))) throw new Error("Remote server returned an unsupported source-check response. Upgrade the server; no check was recorded.");
        return packet as unknown as import("../../core/dream/source-references.js").SourceCheckResult;
      } catch (error) {
        if (error instanceof RemoteMemoryError && [404, 405].includes(error.status) && error.code !== "missing_id") throw new Error("Remote server does not support source checks. Upgrade the server; no check was recorded.", { cause: error });
        throw error;
      }
    },
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
    rememberMemory: async (memoryOptions) => {
      normalizeEvidenceDate(memoryOptions.date);
      return request(HTTP_MEMORY_ROUTES.notes, {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify(memoryOptions),
      }) as Promise<MemoryWriteResult & Record<string, unknown>>;
    },
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
