import { findMemoryRoot, initializeMemoryRoot } from "../../core/memory-root/index.js";
import { memoryStatus, graphMemory, indexMemory, overviewMemory, previewMemoryDocumentDeletion, deleteMemoryDocument, readMemoryDocument, searchMemory, updateMemoryDocument } from "../local-memory/index.js";
import { processMemory } from "../processing/index.js";
import { rememberMemory, writeSessionWrapup, type WrapupDraft, type WrapupWriteResult } from "../writing/index.js";
import { failedCreationIndex, failedCreationReplay } from "../writing/creation-outcome.js";
import { writeRemoteMemoryNote, writeRemoteSessionWrapup, type RemoteWrapupDraft } from "../writing/remote-writer.js";
import type {
  ExecutionOptions,
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
  MemoryDocumentContentHash,
  MemoryDocumentReadResult,
  MemoryDocumentUpdateResult,
  MemoryGraphOptions,
  MemoryGraphResult,
  MemoryNoteDraft,
  MemoryOverviewOptions,
  MemoryOverviewResult,
  MemoryRootInitResult,
  MemoryRootStatus,
  MemoryWriteResult,
  ProcessMemoryOptions,
  ProcessMemoryResult,
  RetrievalDepth,
  SearchMemoryOptions,
  SearchMemoryResult,
} from "../../types.js";
import { createRemoteIndexRunner, type RemoteIndexRunner } from "./auto-index.js";
import { DAILY_NOTE_HEADING, prepareServerNote, type ServerMemoryNoteDraft } from "./daily-note.js";
import { withIdempotency, type IdempotencyResult } from "./idempotency.js";
import { defaultRemoteIndexState, markRemoteIndexStale, readRemoteIndexState, type RemoteIndexState } from "./state.js";
import { compactSearchServerMemory } from "./compact.js";
import { expandServerMemoryDocument } from "./expansion.js";
import type { CompactRecallOptions, CompactRecallPacket } from "../../core/retrieval-policy/compact.js";
import type { ExpansionOptions, ExpansionResult } from "../../core/canonical/expansion.js";
export { compactSearchServerMemory, expandServerMemoryDocument };

import { getDreamWindow, abandonDreamBatch, createDreamBatch, getDreamBatch, getDreamStatus, completeDreamBatch } from "./dream.js";
export { getDreamWindow, abandonDreamBatch, createDreamBatch, getDreamBatch, getDreamStatus, completeDreamBatch };

export { recentServerMemory, type RemoteMemoryRecentNote, type RemoteMemoryRecentPacket } from "./recent.js";
export { resolveServerMemoryTitle } from "./resolve-title.js";

export { MemoryExecutionError } from "../local-memory/index.js";
export { DreamStateError, DREAM_BATCHES_RELATIVE_DIR, DREAM_STATE_RELATIVE_PATH } from "./dream.js";

export interface ServerMemoryRuntimeOptions {
  /** Server-local Markdown memory root. */
  root: string;
  /** Optional package version provider injected by host boundaries when initializing roots. */
  packageVersion?: () => Promise<string>;
}

