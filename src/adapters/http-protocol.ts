const MEMORY_PREFIX = "/memories/all";

export const HTTP_MEMORY_ROUTES = {
  health: "/health",
  status: `${MEMORY_PREFIX}/status`,
  index: `${MEMORY_PREFIX}/index`,
  overview: `${MEMORY_PREFIX}/overview`,
  tree: `${MEMORY_PREFIX}/tree`,
  graphJson: `${MEMORY_PREFIX}/graph.json`,
  search: `${MEMORY_PREFIX}/search`,
  recall: `${MEMORY_PREFIX}/recall`,
  notes: `${MEMORY_PREFIX}/notes`,
  wrapups: `${MEMORY_PREFIX}/wrapups`,
  dreamStatus: `${MEMORY_PREFIX}/dream/status`,
  dreamBatches: `${MEMORY_PREFIX}/dream/batches`,
  dreamBatchesPrefix: `${MEMORY_PREFIX}/dream/batches/`,
  documentsPrefix: `${MEMORY_PREFIX}/documents/`,
} as const;

export function memoryDocumentPath(id: string): string {
  return `${HTTP_MEMORY_ROUTES.documentsPrefix}${encodeURIComponent(id)}`;
}

export function decodeMemoryDocumentPath(pathname: string): string | Error {
  if (!pathname.startsWith(HTTP_MEMORY_ROUTES.documentsPrefix)) return new Error("Invalid memory document route. Use /memories/all/documents/:id.");
  const raw = pathname.slice(HTTP_MEMORY_ROUTES.documentsPrefix.length);
  if (!raw || raw.includes("/")) return new Error("Invalid memory document route. Use /memories/all/documents/:id.");
  try {
    return decodeURIComponent(raw);
  } catch {
    return new Error("Invalid memory document id encoding.");
  }
}

export function memoryDreamBatchPath(batchId: string): string {
  return `${HTTP_MEMORY_ROUTES.dreamBatchesPrefix}${encodeURIComponent(batchId)}`;
}

export function memoryDreamBatchCompletePath(batchId: string): string {
  return `${memoryDreamBatchPath(batchId)}/complete`;
}

export function memoryDreamBatchAbandonPath(batchId: string): string {
  return `${memoryDreamBatchPath(batchId)}/abandon`;
}

export function decodeMemoryDreamBatchPath(pathname: string): { batchId: string; action?: "complete" | "abandon" } | Error {
  if (!pathname.startsWith(HTTP_MEMORY_ROUTES.dreamBatchesPrefix)) return new Error("Invalid dream batch route. Use /memories/all/dream/batches/:batchId.");
  const raw = pathname.slice(HTTP_MEMORY_ROUTES.dreamBatchesPrefix.length);
  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return new Error("Invalid dream batch route. Use /memories/all/dream/batches/:batchId[/complete|/abandon].");
  if (parts.length === 2 && parts[1] !== "complete" && parts[1] !== "abandon") return new Error("Invalid dream batch action. Use complete or abandon.");
  try {
    return { batchId: decodeURIComponent(parts[0]!), action: parts[1] as "complete" | "abandon" | undefined };
  } catch {
    return new Error("Invalid dream batch id encoding.");
  }
}

export function isMemoryRoute(pathname: string): boolean {
  return pathname.startsWith(MEMORY_PREFIX);
}
