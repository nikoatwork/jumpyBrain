export * from "../core/index.js";
export * from "../app/writing/index.js";
export type {
  DreamAbandonResult,
  DreamBatch,
  DreamCompleteRequest,
  DreamCompleteResult,
  DreamCreateRequest,
  DreamStatus,
  IndexMemoryResult,
  MemoryGraphOptions,
  MemoryGraphResult,
  MemoryOverviewOptions,
  MemoryOverviewResult,
  ProcessMemoryOptions,
  ProcessMemoryResult,
  SearchMemoryOptions,
  SearchMemoryResult,
  SearchResult,
} from "../types.js";
export { processMemory } from "../app/processing/index.js";
export { ensureMemoryDocumentIds, graphMemory, indexMemory, overviewMemory, readMemoryDocument, searchMemory, updateMemoryDocument } from "../app/local-memory/index.js";
export { abandonDreamBatch, createDreamBatch, getDreamBatch, getDreamStatus, completeDreamBatch } from "../app/dream/index.js";

import { packageVersion } from "../adapters/package-info/index.js";
import { initializeMemoryRoot as initializeCoreMemoryRoot } from "../core/index.js";
import type { MemoryRootInitResult } from "../core/index.js";

export async function initializeMemoryRoot(rootArg: string, options: { force?: boolean } = {}): Promise<MemoryRootInitResult> {
  return initializeCoreMemoryRoot(rootArg, { ...options, packageVersion: await packageVersion() });
}