export interface ServerMemoryRuntime {
  readonly root: string;
  initializeMemoryRoot(options?: { force?: boolean }): Promise<MemoryRootInitResult>;
  memoryRootStatus(): Promise<MemoryRootStatus>;
  findMemoryRoot(): Promise<string>;
  indexMemory(options?: IndexMemoryOptions): Promise<IndexMemoryResult>;
  overviewMemory(options?: MemoryOverviewOptions): Promise<MemoryOverviewResult>;
  graphMemory(options?: MemoryGraphOptions): Promise<RemoteMemoryGraphPacket>;
  searchMemory(query: string, limit: number, options?: SearchMemoryOptions): Promise<SearchMemoryResult>;
  compactSearchMemory(query: string, limit: number, options?: CompactRecallOptions): Promise<CompactRecallPacket>;
  expandMemoryDocument(options: ExpansionOptions): Promise<ExpansionResult>;
  previewMemoryDocumentDeletion(id: string): Promise<import("../../types.js").MemoryDocumentDeletePreview>;
  deleteMemoryDocument(id: string, options: { ifMatch: string; apply: true }): Promise<import("../../types.js").MemoryDocumentDeleteResult>;
  readMemoryDocument(id: string): Promise<RemoteMemoryDocumentReadPacket>;
  updateMemoryDocument(id: string, content: string, options: ServerMemoryDocumentUpdateOptions): Promise<RemoteMemoryDocumentUpdatePacket>;
  getDreamWindow(request?: DreamWindowRequest): Promise<DreamWindow>;
  getDreamStatus(): Promise<DreamStatus>;
  createDreamBatch(request?: DreamCreateRequest): Promise<DreamBatch>;
  getDreamBatch(batchId: string): Promise<DreamBatch>;
  completeDreamBatch(request: DreamCompleteRequest): Promise<DreamCompleteResult>;
  abandonDreamBatch(batchId: string, summary?: string): Promise<DreamAbandonResult>;
  processMemory(options: ProcessMemoryOptions): Promise<ProcessMemoryResult>;
  rememberMemory(options: MemoryNoteDraft): Promise<MemoryWriteResult>;
  writeSessionWrapup(draft: WrapupDraft): Promise<WrapupWriteResult>;
}

export interface RemoteMemoryStatusPacket {
  memory: "all";
  canonical: "markdown";
  readOnlyRetrieval: "lexical-immutable-v1";
  readiness?: MemoryRootStatus["readiness"];
  initialized: boolean;
  compatible: boolean;
  configFile?: string;
  schemaVersion?: number;
  index: RemoteIndexState;
}

export interface RemoteMemoryIndexPacket {
  readiness?: IndexMemoryResult["readiness"];
  work?: IndexMemoryResult["work"];
  memory: "all";
  root: "remote:all";
  documents: number;
  qmdCollection: string;
  index: RemoteIndexState;
}

export interface RemoteMemoryOverviewPacket extends Omit<MemoryOverviewResult, "root"> {
  memory: "all";
  target: "remote";
  root: "remote:all";
}

export interface RemoteMemoryGraphPacket extends Omit<MemoryGraphResult, "root"> {
  memory: "all";
  target: "remote";
  root: "remote:all";
}

export interface RemoteMemorySearchPacket extends Omit<SearchMemoryResult, "root"> {
  memory: "all";
  target: "remote";
  root: "remote:all";
  mode?: "recall";
  index: RemoteIndexState;
}

export type RemoteMemoryWritePacket = MemoryWriteResult & Record<string, unknown> & {
  memory: "all";
  target: "remote";
  index: RemoteIndexState;
};

export type RemoteMemoryDocumentReadPacket = Omit<MemoryDocumentReadResult, "root" | "target" | "memory"> & {
  memory: "all";
  target: "remote";
  root: "remote:all";
};

export interface ServerMemoryDocumentUpdateOptions {
  ifMatch?: MemoryDocumentContentHash | string;
  contentHash?: MemoryDocumentContentHash | string;
  updatedAt?: string;
}

export type RemoteMemoryDocumentUpdatePacket = Omit<MemoryDocumentUpdateResult, "root" | "target" | "memory"> & {
  memory: "all";
  target: "remote";
  root: "remote:all";
  index: RemoteIndexState;
};

