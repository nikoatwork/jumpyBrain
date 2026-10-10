import { stat } from "node:fs/promises";
import path from "node:path";
import { listMarkdownFiles, readCanonicalMemoryDocumentById, readMarkdownDocuments, replaceCanonicalMemoryDocumentById, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
import { assertCompatibleMemoryRoot, configuredIndexingPolicy, indexingPolicyMatches, memoryRootStatus, resolveIndexRoot } from "../../core/memory-root/index.js";
import { buildQmdIndex, loadManifest, qmdReadiness, searchQmdIndex, type QmdManifest } from "../../adapters/qmd/index.js";
import { normalizeRetrievalDepth } from "../../core/retrieval-policy/index.js";
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

export { graphMemory } from "./graph.js";
export { overviewMemory } from "./overview.js";

export async function memoryStatus(rootArg: string) {
  const status = await memoryRootStatus(rootArg);
  return { ...status, readiness: await retrievalReadiness(status.root) };
}

async function retrievalReadiness(root: string, searchedManifest?: QmdManifest): Promise<RetrievalReadiness> {
  let manifest = searchedManifest;
  if (!manifest) try { manifest = await loadManifest(root); } catch { /* Missing/corrupt derived manifest. */ }
  let stale = !manifest?.sources;
  if (manifest?.sources) {
    try {
      const sourceRoot = await resolveIndexRoot(root);
      const files = await listMarkdownFiles(sourceRoot);
      const expected = new Map(manifest.sources.map(item => [item.file, item]));
      stale = (manifest.sourceRoot ?? root) !== sourceRoot || files.length !== expected.size;
      for (const file of files) {
        const info = await stat(file);
        const previous = expected.get(path.relative(sourceRoot, file).split(path.sep).join("/"));
        if (!previous || previous.size !== info.size || previous.mtimeMs !== info.mtimeMs || previous.ctimeMs !== info.ctimeMs) { stale = true; break; }
      }
    } catch { stale = true; }
  }
  const readiness = await qmdReadiness(root, manifest, stale);
  const configured = await configuredIndexingPolicy(root);
  if (!indexingPolicyMatches(configured, manifest?.policy, manifest?.embedding?.modelHash)) {
    readiness.freshness = manifest ? "stale" : "missing";
    readiness.embedding = configured?.mode === "lexical" ? "disabled" : "incomplete";
    readiness.modes = readiness.modes.filter(mode => mode !== "semantic");
  }
  return readiness;
}

export async function indexMemory(rootArg: string, options: IndexMemoryOptions = {}): Promise<IndexMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const sourceRoot = await resolveIndexRoot(root);
  const documents = await readMarkdownDocuments(sourceRoot);
  const manifest = await buildQmdIndex(root, documents, { ...options, sourceRoot });
  return { root, documents: manifest.documents.length, qmdCollection: manifest.qmdCollection, readiness: await retrievalReadiness(root), work: manifest.work };
}

export async function searchMemory(rootArg: string, query: string, limit: number, options: SearchMemoryOptions = {}): Promise<SearchMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const depth = normalizeRetrievalDepth(options.depth);
  const retrieval: RetrievalOutcome = { status: "complete", warnings: [] };
  let readiness!: RetrievalReadiness;
  const results = await searchQmdIndex(root, query, limit, { depth, outcome: retrieval,
    inspect: async manifest => { readiness = await retrievalReadiness(root, manifest); },
  });
  if (readiness.freshness !== "fresh") retrieval.warnings.push("index_not_fresh");
  if (readiness.embedding === "incomplete" || readiness.embedding === "unknown") retrieval.warnings.push("semantic_coverage_incomplete");
  if (retrieval.warnings.length) retrieval.status = "partial";
  return { root, query, depth, results, readiness, retrieval };
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
