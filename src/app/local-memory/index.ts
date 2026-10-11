import { readCanonicalMemoryDocumentById, readMarkdownDocuments, replaceCanonicalMemoryDocumentById, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
import { assertCompatibleMemoryRoot, memoryRootStatus, resolveIndexRoot } from "../../core/memory-root/index.js";
import { withQmdOperation, readExecution, executionSignal, checkExecution, buildQmdIndex, loadManifest, recoverQmdIndex, searchQmdIndex } from "../../adapters/qmd/index.js";
import { normalizeRetrievalDepth } from "../../core/retrieval-policy/index.js";
import { resolveTemporalQuery } from "../../core/retrieval-policy/temporal.js";
import type { ExecutionOptions, TemporalRetrieval } from "../../types.js";
import { retrievalReadiness } from "./freshness.js";
export { retrievalReadiness } from "./freshness.js";
import { processMemory } from "../processing/index.js";
import type { IndexMemoryOptions, RetrievalOutcome, RetrievalReadiness, IndexMemoryResult, MemoryDocumentContentHash, MemoryDocumentEditError, MemoryDocumentEditErrorCode, MemoryDocumentReadResult, MemoryDocumentUpdateResult, ProcessMemoryResult, SearchMemoryOptions, SearchMemoryResult } from "../../types.js";

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

export { MemoryExecutionError } from "../../adapters/qmd/index.js";
export { compactSearchMemory, serializeCompactRecall, type CompactRecallOptions, type CompactRecallPacket, type CompactRecallPassage } from "./compact.js";
export { expandMemoryDocument } from "./expansion.js";
export { graphMemory } from "./graph.js";
export { overviewMemory } from "./overview.js";

export async function memoryStatus(rootArg: string) {
  const status = await memoryRootStatus(rootArg);
  return { ...status, readiness: await retrievalReadiness(status.root) };
}

/** Shared automatic maintenance: one incremental attempt, never policy persistence or rebuild. */
export async function ensureMemoryIndexed(rootArg: string, options: ExecutionOptions = {}): Promise<IndexMemoryResult> {
  return withQmdOperation(rootArg, "index", options, async () => {
    const root = await readExecution(resolveMemoryRoot(rootArg));
    await readExecution(assertCompatibleMemoryRoot(root));
    await recoverQmdIndex(root);
    // Safe last-failure diagnostics are not a second canonical freshness authority.
    const readiness = await retrievalReadiness(root);
    if (readiness.freshness === "fresh") {
      const manifest = await loadManifest(root);
      return { root, documents: manifest.documents.length, qmdCollection: manifest.qmdCollection,
        readiness: await retrievalReadiness(root, manifest) };
    }
    return indexResolvedMemory(root, { signal: options.signal, timeoutMs: options.timeoutMs }, false);
  });
}

async function indexResolvedMemory(root: string, options: IndexMemoryOptions, persistPolicy: boolean): Promise<IndexMemoryResult> {
  const sourceRoot = await readExecution(resolveIndexRoot(root));
  const documents = await readExecution(readMarkdownDocuments(sourceRoot, executionSignal()));
  checkExecution();
  const manifest = await buildQmdIndex(root, documents, { ...options, sourceRoot, persistPolicy });
  return { root, documents: manifest.documents.length, qmdCollection: manifest.qmdCollection,
    readiness: await retrievalReadiness(root, manifest), work: manifest.work };
}

export async function indexMemory(rootArg: string, options: IndexMemoryOptions = {}): Promise<IndexMemoryResult> {
  return withQmdOperation(rootArg, "index", options, async () => {
    const root = await readExecution(resolveMemoryRoot(rootArg));
    await readExecution(assertCompatibleMemoryRoot(root));
    return indexResolvedMemory(root, options, true);
  });
}

export async function searchMemory(rootArg: string, query: string, limit: number, options: SearchMemoryOptions = {}): Promise<SearchMemoryResult> {
  return withQmdOperation(rootArg, "search", options, async () => {
  const interval = resolveTemporalQuery(options.temporal);
  const temporal: TemporalRetrieval | undefined = interval ? { interval, coverage: {
    eligibleDocuments: 0, excludedUndated: 0, excludedInvalid: 0,
    backfillBudget: 0, backfilledDocuments: 0, unvisitedDocuments: 0,
  } } : undefined;
  const root = await readExecution(resolveMemoryRoot(rootArg));
  await readExecution(assertCompatibleMemoryRoot(root));
  if (options.refresh !== false) await ensureMemoryIndexed(root);
  const depth = normalizeRetrievalDepth(options.depth);
  const retrieval: RetrievalOutcome = { status: "complete", warnings: [] };
  let readiness!: RetrievalReadiness;
  const results = await searchQmdIndex(root, query, limit, { depth, outcome: retrieval, temporal, recover: options.refresh !== false,
    inspect: async manifest => { readiness = await retrievalReadiness(root, manifest); },
  });
  if (readiness.freshness !== "fresh") retrieval.warnings.push("index_not_fresh");
  if (readiness.embedding === "incomplete" || readiness.embedding === "unknown") retrieval.warnings.push("semantic_coverage_incomplete");
  if (retrieval.warnings.length) retrieval.status = "partial";
  return { root, query, depth, results, readiness, retrieval, ...(temporal ? { temporal } : {}) };
  });
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

  try {
    return await replaceCanonicalMemoryDocumentById(root, id, content, { ifMatch, updatedAt: options.updatedAt });
  } catch (error) {
    // Keep the public precondition error shape for conflicts discovered at publication.
    if ((error as MemoryDocumentEditError).code === "precondition_failed") {
      const conflict = error as MemoryDocumentEditError;
      throw new MemoryDocumentPreconditionError(conflict.code, conflict.message, conflict.details);
    }
    throw error;
  }
}

export async function ensureMemoryDocumentIds(rootArg: string): Promise<ProcessMemoryResult> {
  return processMemory(rootArg, { mode: "ensure-ids", apply: true });
}
