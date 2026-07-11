import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HTTP_MEMORY_ROUTES, decodeMemoryDocumentPath, decodeMemoryDreamBatchPath, isMemoryRoute } from "../http-protocol.js";
import type { FileLogger } from "../logging/index.js";
import { packageVersion } from "../package-info/index.js";
import { abandonDreamBatch, completeDreamBatch, createDreamBatch, getDreamBatch, getDreamStatus, graphServerMemory, indexServerMemory, overviewServerMemory, readServerMemoryDocument, searchServerMemory, serverMemoryStatus, updateServerMemoryDocument, writeServerMemoryWithIdempotency } from "../../app/server-memory/index.js";
import type { RemoteIndexRunner } from "../../app/server-memory/auto-index.js";
import { graphPageHtml } from "./graph-page.js";
import type { MemoryConnectionEdgeKind } from "../../types.js";

interface JsonError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export const RESPONSE_ERROR_CODE = Symbol("jumpybrain.responseErrorCode");

export async function routeRequest(context: { request: IncomingMessage; response: ServerResponse; root: string; apiKeys: string[]; enqueueWrite: <T>(operation: () => Promise<T>) => Promise<T>; indexRunner: RemoteIndexRunner; logger: FileLogger }): Promise<void> {
  const { request, response, root, apiKeys, enqueueWrite, indexRunner, logger } = context;
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === HTTP_MEMORY_ROUTES.health) {
    writeJson(response, 200, {
      ok: true,
      service: "jumpybrain-server",
      version: await packageVersion(),
    });
    return;
  }

  if (request.method === "GET" && (url.pathname === "/graph" || url.pathname === "/graph/")) {
    const nonce = randomBytes(16).toString("base64url");
    const contentSecurityPolicy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
    writeHtml(response, 200, graphPageHtml(nonce), {
      "content-security-policy": contentSecurityPolicy,
      "x-content-type-options": "nosniff",
    });
    return;
  }

  if (url.pathname === "/graph" || url.pathname === "/graph/") {
    writeJson(response, 405, errorResponse("method_not_allowed", "Use GET for /graph."));
    return;
  }

  if (!isMemoryRoute(url.pathname)) {
    writeJson(response, 404, errorResponse("not_found", "Unknown route."));
    return;
  }

  const authFailure = authenticate(request, apiKeys);
  if (authFailure) {
    writeJson(response, 401, authFailure);
    return;
  }

  if (request.method === "GET" && url.pathname === HTTP_MEMORY_ROUTES.status) {
    writeJson(response, 200, await serverMemoryStatus(root));
    return;
  }

  if (request.method === "GET" && url.pathname === HTTP_MEMORY_ROUTES.dreamStatus) {
    try {
      const packet = await getDreamStatus({ root });
      logger.info("remote_dream_status_success", { path: url.pathname, status: 200, open_batch: packet.openBatch?.batchId, file_count: packet.openBatch?.fileCount });
      writeJson(response, 200, packet);
    } catch (error) {
      const mapped = dreamErrorResponse(error, "Remote dream status failed.");
      logger.warn("remote_dream_status_failure", { path: url.pathname, status: mapped.statusCode, error_code: mapped.body.error.code });
      writeJson(response, mapped.statusCode, mapped.body);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === HTTP_MEMORY_ROUTES.dreamBatches) {
    const parsedBody = await parseJsonBody(request, { allowEmpty: true });
    if (isJsonError(parsedBody)) {
      writeJson(response, parsedBody.statusCode, parsedBody.body);
      return;
    }
    try {
      const packet = await enqueueWrite(() => createDreamBatch({ root, request: dreamCreateRequest(parsedBody) }));
      logger.info("remote_dream_batch_create_success", { path: url.pathname, status: 200, batch_id: packet.batchId, file_count: packet.files.length, has_more: packet.hasMore, resumed: packet.resumed });
      writeJson(response, 200, packet);
    } catch (error) {
      const mapped = dreamErrorResponse(error, "Remote dream batch creation failed.");
      logger.warn("remote_dream_batch_create_failure", { path: url.pathname, status: mapped.statusCode, error_code: mapped.body.error.code });
      writeJson(response, mapped.statusCode, mapped.body);
    }
    return;
  }

  if (url.pathname === HTTP_MEMORY_ROUTES.dreamStatus || url.pathname === HTTP_MEMORY_ROUTES.dreamBatches) {
    writeJson(response, 405, errorResponse("method_not_allowed", `Use ${url.pathname === HTTP_MEMORY_ROUTES.dreamStatus ? "GET" : "POST"} for ${url.pathname}.`));
    return;
  }

  if (url.pathname.startsWith(HTTP_MEMORY_ROUTES.dreamBatchesPrefix)) {
    const decoded = decodeMemoryDreamBatchPath(url.pathname);
    if (decoded instanceof Error) {
      writeJson(response, 400, errorResponse("invalid_batch_id", decoded.message));
      return;
    }

    if (!decoded.action && request.method === "GET") {
      try {
        const packet = await getDreamBatch({ root, batchId: decoded.batchId });
        logger.info("remote_dream_batch_read_success", { path: url.pathname, status: 200, batch_id: packet.batchId, file_count: packet.files.length, has_more: packet.hasMore });
        writeJson(response, 200, packet);
      } catch (error) {
        const mapped = dreamErrorResponse(error, "Remote dream batch read failed.");
        logger.warn("remote_dream_batch_read_failure", { path: url.pathname, status: mapped.statusCode, batch_id: decoded.batchId, error_code: mapped.body.error.code });
        writeJson(response, mapped.statusCode, mapped.body);
      }
      return;
    }

    if (decoded.action === "complete" && request.method === "POST") {
      const parsedBody = await parseJsonBody(request, { allowEmpty: true });
      if (isJsonError(parsedBody)) {
        writeJson(response, parsedBody.statusCode, parsedBody.body);
        return;
      }
      try {
        const packet = await enqueueWrite(() => completeDreamBatch({ root, request: { ...dreamCompleteRequest(parsedBody), batchId: decoded.batchId } }));
        logger.info("remote_dream_batch_complete_success", { path: url.pathname, status: 200, batch_id: packet.batchId, updated_count: packet.updatedDocumentIds.length, skipped_count: packet.skippedDocumentIds.length });
        writeJson(response, 200, packet);
      } catch (error) {
        const mapped = dreamErrorResponse(error, "Remote dream batch completion failed.");
        logger.warn("remote_dream_batch_complete_failure", { path: url.pathname, status: mapped.statusCode, batch_id: decoded.batchId, error_code: mapped.body.error.code });
        writeJson(response, mapped.statusCode, mapped.body);
      }
      return;
    }

    if (decoded.action === "abandon" && request.method === "POST") {
      const parsedBody = await parseJsonBody(request, { allowEmpty: true });
      if (isJsonError(parsedBody)) {
        writeJson(response, parsedBody.statusCode, parsedBody.body);
        return;
      }
      try {
        const packet = await enqueueWrite(() => abandonDreamBatch({ root, batchId: decoded.batchId, summary: stringField(parsedBody, "summary") || undefined }));
        logger.info("remote_dream_batch_abandon_success", { path: url.pathname, status: 200, batch_id: packet.batchId });
        writeJson(response, 200, packet);
      } catch (error) {
        const mapped = dreamErrorResponse(error, "Remote dream batch abandonment failed.");
        logger.warn("remote_dream_batch_abandon_failure", { path: url.pathname, status: mapped.statusCode, batch_id: decoded.batchId, error_code: mapped.body.error.code });
        writeJson(response, mapped.statusCode, mapped.body);
      }
      return;
    }

    const usage = decoded.action ? `Use POST for ${url.pathname}.` : `Use GET for ${url.pathname}.`;
    writeJson(response, 405, errorResponse("method_not_allowed", usage));
    return;
  }

  if (url.pathname.startsWith(HTTP_MEMORY_ROUTES.documentsPrefix)) {
    const id = decodeMemoryDocumentPath(url.pathname);
    if (id instanceof Error) {
      writeJson(response, 400, errorResponse("invalid_id", id.message));
      return;
    }

    if (request.method === "GET") {
      try {
        const packet = await readServerMemoryDocument({ root, id });
        logger.info("remote_document_read_success", { path: url.pathname, status: 200, id: packet.id, file: packet.file });
        writeJson(response, 200, packet);
      } catch (error) {
        const mapped = documentReadErrorResponse(error);
        logger.warn("remote_document_read_failure", {
          path: url.pathname,
          status: mapped.statusCode,
          id,
          error_code: mapped.body.error.code,
        });
        writeJson(response, mapped.statusCode, mapped.body);
      }
      return;
    }

    if (request.method === "PUT") {
      const ifMatch = ifMatchHeader(request);
      if (!ifMatch) {
        const body = errorResponse("precondition_required", "Document update requires If-Match from a prior document read.", { id });
        logger.warn("remote_document_update_failure", { method: request.method, path: url.pathname, status: 428, id, error_code: body.error.code });
        writeJson(response, 428, body);
        return;
      }

      const parsedBody = await parseJsonBody(request);
      if (isJsonError(parsedBody)) {
        logger.warn("remote_document_update_failure", { method: request.method, path: url.pathname, status: parsedBody.statusCode, id, error_code: parsedBody.body.error.code });
        writeJson(response, parsedBody.statusCode, parsedBody.body);
        return;
      }

      const content = rawStringField(parsedBody, "content");
      if (content === undefined || content.length === 0) {
        const body = errorResponse("validation_failed", "Document update requires a non-empty string content field.", { id });
        logger.warn("remote_document_update_failure", { method: request.method, path: url.pathname, status: 422, id, error_code: body.error.code });
        writeJson(response, 422, body);
        return;
      }

      try {
        const packet = await enqueueWrite(() => updateServerMemoryDocument({ root, id, content, ifMatch }));
        logger.info("remote_document_update_success", {
          method: request.method,
          path: url.pathname,
          status: 200,
          id: packet.id,
          file: packet.file,
          stale: packet.index.stale,
        });
        writeJson(response, 200, packet);
      } catch (error) {
        const mapped = documentUpdateErrorResponse(error);
        const safeDetails = mapped.body.error.details;
        logger.warn("remote_document_update_failure", {
          method: request.method,
          path: url.pathname,
          status: mapped.statusCode,
          id,
          file: typeof safeDetails?.file === "string" ? safeDetails.file : undefined,
          error_code: mapped.body.error.code,
        });
        writeJson(response, mapped.statusCode, mapped.body);
      }
      return;
    }

    writeJson(response, 405, errorResponse("method_not_allowed", `Use GET or PUT for ${url.pathname}.`));
    return;
  }

  if (url.pathname === HTTP_MEMORY_ROUTES.status) {
    writeJson(response, 405, errorResponse("method_not_allowed", `Use GET for ${HTTP_MEMORY_ROUTES.status}.`));
    return;
  }

  if (request.method === "GET" && url.pathname === HTTP_MEMORY_ROUTES.graphJson) {
    const graphOptions = graphOptionsFromSearchParams(url);
    if (graphOptions instanceof Error) {
      writeJson(response, 400, errorResponse("bad_request", graphOptions.message));
      return;
    }
    try {
      writeJson(response, 200, await graphServerMemory({ root, graph: graphOptions }));
    } catch {
      writeJson(response, 500, errorResponse("graph_failed", "Remote graph failed."));
    }
    return;
  }

  if (url.pathname === HTTP_MEMORY_ROUTES.graphJson) {
    writeJson(response, 405, errorResponse("method_not_allowed", `Use GET for ${HTTP_MEMORY_ROUTES.graphJson}.`));
    return;
  }

  if (request.method === "GET" && (url.pathname === HTTP_MEMORY_ROUTES.overview || url.pathname === HTTP_MEMORY_ROUTES.tree)) {
    const limit = positiveIntegerSearchParam(url, "limit", 10);
    if (limit instanceof Error) {
      writeJson(response, 400, errorResponse("bad_request", limit.message));
      return;
    }
    try {
      writeJson(response, 200, await overviewServerMemory({
        root,
        overview: {
          showFiles: booleanSearchParam(url, "showFiles") || booleanSearchParam(url, "show-files"),
          connections: booleanSearchParam(url, "connections"),
          limit,
        },
      }));
    } catch {
      writeJson(response, 500, errorResponse("overview_failed", "Remote overview failed."));
    }
    return;
  }

  if (url.pathname === HTTP_MEMORY_ROUTES.overview || url.pathname === HTTP_MEMORY_ROUTES.tree) {
    writeJson(response, 405, errorResponse("method_not_allowed", `Use GET for ${url.pathname}.`));
    return;
  }

  if (request.method === "POST" && url.pathname === HTTP_MEMORY_ROUTES.index) {
    const parsedBody = await parseJsonBody(request, { allowEmpty: true });
    if (isJsonError(parsedBody)) {
      writeJson(response, parsedBody.statusCode, parsedBody.body);
      return;
    }

    const indexedAt = Date.now();
    logger.info("index_start", { path: url.pathname, reason: "manual" });
    try {
      const packet = await indexServerMemory({ root, indexRunner, reason: "manual" });
      logger.info("index_success", { reason: "manual", documents: packet.documents, qmdCollection: packet.qmdCollection, stale: packet.index.stale, duration_ms: Date.now() - indexedAt });
      writeJson(response, 200, packet);
    } catch (error) {
      logger.error("index_failure", { reason: "manual", duration_ms: Date.now() - indexedAt, message: error instanceof Error ? error.message : String(error) });
      writeJson(response, 500, errorResponse("index_failed", "Remote index rebuild failed."));
    }
    return;
  }

  if (url.pathname === HTTP_MEMORY_ROUTES.index) {
    writeJson(response, 405, errorResponse("method_not_allowed", `Use POST for ${HTTP_MEMORY_ROUTES.index}.`));
    return;
  }

  if (request.method === "POST" && (url.pathname === HTTP_MEMORY_ROUTES.search || url.pathname === HTTP_MEMORY_ROUTES.recall)) {
    const parsedBody = await parseJsonBody(request);
    if (isJsonError(parsedBody)) {
      writeJson(response, parsedBody.statusCode, parsedBody.body);
      return;
    }

    const body = parsedBody as Record<string, unknown>;
    const recall = url.pathname === HTTP_MEMORY_ROUTES.recall;
    const query = stringField(body, recall ? "topic" : "query") || stringField(body, "query");
    const limit = positiveIntegerField(body, "limit", recall ? 5 : 10);
    const depth = stringField(body, "depth") || "normal";
    if (!query) {
      writeJson(response, 400, errorResponse("bad_request", recall ? "Recall requires topic or query." : "Search requires query."));
      return;
    }
    if (limit instanceof Error) {
      writeJson(response, 400, errorResponse("bad_request", limit.message));
      return;
    }

    try {
      writeJson(response, 200, await searchServerMemory({ root, query, limit, depth, recall }));
    } catch {
      writeJson(response, 500, errorResponse(recall ? "search_failed" : "search_failed", recall ? "Remote recall failed." : "Remote search failed."));
    }
    return;
  }

  if (url.pathname === HTTP_MEMORY_ROUTES.search || url.pathname === HTTP_MEMORY_ROUTES.recall) {
    writeJson(response, 405, errorResponse("method_not_allowed", `Use POST for ${url.pathname}.`));
    return;
  }

  if (request.method === "POST" && (url.pathname === HTTP_MEMORY_ROUTES.notes || url.pathname === HTTP_MEMORY_ROUTES.wrapups)) {
    const parsedBody = await parseJsonBody(request);
    if (isJsonError(parsedBody)) {
      writeJson(response, parsedBody.statusCode, parsedBody.body);
      return;
    }

    const idempotencyKey = request.headers["idempotency-key"];
    const key = Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey;
    let idempotency: Awaited<ReturnType<typeof writeServerMemoryWithIdempotency>>;
    try {
      idempotency = await enqueueWrite(() => writeServerMemoryWithIdempotency({
        root,
        key,
        method: "POST",
        path: url.pathname,
        body: parsedBody,
        write: url.pathname === HTTP_MEMORY_ROUTES.notes
          ? {
              kind: "note",
              draft: {
                type: stringField(parsedBody, "type"),
                title: stringField(parsedBody, "title"),
                body: stringField(parsedBody, "body"),
                tags: tagsField(parsedBody),
              },
            }
          : {
              kind: "wrapup",
              draft: {
                title: stringField(parsedBody, "title"),
                body: stringField(parsedBody, "body"),
                tags: tagsField(parsedBody),
                recallTopic: stringField(parsedBody, "recallTopic") || undefined,
              },
            },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Remote write validation failed.";
      writeJson(response, 422, errorResponse("validation_failed", message));
      return;
    }

    if (idempotency.kind === "missing-key") {
      writeJson(response, 400, errorResponse("idempotency_key_required", "Create requests require Idempotency-Key."));
      return;
    }
    if (idempotency.kind === "conflict") {
      writeJson(response, 409, errorResponse("idempotency_conflict", "Idempotency-Key was already used for a different request."));
      return;
    }

    const result = idempotency.result as Record<string, unknown>;
    const index = result.index as { stale?: boolean } | undefined;
    logger.info("remote_write_success", {
      path: url.pathname,
      write_type: result.type,
      file: result.file,
      idempotency: idempotency.kind,
      stale: index?.stale,
    });
    writeJson(response, 200, idempotency.result);
    return;
  }

  if (url.pathname === HTTP_MEMORY_ROUTES.notes || url.pathname === HTTP_MEMORY_ROUTES.wrapups) {
    writeJson(response, 405, errorResponse("method_not_allowed", `Use POST for ${url.pathname}.`));
    return;
  }

  writeJson(response, 404, errorResponse("not_found", "Unknown memory route."));
}

function authenticate(request: IncomingMessage, apiKeys: string[]): JsonError | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return errorResponse("auth_required", "Missing Authorization bearer token.");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token || !apiKeys.some((apiKey) => constantTimeTokenEquals(token, apiKey))) {
    return errorResponse("invalid_api_key", "Invalid API key.");
  }

  return undefined;
}

function constantTimeTokenEquals(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

function ifMatchHeader(request: IncomingMessage): string {
  const raw = request.headers["if-match"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

async function parseJsonBody(request: IncomingMessage, options: { allowEmpty?: boolean } = {}): Promise<Record<string, unknown> | { statusCode: number; body: JsonError }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) {
      return { statusCode: 400, body: errorResponse("bad_request", "Request body is too large.") };
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return options.allowEmpty ? {} : { statusCode: 400, body: errorResponse("bad_request", "JSON body is required.") };

  const contentType = request.headers["content-type"];
  if (contentType && !String(contentType).toLowerCase().includes("application/json")) {
    return { statusCode: 415, body: errorResponse("unsupported_media_type", "Use application/json.") };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { statusCode: 400, body: errorResponse("bad_request", "JSON body must be an object.") };
    }
    return parsed as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: errorResponse("bad_request", "Malformed JSON body.") };
  }
}

function isJsonError(value: unknown): value is { statusCode: number; body: JsonError } {
  return Boolean(value && typeof value === "object" && "statusCode" in value && "body" in value);
}

function dreamErrorResponse(error: unknown, fallback: string): { statusCode: number; body: JsonError } {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" && typeof (error as { message?: unknown }).message === "string") {
    const code = (error as { code: string }).code;
    const statusCode = code === "missing_batch" ? 404
      : code === "invalid_batch_id" || code === "invalid_file" || code === "validation_failed" ? 400
        : code === "invalid_state" ? 409
          : code === "corrupt_batch" ? 422
            : 500;
    return { statusCode, body: errorResponse(code, (error as { message: string }).message, safeErrorDetails((error as { details?: Record<string, unknown> }).details)) };
  }
  return { statusCode: 500, body: errorResponse("dream_failed", fallback) };
}

