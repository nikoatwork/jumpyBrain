export { indexMemory, searchMemory } from "./retrieval/index.js";
export { findMemoryRoot, initializeMemoryRoot, memoryRootStatus, resolveIndexRoot } from "./setup/index.js";
export { writeMemoryNote, writeSessionWrapup } from "./writing/index.js";
export type {
  Frontmatter,
  FrontmatterValue,
  IndexMemoryResult,
  MemoryConfidence,
  MemoryNoteDraft,
  MemoryNoteType,
  MemoryReviewStatus,
  MemoryRootConfig,
  MemoryRootInitResult,
  MemoryRootStatus,
  MemoryWriteResult,
  Provenance,
  ScoreBreakdown,
  SearchMemoryResult,
  SearchResult,
} from "./types.js";
export type { WrapupDraft, WrapupValidation, WrapupWriteResult } from "./writing/index.js";
