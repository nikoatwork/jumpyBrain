import { randomUUID } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { ensureRootBackend } from "../app/backend-host/index.js";
import * as runtime from "../runtime/index.js";
import type {
  CompactRecallOptions,
  CompactRecallPacket,
  ExpansionOptions,
  ExpansionResult,
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
  ObsidianMigrationResult,
  ObsidianMigrationOptions,
  LogseqMigrationResult,
  LogseqMigrationOptions,
  MemoryNoteDraft,
  MemoryOverviewOptions,
  MemoryOverviewResult,
  MemoryRootInitResult,
  MemoryDocumentReadResult,
  MemoryDocumentUpdateResult,
  MemoryRootStatus,
  MemoryWriteResult,
  ProcessMemoryOptions,
  ProcessMemoryResult,
  SearchMemoryOptions,
  SearchMemoryResult,
  SearchResult,
  WrapupDraft,
  WrapupWriteResult,
} from "../runtime/index.js";

export type { SearchResult };

export interface LocalMemoryTransport {
  migrateObsidian(source: string, root: string, options?: ObsidianMigrationOptions): Promise<ObsidianMigrationResult>;
  migrateLogseq(source: string, root: string, options?: LogseqMigrationOptions): Promise<LogseqMigrationResult>;
  initializeMemoryRoot(rootArg: string, options?: { force?: boolean }): Promise<MemoryRootInitResult>;
  memoryRootStatus(rootArg: string): Promise<MemoryRootStatus>;
  findMemoryRoot(startArg?: string): Promise<string>;
  indexMemory(rootArg: string, options?: IndexMemoryOptions): Promise<IndexMemoryResult>;
  ensureSavedMemoryIndexed(rootArg: string, saved: MemoryWriteResult, options?: IndexMemoryOptions): Promise<MemoryWriteResult>;
  overviewMemory(rootArg: string, options?: MemoryOverviewOptions): Promise<MemoryOverviewResult>;
  searchMemory(rootArg: string, query: string, limit: number, options?: SearchMemoryOptions): Promise<SearchMemoryResult>;
  compactSearchMemory(rootArg: string, query: string, limit: number, options?: CompactRecallOptions): Promise<CompactRecallPacket>;
  expandMemoryDocument(rootArg: string, options: ExpansionOptions): Promise<ExpansionResult>;
  processMemory(rootArg: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult>;
  previewMemoryDocumentDeletion: typeof runtime.previewMemoryDocumentDeletion;
  deleteMemoryDocument: typeof runtime.deleteMemoryDocument;
  readMemoryDocument(rootArg: string, id: string): Promise<MemoryDocumentReadResult>;
  updateMemoryDocument(rootArg: string, id: string, content: string, options?: { ifMatch?: string; contentHash?: string }): Promise<MemoryDocumentUpdateResult>;
  checkDreamSources: typeof runtime.checkDreamSources;
  getDreamWindow(rootArg: string, request?: DreamWindowRequest): Promise<DreamWindow>;
  getDreamStatus(rootArg: string): Promise<DreamStatus>;
  createDreamBatch(rootArg: string, request?: DreamCreateRequest): Promise<DreamBatch>;
  getDreamBatch(rootArg: string, batchId: string): Promise<DreamBatch>;
  completeDreamBatch(rootArg: string, request: DreamCompleteRequest): Promise<DreamCompleteResult>;
  abandonDreamBatch(rootArg: string, batchId: string, summary?: string): Promise<DreamAbandonResult>;
  rememberMemory(rootArg: string, options: MemoryNoteDraft): Promise<MemoryWriteResult>;
  writeSessionWrapup(rootArg: string, draft: WrapupDraft): Promise<WrapupWriteResult>;
}

/** CLI owns OS signal policy; library/runtime callers supply AbortSignal explicitly. */
export async function cancelOnCliSignal<T>(signal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try { return await operation(signal ? AbortSignal.any([signal, controller.signal]) : controller.signal); }
  finally { process.off("SIGINT", abort); process.off("SIGTERM", abort); }
}

/** Requests are never retried after dispatch: a lost reply can mean a committed write. */
export async function localBackendCall<T>(root: string, method: string, args: unknown[], signal?: AbortSignal): Promise<T> {
  return cancelOnCliSignal(signal, async signal => {
    if (signal.aborted) throw new Error("Memory operation canceled.");
    const indexOptionsAt = method === "indexMemory" ? 0 : method === "ensureSavedMemoryIndexed" ? 1 : undefined;
    const indexTimeoutMs = indexOptionsAt === undefined ? undefined : runtime.memoryExecutionDeadlineMs("index",
      (args[indexOptionsAt] as IndexMemoryOptions | undefined)?.timeoutMs ?? (process.env.JUMPYBRAIN_INDEX_TIMEOUT_MS === undefined ? undefined : Number(process.env.JUMPYBRAIN_INDEX_TIMEOUT_MS)));
    // Invalid roots/configuration and a bad explicit engine choice must fail
    // without starting a service or manufacturing operational state.
    await runtime.memoryRootStatus(root);
    if (["indexMemory", "searchMemory", "compactSearchMemory"].includes(method)) {
      await runtime.resolveIndexRoot(root);
      const selected = process.env.JUMPYBRAIN_QMD_BIN?.trim();
      if (selected && !existsSync(selected)) throw new Error(`qmd CLI is required. Selected JUMPYBRAIN_QMD_BIN=${JSON.stringify(selected)}. Correct this override or run \`unset JUMPYBRAIN_QMD_BIN\` to use normal resolution, then retry. If still unavailable, install with \`npm install -g @tobilu/qmd@2.8.3\` or set JUMPYBRAIN_QMD_BIN to its CLI.`);
    }
    const backend = await ensureRootBackend(root, {signal});
    const id = randomUUID();
    const cancel = () => {void fetch(backend.url + "/_backend/cancel", {method:"POST", redirect:"manual", headers:{Authorization:"Bearer " + backend.token,"content-type":"application/json"},body:JSON.stringify({id})}).then(response => response.body?.cancel()).catch(() => {});};
    signal.addEventListener("abort", cancel, {once: true});
    try {
    const selectedEngine = runtime.resolveLocalSearchEngineBinary();
    const qmdBinary = path.isAbsolute(selectedEngine) || selectedEngine.includes(path.sep) ? path.resolve(selectedEngine)
      : (process.env.PATH ?? "").split(path.delimiter).map(directory => path.join(directory, selectedEngine)).find(candidate => existsSync(candidate)) ?? selectedEngine;
    const serialArgs = [...args];
    if (indexOptionsAt !== undefined) serialArgs[indexOptionsAt] = { ...(serialArgs[indexOptionsAt] as object), timeoutMs: indexTimeoutMs };
    while (serialArgs.length && serialArgs[serialArgs.length - 1] === undefined) serialArgs.pop();
    if (signal.aborted) cancel();
    const response = await fetch(backend.url + "/_backend/call", {method: "POST", redirect: "manual", signal: AbortSignal.timeout(indexOptionsAt === undefined ? 650_000 : runtime.memoryTransportDeadlineMs("index", indexTimeoutMs)),
      headers: {Authorization: "Bearer " + backend.token, "content-type": "application/json", "x-jumpybrain-operation": id},
      body: JSON.stringify({method, args: serialArgs, qmdBinary})});
    if (signal.aborted) cancel();
    const packet = await response.json() as any;
    if (!response.ok || packet.error) throw Object.assign(new Error(packet.error?.message ?? "Backend request failed; inspect the canonical state before retrying."), packet.error);
    return packet.result as T;
    } finally {signal.removeEventListener("abort", cancel);}
  });
}

export function createLocalMemoryTransport(): LocalMemoryTransport {
  const transport: LocalMemoryTransport = {
    // Initial creation and observational inspection need no daemon or index writes.
    initializeMemoryRoot: (root, options) => existsSync(path.join(root, "jumpybrain.json")) && options?.force ? localBackendCall(root, "initializeMemoryRoot", [options]) : runtime.initializeMemoryRoot(root, options),
    memoryRootStatus: runtime.memoryRootStatus,
    findMemoryRoot: runtime.findMemoryRoot,
    migrateLogseq: async (source, root, options) => !options?.apply || !existsSync(root) ? runtime.migrateLogseq(source, root, options) : localBackendCall(root, "migrateLogseq", [source, options]),
    migrateObsidian: async (source, root, options) => !options?.apply || !existsSync(root) ? runtime.migrateObsidian(source, root, options) : localBackendCall(root, "migrateObsidian", [source, options]),
    indexMemory: (root, options = {}) => localBackendCall(root, "indexMemory", [options], options.signal),
    ensureSavedMemoryIndexed: (root, saved, options = {}) => localBackendCall(root, "ensureSavedMemoryIndexed", [saved, options], options.signal),
    overviewMemory: runtime.overviewMemory,
    searchMemory: (root, query, limit, options = {}) => options.readOnly
      ? cancelOnCliSignal(options.signal, signal => runtime.searchMemory(root, query, limit, {...options, signal}))
      : localBackendCall(root, "searchMemory", [query, limit, options], options.signal),
    compactSearchMemory: (root, query, limit, options = {}) => options.readOnly
      ? cancelOnCliSignal(options.signal, signal => runtime.compactSearchMemory(root, query, limit, {...options, signal}))
      : localBackendCall(root, "compactSearchMemory", [query, limit, options], options.signal),
    expandMemoryDocument: runtime.expandMemoryDocument,
    processMemory: (root, options) => options.preview || options.apply !== true ? runtime.processMemory(root, options) : localBackendCall(root, "processMemory", [options]),
    readMemoryDocument: runtime.readMemoryDocument,
    previewMemoryDocumentDeletion: runtime.previewMemoryDocumentDeletion,
    deleteMemoryDocument: (root, id, options) => localBackendCall(root, "deleteMemoryDocument", [id, options]),
    updateMemoryDocument: (root, id, content, options) => localBackendCall(root, "updateMemoryDocument", [id, content, options]),
    checkDreamSources: runtime.checkDreamSources,
    getDreamWindow: (root, request) => runtime.getDreamWindow({root,request}),
    getDreamStatus: root => runtime.getDreamStatus({root}),
    createDreamBatch: (root, request) => localBackendCall(root, "createDreamBatch", [request]),
    getDreamBatch: (root, batchId) => runtime.getDreamBatch({root,batchId}),
    completeDreamBatch: (root, request) => localBackendCall(root, "completeDreamBatch", [request]),
    abandonDreamBatch: (root, id, summary) => localBackendCall(root, "abandonDreamBatch", [id, summary]),
    rememberMemory: (root, draft) => localBackendCall(root, "rememberMemory", [draft]),
    writeSessionWrapup: (root, draft) => localBackendCall(root, "writeSessionWrapup", [draft]),
  };
  return transport;
}
