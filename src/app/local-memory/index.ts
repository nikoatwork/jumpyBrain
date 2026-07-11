import { readCanonicalMemoryDocumentById, readMarkdownDocuments, replaceCanonicalMemoryDocumentById, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
import { assertCompatibleMemoryRoot, resolveIndexRoot } from "../../core/memory-root/index.js";
import { buildQmdIndex, searchQmdIndex } from "../../adapters/qmd/index.js";
import { normalizeRetrievalDepth } from "../../core/retrieval-policy/index.js";
import { processMemory } from "../processing/index.js";
import type { IndexMemoryResult, MemoryDocumentContentHash, MemoryDocumentEditError, MemoryDocumentEditErrorCode, MemoryDocumentReadResult, MemoryDocumentUpdateResult, ProcessMemoryResult, SearchMemoryOptions, SearchMemoryResult } from "../../types.js";

export interface UpdateMemoryDocumentOptions {
  /** Optimistic-concurrency token from a prior document read/show result. */
  ifMatch?: MemoryDocumentContentHash | string;
  /** Alias for callers that store the read-result field name directly. */
  contentHash?: MemoryDocumentContentHash | string;
  /** Test/server injection hook; production callers normally let core choose the current timestamp. */
  updatedAt?: string;
}

export class MemoryDocumentPreconditionError extends Error implements MemoryDocumentEditError {
  readonly code: MemoryDocumentEditErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: MemoryDocumentEditErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "MemoryDocumentPreconditionError";
    this.code = code;
    this.details = details;
  }
}

export { graphMemory } from "./graph.js";
export { overviewMemory } from "./overview.js";

export async function indexMemory(rootArg: string): Promise<IndexMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const sourceRoot = await resolveIndexRoot(root);
  const documents = await readMarkdownDocuments(sourceRoot);
  const manifest = await buildQmdIndex(root, documents, { sourceRoot });
  return { root, documents: manifest.documents.length, qmdCollection: manifest.qmdCollection };
}

export async function searchMemory(rootArg: string, query: string, limit: number, options: SearchMemoryOptions = {}): Promise<SearchMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const depth = normalizeRetrievalDepth(options.depth);
  const results = await searchQmdIndex(root, query, limit, { depth });
  return { root, query, depth, results };
}

export async function readMemoryDocument(rootArg: string, id: string): Promise<MemoryDocumentReadResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  return readCanonicalMemoryDocumentById(root, id);
}

export async function updateMemoryDocument(
  rootArg: string,
  id: string,
  content: string,
  options: UpdateMemoryDocumentOptions = {},
): Promise<MemoryDocumentUpdateResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const ifMatch = options.ifMatch ?? options.contentHash;
  if (!ifMatch) {
    throw new MemoryDocumentPreconditionError(
      "precondition_required",
      "Document update requires an ifMatch/contentHash precondition from a prior read.",
      { id },
    );
  }

  const current = await readCanonicalMemoryDocumentById(root, id);
  if (current.contentHash !== ifMatch) {
    throw new MemoryDocumentPreconditionError(
      "precondition_failed",
      "Document content hash is stale. Re-read the document before retrying the update.",
      { id, file: current.file, currentContentHash: current.contentHash },
    );
  }

  return replaceCanonicalMemoryDocumentById(root, id, content, { updatedAt: options.updatedAt });
}

export async function ensureMemoryDocumentIds(rootArg: string): Promise<ProcessMemoryResult> {
  return processMemory(rootArg, { mode: "ensure-ids", apply: true });
}