function documentReadErrorResponse(error: unknown): { statusCode: number; body: JsonError } {
  if (isMemoryDocumentEditError(error)) {
    const statusCode = error.code === "missing_id" ? 404 : error.code === "duplicate_id" ? 409 : error.code === "invalid_id" ? 400 : 422;
    return { statusCode, body: errorResponse(error.code, error.message, safeErrorDetails(error.details)) };
  }

  return { statusCode: 500, body: errorResponse("update_failed", "Remote document read failed.") };
}

function documentUpdateErrorResponse(error: unknown): { statusCode: number; body: JsonError } {
  if (isMemoryDocumentEditError(error)) {
    const statusCode = documentUpdateStatusCode(error.code);
    return { statusCode, body: errorResponse(error.code, error.message, safeErrorDetails(error.details)) };
  }

  return { statusCode: 500, body: errorResponse("update_failed", "Remote document update failed.") };
}

function documentUpdateStatusCode(code: string): number {
  if (code === "invalid_id") return 400;
  if (code === "missing_id") return 404;
  if (code === "duplicate_id") return 409;
  if (code === "precondition_failed") return 412;
  if (code === "precondition_required") return 428;
  if (code === "unsupported_media_type") return 415;
  if (code === "validation_failed" || code === "unsupported_body") return 422;
  return 500;
}

