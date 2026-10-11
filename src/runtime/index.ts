export * from "../core/index.js";
export * from "../app/writing/index.js";
export type {
  DreamAbandonResult,
  DreamBatch,
  DreamCompleteRequest,
  DreamCompleteResult,
  DreamCreateRequest,
  DreamStatus,
  DreamWindow,
  DreamWindowRequest,
  DreamWindowRange,
  DreamWindowFileContext,
  DreamWindowFileDateBasis,
  IndexMemoryOptions,
  IndexMemoryResult,
  RetrievalReadiness,
  RetrievalOutcome,
  MemoryGraphOptions,
  MemoryGraphResult,
  MemoryOverviewOptions,
  MemoryOverviewResult,
  ProcessMemoryOptions,
  ProcessMemoryResult,
  EvidenceDate,
  TemporalQuery,
  TemporalResolution,
  TemporalCoverage,
  TemporalRetrieval,
  ExecutionOptions,
  SearchMemoryOptions,
  SearchMemoryResult,
  SearchResult,
} from "../types.js";
export { processMemory } from "../app/processing/index.js";
export { compactSearchMemory, serializeCompactRecall, type CompactRecallOptions, type CompactRecallPacket, type CompactRecallPassage, expandMemoryDocument, memoryStatus as memoryRootStatus, ensureMemoryDocumentIds, ensureMemoryIndexed, graphMemory, indexMemory, overviewMemory, readMemoryDocument, searchMemory, updateMemoryDocument } from "../app/local-memory/index.js";
export { getDreamWindow, abandonDreamBatch, createDreamBatch, getDreamBatch, getDreamStatus, completeDreamBatch } from "../app/dream/index.js";

import { packageVersion } from "../adapters/package-info/index.js";
import { initializeMemoryRoot as initializeCoreMemoryRoot } from "../core/index.js";
import type { MemoryRootInitResult } from "../core/index.js";

export async function initializeMemoryRoot(rootArg: string, options: { force?: boolean } = {}): Promise<MemoryRootInitResult> {
  return initializeCoreMemoryRoot(rootArg, { ...options, packageVersion: await packageVersion() });
}

export { migrateLogseq } from "../app/migration/index.js";
export type { LogseqMigrationResult } from "../app/migration/index.js";

export type { DreamWorkflowConfig } from "../app/dream/index.js";

export { resolveTemporalQuery } from "../core/retrieval-policy/temporal.js";