export function createServerMemoryRuntime(options: ServerMemoryRuntimeOptions): ServerMemoryRuntime {
  const root = normalizeServerRoot(options.root);
  return {
    root,
    initializeMemoryRoot: async (initOptions) => initializeMemoryRoot(root, { ...initOptions, packageVersion: options.packageVersion ? await options.packageVersion() : undefined }),
    memoryRootStatus: () => memoryStatus(root),
    findMemoryRoot: () => findMemoryRoot(root),
    indexMemory: (indexOptions) => indexMemory(root, indexOptions),
    overviewMemory: (overviewOptions) => overviewMemory(root, overviewOptions),
    graphMemory: (graphOptions) => graphServerMemory({ root, graph: graphOptions }),
    searchMemory: (query, limit, searchOptions) => searchMemory(root, query, limit, { ...searchOptions, refresh: false }),
    compactSearchMemory: (query, limit, recall) => compactSearchServerMemory({ root, query, limit, recall }),
    expandMemoryDocument: (expansion) => expandServerMemoryDocument({ ...expansion, root }),
    previewMemoryDocumentDeletion: (id) => previewServerMemoryDeletion({ root, id }),
    deleteMemoryDocument: (id, options) => deleteServerMemoryDocument({ root, id, ...options }),
    readMemoryDocument: (id) => readServerMemoryDocument({ root, id }),
    updateMemoryDocument: (id, content, updateOptions) => updateServerMemoryDocument({ root, id, content, ...updateOptions }),
    getDreamWindow: (request) => getDreamWindow({ root, request }),
    getDreamStatus: () => getDreamStatus({ root }),
    createDreamBatch: (request) => createDreamBatch({ root, request }),
    getDreamBatch: (batchId) => getDreamBatch({ root, batchId }),
    completeDreamBatch: (request) => completeDreamBatch({ root, request }),
    abandonDreamBatch: (batchId, summary) => abandonDreamBatch({ root, batchId, summary }),
    processMemory: (processOptions) => processMemory(root, processOptions),
    rememberMemory: (memoryOptions) => rememberMemory(root, memoryOptions),
    writeSessionWrapup: (draft) => writeSessionWrapup(root, draft),
  };
}

export async function serverMemoryStatus(rootArg: string): Promise<RemoteMemoryStatusPacket> {
  const status = await memoryStatus(rootArg);
  const index = await readRemoteIndexState(status.root);
  return {
    memory: "all",
    canonical: "markdown",
    readOnlyRetrieval: "lexical-immutable-v1",
    initialized: status.initialized,
    compatible: status.compatible,
    configFile: status.configFile,
    schemaVersion: status.schemaVersion,
    readiness: status.readiness,
    index,
  };
}

export async function indexServerMemory(options: { root: string; indexRunner?: RemoteIndexRunner; reason?: string; rebuild?: boolean; signal?: AbortSignal; timeoutMs?: number } | string): Promise<RemoteMemoryIndexPacket> {
  const root = typeof options === "string" ? options : options.root;
  const indexRunner = typeof options === "string" ? createRemoteIndexRunner({ root }) : options.indexRunner ?? createRemoteIndexRunner({ root });
  const { result, index } = await indexRunner.indexNow(typeof options === "string" ? "manual" : options.reason ?? "manual", typeof options === "string" ? undefined : { rebuild: options.rebuild, ...(options.signal ? { signal: options.signal } : {}), ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) });
  return {
    memory: "all",
    root: "remote:all",
    documents: result.documents,
    qmdCollection: result.qmdCollection,
    readiness: result.readiness,
    work: result.work,
    index,
  };
}

export async function overviewServerMemory(options: { root: string; overview?: MemoryOverviewOptions }): Promise<RemoteMemoryOverviewPacket> {
  const result = await overviewMemory(options.root, options.overview);
  return {
    ...result,
    memory: "all",
    target: "remote",
    root: "remote:all",
  };
}

export async function graphServerMemory(options: { root: string; graph?: MemoryGraphOptions }): Promise<RemoteMemoryGraphPacket> {
  const result = await graphMemory(options.root, options.graph);
  return {
    ...result,
    memory: "all",
    target: "remote",
    root: "remote:all",
  };
}

export async function readServerMemoryDocument(options: { root: string; id: string }): Promise<RemoteMemoryDocumentReadPacket> {
  const result = await readMemoryDocument(options.root, options.id);
  return {
    ...result,
    memory: "all",
    target: "remote",
    root: "remote:all",
  };
}