function isMemoryDocumentEditError(error: unknown): error is { code: string; message: string; details?: Record<string, unknown> } {
  return Boolean(error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" && typeof (error as { message?: unknown }).message === "string");
}

function safeErrorDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === "id" && typeof value === "string") safe.id = value;
    if (key === "file" && typeof value === "string") safe.file = value;
    if (key === "files" && Array.isArray(value)) safe.files = value.map(String);
    if (key === "currentContentHash" && typeof value === "string") safe.currentContentHash = value;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function rawStringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function positiveIntegerField(body: Record<string, unknown>, key: string, fallback: number): number | Error {
  const value = body[key];
  if (value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) return new Error(`${key} must be a positive integer.`);
  return parsed;
}

function positiveIntegerSearchParam(url: URL, key: string, fallback: number): number | Error {
  const value = url.searchParams.get(key);
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return new Error(`${key} must be a positive integer.`);
  return parsed;
}

function booleanSearchParam(url: URL, key: string): boolean {
  const value = url.searchParams.get(key);
  return value === "1" || value === "true" || value === "yes" || value === "";
}

function optionalBooleanSearchParam(url: URL, key: string): boolean | undefined {
  const value = url.searchParams.get(key);
  if (value === null) return undefined;
  if (value === "1" || value === "true" || value === "yes" || value === "") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return undefined;
}

