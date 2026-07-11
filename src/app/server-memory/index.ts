import { findMemoryRoot, initializeMemoryRoot, memoryRootStatus } from "../../core/memory-root/index.js";
import { graphMemory, indexMemory, overviewMemory, readMemoryDocument, searchMemory, updateMemoryDocument } from "../local-memory/index.js";
import { processMemory } from "../processing/index.js";
import { rememberMemory, writeSessionWrapup, type WrapupDraft, type WrapupWriteResult } from "../writing/index.js";
import { writeRemoteMemoryNote, writeRemoteSessionWrapup, type RemoteMemoryNoteDraft, type RemoteWrapupDraft } from "../writing/remote-writer.js";
import type {
  DreamAbandonResult,
  DreamBatch,
  DreamCompleteRequest,
  DreamCompleteResult,
  DreamCreateRequest,
  DreamStatus,
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
import { withIdempotency, type IdempotencyResult } from "./idempotency.js";
import { markRemoteIndexStale, readRemoteIndexState, type RemoteIndexState } from "./state.js";
import { abandonDreamBatch as abandonServerDreamBatch, createDreamBatch as createServerDreamBatch, getDreamBatch as getServerDreamBatch, getDreamStatus as getServerDreamStatus, completeDreamBatch as completeServerDreamBatch } from "./dream.js";

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
  indexMemory(): Promise<IndexMemoryResult>;
  overviewMemory(options?: MemoryOverviewOptions): Promise<MemoryOverviewResult>;
  graphMemory(options?: MemoryGraphOptions): Promise<RemoteMemoryGraphPacket>;
  searchMemory(query: string, limit: number, options?: SearchMemoryOptions): Promise<SearchMemoryResult>;
  readMemoryDocument(id: string): Promise<RemoteMemoryDocumentReadPacket>;
  updateMemoryDocument(id: string, content: string, options: ServerMemoryDocumentUpdateOptions): Promise<RemoteMemoryDocumentUpdatePacket>;
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
  initialized: boolean;
  compatible: boolean;
  configFile?: string;
  schemaVersion?: number;
  index: RemoteIndexState;
}

export interface RemoteMemoryIndexPacket {
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

export type RemoteMemoryWritePacket = Record<string, unknown> & {
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
    memoryRootStatus: () => memoryRootStatus(root),
    findMemoryRoot: () => findMemoryRoot(root),
    indexMemory: () => indexMemory(root),
    overviewMemory: (overviewOptions) => overviewMemory(root, overviewOptions),
    graphMemory: (graphOptions) => graphServerMemory({ root, graph: graphOptions }),
    searchMemory: (query, limit, searchOptions) => searchMemory(root, query, limit, searchOptions),
    readMemoryDocument: (id) => readServerMemoryDocument({ root, id }),
    updateMemoryDocument: (id, content, updateOptions) => updateServerMemoryDocument({ root, id, content, ...updateOptions }),
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
  const status = await memoryRootStatus(rootArg);
  const index = await readRemoteIndexState(status.root);
  return {
    memory: "all",
    canonical: "markdown",
    initialized: status.initialized,
    compatible: status.compatible,
    configFile: status.configFile,
    schemaVersion: status.schemaVersion,
    index,
  };
}

export async function indexServerMemory(options: { root: string; indexRunner?: RemoteIndexRunner; reason?: string } | string): Promise<RemoteMemoryIndexPacket> {
  const root = typeof options === "string" ? options : options.root;
  const indexRunner = typeof options === "string" ? createRemoteIndexRunner({ root }) : options.indexRunner ?? createRemoteIndexRunner({ root });
  const { result, index } = await indexRunner.indexNow(typeof options === "string" ? "manual" : options.reason ?? "manual");
  return {
    memory: "all",
    root: "remote:all",
    documents: result.documents,
    qmdCollection: result.qmdCollection,
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

export async function getDreamStatus(options: { root: string }): Promise<DreamStatus> {
  return getServerDreamStatus(options);
}

export async function createDreamBatch(options: { root: string; request?: DreamCreateRequest }): Promise<DreamBatch> {
  return createServerDreamBatch(options);
}

export async function getDreamBatch(options: { root: string; batchId: string }): Promise<DreamBatch> {
  return getServerDreamBatch(options);
}

export async function completeDreamBatch(options: { root: string; request: DreamCompleteRequest }): Promise<DreamCompleteResult> {
  return completeServerDreamBatch(options);
}

export async function abandonDreamBatch(options: { root: string; batchId: string; summary?: string }): Promise<DreamAbandonResult> {
  return abandonServerDreamBatch(options);
}

export async function searchServerMemory(options: {
  root: string;
  query: string;
  limit: number;
  depth?: RetrievalDepth | string;
  recall?: boolean;
}): Promise<RemoteMemorySearchPacket> {
  const searchOptions: SearchMemoryOptions = { depth: options.depth };
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
  };
}

export async function writeServerMemoryWithIdempotency(options: {
  root: string;
  key?: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  write:
    | { kind: "note"; draft: RemoteMemoryNoteDraft }
    | { kind: "wrapup"; draft: RemoteWrapupDraft };
}): Promise<IdempotencyResult<RemoteMemoryWritePacket>> {
  return withIdempotency({
    root: options.root,
    key: options.key,
    method: options.method,
    path: options.path,
    body: options.body,
    create: async () => {
      const writeResult = options.write.kind === "note"
        ? await writeRemoteMemoryNote(options.root, options.write.draft)
        : await writeRemoteSessionWrapup(options.root, options.write.draft);
      const index = await markRemoteIndexStale(options.root);
      return { memory: "all", target: "remote", ...writeResult, index };
    },
  });
}

function normalizeServerRoot(root: string): string {
  const normalized = root.trim();
  if (!normalized) throw new Error("Server memory root is required.");
  return normalized;
}