export async function updateServerMemoryDocument(options: {
  root: string;
  id: string;
  content: string;
  ifMatch?: MemoryDocumentContentHash | string;
  contentHash?: MemoryDocumentContentHash | string;
  updatedAt?: string;
}): Promise<RemoteMemoryDocumentUpdatePacket> {
  const result = await updateMemoryDocument(options.root, options.id, options.content, {
    ifMatch: options.ifMatch,
    contentHash: options.contentHash,
    updatedAt: options.updatedAt,
  });
  const index = await markRemoteIndexStale(options.root);
  return {
    ...result,
    memory: "all",
    target: "remote",
    root: "remote:all",
    indexed: false,
    index,
  };
}

export async function searchServerMemory(options: ExecutionOptions & {
  root: string;
  query: string;
  limit: number;
  depth?: RetrievalDepth | string;
  recall?: boolean;
  temporal?: SearchMemoryOptions["temporal"];
  readOnly?: boolean;
}): Promise<RemoteMemorySearchPacket> {
  const searchOptions: SearchMemoryOptions = { refresh: false, readOnly: options.readOnly, depth: options.depth, temporal: options.temporal, signal: options.signal, timeoutMs: options.timeoutMs };
  const result = await searchMemory(options.root, options.query, options.limit, searchOptions);
  const index = await readRemoteIndexState(result.root);
  return {
    memory: "all",
    target: "remote",
    root: "remote:all",
    ...(options.recall ? { mode: "recall" as const } : {}),
    query: result.query,
    depth: result.depth,
    index,
    results: result.results,
    readiness: result.readiness,
    retrieval: result.retrieval,
    ...(result.temporal ? { temporal: result.temporal } : {}),
  };
}

export async function writeServerMemoryWithIdempotency(options: {
  root: string;
  key?: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  write:
    | { kind: "note"; draft: ServerMemoryNoteDraft; dailyDate?: unknown }
    | { kind: "wrapup"; draft: RemoteWrapupDraft };
}): Promise<IdempotencyResult<RemoteMemoryWritePacket>> {
  return withIdempotency({
    root: options.root,
    key: options.key,
    method: options.method,
    path: options.path,
    body: options.body,
    onRecordFailure: saved => ({ ...saved, ...failedCreationReplay() }),
    create: async () => {
      const writeResult = options.write.kind === "note"
        ? await writeRemoteMemoryNote(options.root, await prepareServerNote(options.root, options.write.draft, options.write.dailyDate),
          options.write.dailyDate === undefined ? undefined : { heading: DAILY_NOTE_HEADING })
        : await writeRemoteSessionWrapup(options.root, options.write.draft);
      // Canonical publication above must still throw on failure. This catch is
      // strictly derived-index bookkeeping; replay storage has its own saved-result guard.
      let index: RemoteIndexState;
      try {
        index = await markRemoteIndexStale(options.root);
      } catch (error) {
        return { memory: "all", target: "remote", ...writeResult, ...failedCreationIndex(error, true), index: defaultRemoteIndexState() };
      }
      return { memory: "all", target: "remote", ...writeResult, index };
    },
  });
}

function normalizeServerRoot(root: string): string {
  const normalized = root.trim();
  if (!normalized) throw new Error("Server memory root is required.");
  return normalized;
}

export async function previewServerMemoryDeletion(options: { root: string; id: string }) {
  const result = await previewMemoryDocumentDeletion(options.root, options.id);
  return { ...result, root: "remote:all" as const, target: "remote" as const, memory: "all" as const };
}
export async function deleteServerMemoryDocument(options: { root: string; id: string; ifMatch: string; apply: true }) {
  const result = await deleteMemoryDocument(options.root, options.id, options);
  // Canonical removal has succeeded: derived bookkeeping must never turn it into
  // a misleading deletion failure or trigger another canonical attempt.
  try { return { ...result, root: "remote:all" as const, target: "remote" as const, memory: "all" as const,
    index: await markRemoteIndexStale(options.root) }; }
  catch { return { ...result, root: "remote:all" as const, target: "remote" as const, memory: "all" as const,
    indexing: { status: "failed" as const, diagnostic: "Note removed. Index bookkeeping failed; refresh the index." } }; }
}