function graphOptionsFromSearchParams(url: URL) {
  const depth = optionalPositiveIntegerSearchParam(url, "depth");
  if (depth instanceof Error) return depth;
  const limit = optionalPositiveIntegerSearchParam(url, "limit");
  if (limit instanceof Error) return limit;
  const edgeTypes = stringListSearchParam(url, "edgeTypes") ?? stringListSearchParam(url, "edge-types");
  const allowedEdgeTypes = new Set(["markdown-link", "wiki-link"]);
  if (edgeTypes?.some((edgeType) => !allowedEdgeTypes.has(edgeType))) return new Error("edgeTypes may only include markdown-link or wiki-link.");
  return {
    focus: stringSearchParam(url, "focus") || undefined,
    query: stringSearchParam(url, "query") || undefined,
    type: stringSearchParam(url, "type") || undefined,
    path: stringSearchParam(url, "path") || undefined,
    tags: stringListSearchParam(url, "tags"),
    edgeTypes: edgeTypes as MemoryConnectionEdgeKind[] | undefined,
    includeUnresolved: optionalBooleanSearchParam(url, "includeUnresolved") ?? optionalBooleanSearchParam(url, "include-unresolved"),
    includeOrphans: optionalBooleanSearchParam(url, "includeOrphans") ?? optionalBooleanSearchParam(url, "include-orphans"),
    depth,
    limit,
  };
}

