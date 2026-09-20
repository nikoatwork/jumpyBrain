import * as runtime from "../runtime/index.js";
import type {
  DreamAbandonResult,
  DreamBatch,
  DreamCompleteRequest,
  DreamCompleteResult,
  DreamCreateRequest,
  DreamStatus,
  DreamWindow,
  DreamWindowRequest,
  IndexMemoryResult,
  LogseqMigrationResult,
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
  migrateLogseq(source: string, root: string, options?: { apply?: boolean; failOnConflict?: boolean }): Promise<LogseqMigrationResult>;
  initializeMemoryRoot(rootArg: string, options?: { force?: boolean }): Promise<MemoryRootInitResult>;
  memoryRootStatus(rootArg: string): Promise<MemoryRootStatus>;
  findMemoryRoot(startArg?: string): Promise<string>;
  indexMemory(rootArg: string): Promise<IndexMemoryResult>;
  overviewMemory(rootArg: string, options?: MemoryOverviewOptions): Promise<MemoryOverviewResult>;
  searchMemory(rootArg: string, query: string, limit: number, options?: SearchMemoryOptions): Promise<SearchMemoryResult>;
  processMemory(rootArg: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult>;
  readMemoryDocument(rootArg: string, id: string): Promise<MemoryDocumentReadResult>;
  updateMemoryDocument(rootArg: string, id: string, content: string, options?: { ifMatch?: string; contentHash?: string }): Promise<MemoryDocumentUpdateResult>;
  getDreamWindow(rootArg: string, request?: DreamWindowRequest): Promise<DreamWindow>;
  getDreamStatus(rootArg: string): Promise<DreamStatus>;
  createDreamBatch(rootArg: string, request?: DreamCreateRequest): Promise<DreamBatch>;
  getDreamBatch(rootArg: string, batchId: string): Promise<DreamBatch>;
  completeDreamBatch(rootArg: string, request: DreamCompleteRequest): Promise<DreamCompleteResult>;
  abandonDreamBatch(rootArg: string, batchId: string, summary?: string): Promise<DreamAbandonResult>;
  rememberMemory(rootArg: string, options: MemoryNoteDraft): Promise<MemoryWriteResult>;
  writeSessionWrapup(rootArg: string, draft: WrapupDraft): Promise<WrapupWriteResult>;
}

export function createLocalMemoryTransport(): LocalMemoryTransport {
  return {
    migrateLogseq: runtime.migrateLogseq,
    initializeMemoryRoot: runtime.initializeMemoryRoot,
    memoryRootStatus: runtime.memoryRootStatus,
    findMemoryRoot: runtime.findMemoryRoot,
    indexMemory: runtime.indexMemory,
    overviewMemory: runtime.overviewMemory,
    searchMemory: runtime.searchMemory,
    processMemory: runtime.processMemory,
    readMemoryDocument: runtime.readMemoryDocument,
    updateMemoryDocument: runtime.updateMemoryDocument,
    getDreamWindow: (rootArg, request) => runtime.getDreamWindow({ root: rootArg, request }),
    getDreamStatus: (rootArg) => runtime.getDreamStatus({ root: rootArg }),
    createDreamBatch: (rootArg, request) => runtime.createDreamBatch({ root: rootArg, request }),
    getDreamBatch: (rootArg, batchId) => runtime.getDreamBatch({ root: rootArg, batchId }),
    completeDreamBatch: (rootArg, request) => runtime.completeDreamBatch({ root: rootArg, request }),
    abandonDreamBatch: (rootArg, batchId, summary) => runtime.abandonDreamBatch({ root: rootArg, batchId, summary }),
    rememberMemory: runtime.rememberMemory,
    writeSessionWrapup: runtime.writeSessionWrapup,
  };
}
