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
  WrapupDraft,
  WrapupWriteResult,
} from "../runtime/index.js";

export interface ServerMemoryRuntimeOptions {
  /**
   * Server-local Markdown memory root. Server mode composes the same local
   * runtime against this path; HTTP, auth, and remote target concerns live
   * outside this boundary.
   */
  root: string;
}

export interface ServerMemoryRuntime {
  readonly root: string;
  initializeMemoryRoot(options?: { force?: boolean }): Promise<MemoryRootInitResult>;
  memoryRootStatus(): Promise<MemoryRootStatus>;
  findMemoryRoot(): Promise<string>;
  indexMemory(): Promise<IndexMemoryResult>;
  searchMemory(query: string, limit: number, options?: SearchMemoryOptions): Promise<SearchMemoryResult>;
  processMemory(options: ProcessMemoryOptions): Promise<ProcessMemoryResult>;
  rememberMemory(options: MemoryNoteDraft): Promise<MemoryWriteResult>;
  writeSessionWrapup(draft: WrapupDraft): Promise<WrapupWriteResult>;
}

/**
 * Compose jumpyBrain's local runtime for a server process using a server-local
 * Markdown memory root. This is intentionally not an HTTP daemon and does not
 * import CLI command parsing code.
 */
export function createServerMemoryRuntime(options: ServerMemoryRuntimeOptions): ServerMemoryRuntime {
  const root = normalizeServerRoot(options.root);
  return {
    root,
    initializeMemoryRoot: (initOptions) => runtime.initializeMemoryRoot(root, initOptions),
    memoryRootStatus: () => runtime.memoryRootStatus(root),
    findMemoryRoot: () => runtime.findMemoryRoot(root),
    indexMemory: () => runtime.indexMemory(root),
    searchMemory: (query, limit, searchOptions) => runtime.searchMemory(root, query, limit, searchOptions),
    processMemory: (processOptions) => runtime.processMemory(root, processOptions),
    rememberMemory: (memoryOptions) => runtime.rememberMemory(root, memoryOptions),
    writeSessionWrapup: (draft) => runtime.writeSessionWrapup(root, draft),
  };
}

function normalizeServerRoot(root: string): string {
  const normalized = root.trim();
  if (!normalized) throw new Error("Server memory root is required.");
  return normalized;
}