function stringSearchParam(url: URL, key: string): string {
  return url.searchParams.get(key)?.trim() ?? "";
}

function stringListSearchParam(url: URL, key: string): string[] | undefined {
  const values = url.searchParams.getAll(key).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function optionalPositiveIntegerSearchParam(url: URL, key: string): number | undefined | Error {
  const value = url.searchParams.get(key);
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return new Error(`${key} must be a positive integer.`);
  return parsed;
}

function dreamCreateRequest(body: Record<string, unknown>) {
  return {
    maxFiles: optionalPositiveIntegerField(body, "maxFiles") ?? optionalPositiveIntegerField(body, "max_files"),
    bytesPerFile: optionalPositiveIntegerField(body, "bytesPerFile") ?? optionalPositiveIntegerField(body, "bytes_per_file"),
    maxTotalBytes: optionalPositiveIntegerField(body, "maxTotalBytes") ?? optionalPositiveIntegerField(body, "max_total_bytes"),
    force: booleanField(body, "force"),
  };
}

function dreamCompleteRequest(body: Record<string, unknown>) {
  return {
    batchId: stringField(body, "batchId"),
    summary: stringField(body, "summary") || undefined,
    updatedDocumentIds: stringListField(body, "updatedDocumentIds"),
    skippedDocumentIds: stringListField(body, "skippedDocumentIds"),
    operatorNotes: stringField(body, "operatorNotes") || undefined,
  };
}

function optionalPositiveIntegerField(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) throw { code: "validation_failed", message: `${key} must be a positive integer.` };
  return parsed;
}

function booleanField(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  return false;
}

function stringListField(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value)) return [];
  return value.map(String).map((entry) => entry.trim()).filter(Boolean);
}

function tagsField(body: Record<string, unknown>): string[] {
  const value = body.tags;
  if (!Array.isArray(value)) return [];
  return value.map(String).map((tag) => tag.trim()).filter(Boolean);
}

export function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  if (isErrorBody(body)) (response as ServerResponse & { [RESPONSE_ERROR_CODE]?: string })[RESPONSE_ERROR_CODE] = body.error.code;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function writeHtml(response: ServerResponse, statusCode: number, html: string, headers: Record<string, string> = {}): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(html);
}

function isErrorBody(body: unknown): body is JsonError {
  return Boolean(body && typeof body === "object" && "error" in body && typeof (body as JsonError).error?.code === "string");
}

export function errorResponse(code: string, message: string, details?: Record<string, unknown>): JsonError {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
