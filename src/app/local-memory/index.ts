import { metadataDate } from "../../core/canonical/metadata-date.js";
import { normalizeMemoryActor, currentMemoryEditor } from "../../core/contribution.js";
import { normalizeRecognitionOptions } from "../../core/search-recognition.js";
import { recognizeSearchResults } from "./search-recognition.js";
import { readCanonicalMemoryDocumentById, discoverMarkdownIndexInputs, replaceCanonicalMemoryDocumentById, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
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
  actor?: import("../../types.js").MemoryActor;
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

export { ReadOnlyQmdError, MemoryExecutionError } from "../../adapters/qmd/index.js";
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
  const files = await readExecution(discoverMarkdownIndexInputs(sourceRoot, executionSignal()));
  checkExecution();
  const manifest = await buildQmdIndex(root, files, { ...options, sourceRoot, persistPolicy });
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
  if (options.readOnly !== undefined && typeof options.readOnly !== "boolean") throw new Error("readOnly must be boolean.");
  const recognition = normalizeRecognitionOptions(options.recognition);
  return withQmdOperation(rootArg, "search", options, async () => {
  const interval = resolveTemporalQuery(options.temporal);
  const temporal: TemporalRetrieval | undefined = interval ? { interval, coverage: {
    eligibleDocuments: 0, excludedUndated: 0, excludedInvalid: 0,
    backfillBudget: 0, backfilledDocuments: 0, unvisitedDocuments: 0,
  } } : undefined;
  const root = await readExecution(resolveMemoryRoot(rootArg));
  await readExecution(assertCompatibleMemoryRoot(root));
  if (options.refresh !== false && !options.readOnly) await ensureMemoryIndexed(root);
  const depth = normalizeRetrievalDepth(options.depth);
  const retrieval: RetrievalOutcome = { status: "complete", warnings: [] };
  let readiness!: RetrievalReadiness;
  const results = await searchQmdIndex(root, query, recognition ? 120 : limit, { depth, outcome: retrieval, temporal, readOnly: options.readOnly, recover: options.refresh !== false,
    inspect: async manifest => { readiness = await retrievalReadiness(root, manifest); },
  });
  if (options.readOnly) {
    retrieval.warnings.push("read_only_index");
    if (readiness.modes.includes("semantic")) retrieval.warnings.push("read_only_lexical_fallback");
  }
  if (readiness.freshness !== "fresh") retrieval.warnings.push("index_not_fresh");
  if (readiness.embedding === "incomplete" || readiness.embedding === "unknown") retrieval.warnings.push("semantic_coverage_incomplete");
  if (retrieval.warnings.length) retrieval.status = "partial";
  const recognized = recognition ? await recognizeSearchResults(root, results, limit, recognition, executionSignal()) : undefined;
  if (recognized) { retrieval.status = "partial"; retrieval.warnings.push("recognition_bounded_candidates"); }
  return { root, query, depth, results: recognized?.results ?? results, readiness, retrieval, ...(recognized ? { recognition: recognized.scope } : {}), ...(temporal ? { temporal } : {}) };
  });
}

export async function readMemoryDocument(rootArg: string, id: string): Promise<MemoryDocumentReadResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const document = await readCanonicalMemoryDocumentById(root, id);
  return { ...document, recognition: { metadataStatus: "current", updatedAt: metadataDate(document.frontmatter.updated_at) ?? metadataDate(document.frontmatter.updatedAt), createdAt: metadataDate(document.frontmatter.created_at) ?? metadataDate(document.frontmatter.createdAt), editor: currentMemoryEditor(document.content) } };
}

export async function updateMemoryDocument(
  rootArg: string,
  id: string,
  content: string,
  options: UpdateMemoryDocumentOptions = {},
): Promise<MemoryDocumentUpdateResult> {
  const actor = normalizeMemoryActor(options.actor);
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

  try {
    return await replaceCanonicalMemoryDocumentById(root, id, content, { ifMatch, updatedAt: options.updatedAt, actor });
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

export { previewMemoryDocumentDeletion, deleteMemoryDocument } from "./document-delete.js";
