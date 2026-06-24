import * as runtime from "../runtime/index.js";
import type {
  IndexMemoryResult,
  MemoryNoteDraft,
  MemoryRootInitResult,
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
  initializeMemoryRoot(rootArg: string, options?: { force?: boolean }): Promise<MemoryRootInitResult>;
  memoryRootStatus(rootArg: string): Promise<MemoryRootStatus>;
  findMemoryRoot(startArg?: string): Promise<string>;
  indexMemory(rootArg: string): Promise<IndexMemoryResult>;
  searchMemory(rootArg: string, query: string, limit: number, options?: SearchMemoryOptions): Promise<SearchMemoryResult>;
  processMemory(rootArg: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult>;
  rememberMemory(rootArg: string, options: MemoryNoteDraft): Promise<MemoryWriteResult>;
  writeSessionWrapup(rootArg: string, draft: WrapupDraft): Promise<WrapupWriteResult>;
}

export function createLocalMemoryTransport(): LocalMemoryTransport {
  return {
    initializeMemoryRoot: runtime.initializeMemoryRoot,
    memoryRootStatus: runtime.memoryRootStatus,
    findMemoryRoot: runtime.findMemoryRoot,
    indexMemory: runtime.indexMemory,
    searchMemory: runtime.searchMemory,
    processMemory: runtime.processMemory,
    rememberMemory: runtime.rememberMemory,
    writeSessionWrapup: runtime.writeSessionWrapup,
  };
}
