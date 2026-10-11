export type FrontmatterValue = string | number | boolean | string[];

export type Frontmatter = Record<string, FrontmatterValue>;

export interface MarkdownDocument {
  absolutePath: string;
  relativePath: string;
  frontmatter: Frontmatter;
  bodyStartLine: number;
}

export interface Provenance {
  file: string;
  lineStart: number;
  lineEnd: number;
  sessionId?: string;
  session_id?: string;
  metadata?: Frontmatter;
  /** Document-level evidence provenance, never modification/fact-validity time. */
  evidenceDate?: EvidenceDate;
}

export type RetrievalDepth = "shallow" | "normal" | "deep";

export interface ScoreBreakdown {
  qmdScore: number;
  exactMatchBoost: number;
  titleMatchBoost?: number;
  metadataBoost: number;
  temporalRelevance?: number;
  memoryStrength?: number;
  provenanceConfidence?: number;
  depthPolicyBoost?: number;
  dreamBoost?: number;
  retrievalDepth?: RetrievalDepth;
  finalScore: number;
  driver: string;
}

export interface SearchResult {
  id: string;
  score: number;
  snippet: string;
  provenance: Provenance;
  /** Additional distinct evidence from this file; the primary remains snippet/provenance. */
  passages?: Array<{ snippet: string; provenance: Provenance }>;
  /** Distinct candidate passages not returned by the bounded file-level selection. */
  omittedPassages?: number;
  sessionId?: string;
  session_id?: string;
  scoreBreakdown?: ScoreBreakdown;
}

export interface IndexingPolicy {
  mode: "lexical" | "semantic";
  /** Provisioned local GGUF; never a download URI. */
  model?: string;
  /** Optional SHA-256 pin for explicitly provisioned model bytes. */
  modelHash?: string;
}

/** Local lifecycle controls; never serialized as backend/query options. */
export interface ExecutionOptions {
  signal?: AbortSignal;
  /** Whole-operation deadline including admission/lock waits; no per-call reset. */
  timeoutMs?: number;
}

export interface IndexMemoryOptions extends ExecutionOptions {
  rebuild?: boolean;
  indexing?: IndexingPolicy;
}

/** Safe, content-free diagnostics shared by local and hosted callers. */
export interface RetrievalReadiness {
  freshness: "fresh" | "stale" | "missing" | "unknown";
  modes: Array<"lexical" | "semantic">;
  embedding: "disabled" | "complete" | "incomplete" | "unknown";
  lastFailure?: { code: string; at: string };
}

export interface RetrievalOutcome {
  status: "complete" | "partial";
  warnings: string[];
}

export interface IndexMemoryResult {
  root: string;
  documents: number;
  qmdCollection: string;
  readiness?: RetrievalReadiness;
  work?: { added: number; updated: number; unchanged: number; removed: number; embedded: number };
}

export interface SearchMemoryResult {
  root: string;
  query: string;
  depth?: RetrievalDepth;
  results: SearchResult[];
  temporal?: TemporalRetrieval;
  readiness?: RetrievalReadiness;
  retrieval?: RetrievalOutcome;
}

export interface SearchMemoryOptions extends ExecutionOptions {
  depth?: RetrievalDepth | string;
  temporal?: TemporalQuery;
}

export type EvidenceDate =
  | { basis: "declared" | "filename"; value: string }
  | { basis: "unknown"; reason: "missing" | "invalid" | "synthesis" };

/** Explicit evidence-date scope; timestamps need a timezone. Natural language is not a filter. */
export interface TemporalQuery {
  from?: string;
  to?: string;
  /** Required for t-Nd bounds; real UTC YYYY-MM-DD, never an implicit moving clock. */
  referenceDate?: string;
  order?: "relevance" | "chronological";
}

export interface TemporalResolution {
  basis: "evidence";
  timezone: "UTC";
  from?: string;
  /** Date-only upper inputs include the entire day; timestamp uppers are exclusive. */
  toExclusive?: string;
  referenceDate?: string;
  order: "relevance" | "chronological";
}

export interface TemporalCoverage {
  eligibleDocuments: number;
  excludedUndated: number;
  excludedInvalid: number;
  backfillBudget: number;
  backfilledDocuments: number;
  /** Eligible manifest documents absent from bounded discovery, not a match count. */
  unvisitedDocuments: number;
}

export interface TemporalRetrieval {
  interval: TemporalResolution;
  coverage: TemporalCoverage;
}

export interface MemoryOverviewOptions {
  showFiles?: boolean;
  limit?: number;
  connections?: boolean;
}

export interface MemoryGraphOptions {
  focus?: string;
  depth?: number;
  edgeTypes?: MemoryConnectionEdgeKind[];
  tags?: string[];
  type?: string;
  path?: string;
  query?: string;
  includeUnresolved?: boolean;
  includeOrphans?: boolean;
  limit?: number;
}

export interface MemoryOverviewCount {
  name: string;
  count: number;
}

export interface MemoryOverviewBucketSummary {
  bucket: string;
  count: number;
  newest?: string;
  oldest?: string;
}

export interface MemoryOverviewDocumentSummary {
  file: string;
  bucket: string;
  title?: string;
  type?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  indexed: boolean;
}

export type MemoryConnectionEdgeKind = "markdown-link" | "wiki-link";

export interface MemoryConnectionEdge {
  source: string;
  target: string;
  kind: MemoryConnectionEdgeKind;
  count: number;
}

export interface MemoryConnectionHub {
  file: string;
  degree: number;
}

export interface MemoryConnectionSummary {
  nodes: number;
  edgeCount: number;
  markdownLinks: number;
  wikiLinks: number;
  unresolvedLinks: number;
  orphans: number;
  topHubs: MemoryConnectionHub[];
  edges: MemoryConnectionEdge[];
}

export type MemoryGraphNodeKind = "document" | "unresolved";

export interface MemoryGraphNode {
  id: string;
  nodeKind: MemoryGraphNodeKind;
  exists: boolean;
  indexed?: boolean;
  file?: string;
  documentId?: string;
  title: string;
  bucket?: string;
  type?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  snippet?: string;
  degree: number;
  inDegree: number;
  outDegree: number;
}

export interface MemoryGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: MemoryConnectionEdgeKind;
  count: number;
  resolved: boolean;
  rawTarget?: string;
}

export interface MemoryGraphStats {
  documents: number;
  nodes: number;
  edges: number;
  markdownLinks: number;
  wikiLinks: number;
  unresolvedLinks: number;
  orphans: number;
}

export interface MemoryGraphResult {
  root: string;
  canonical: "markdown";
  initialized: boolean;
  compatible: boolean;
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  stats: MemoryGraphStats;
  warnings: string[];
  options: Required<Pick<MemoryGraphOptions, "depth" | "includeUnresolved" | "includeOrphans" | "limit">> & Omit<MemoryGraphOptions, "depth" | "includeUnresolved" | "includeOrphans" | "limit">;
}

export interface MemoryOverviewIndexState {
  present: boolean;
  stale: boolean;
  indexedDocuments: number;
  generatedAt?: string;
  qmdCollection?: string;
  unindexedDocuments: number;
}

export interface MemoryOverviewResult {
  root: string;
  canonical: "markdown";
  initialized: boolean;
  compatible: boolean;
  configFile?: string;
  schemaVersion?: number;
  documents: number;
  buckets: MemoryOverviewBucketSummary[];
  types: MemoryOverviewCount[];
  tags: MemoryOverviewCount[];
  newest?: string;
  oldest?: string;
  files?: MemoryOverviewDocumentSummary[];
  index: MemoryOverviewIndexState;
  warnings: string[];
  connections?: MemoryConnectionSummary;
}

export type MemoryNoteType = "note" | "session" | "finding" | "decision" | "preference" | "page";

export type MemoryConfidence = "user-reviewed" | "agent-drafted";

export type MemoryReviewStatus = "user-review-recommended";

export interface MemoryNoteDraft {
  dream?: boolean;
  type: string;
  title: string;
  body: string;
  tags?: string[];
}

export interface MemoryWriteResult {
  id: string;
  file: string;
}

export type ProcessMode = "lint" | "synthesize" | "ensure-ids";

export interface ProcessMemoryOptions {
  mode: ProcessMode | string;
  apply?: boolean;
  topic?: string;
  since?: string;
  limit?: number;
  /** Optional prior destination hash; a mismatch (including a missing page) refuses synthesis. */
  ifMatch?: MemoryDocumentContentHash | string;
}

export type ProcessingLintIssueCode =
  | "PAGE_SOURCES_ABSENT" | "PAGE_SOURCE_BROKEN" | "PAGE_CONTEXT_ONLY"
  | "PAGE_MAY_BE_STALE" | "POSSIBLE_DUPLICATE" | "DECLARED_CONFLICT"
  | "CONFLICT_TARGET_MISSING" | "QUESTION_ANSWER_CANDIDATE";

export interface ProcessingLintEvidence {
  file: string;
  text: string;
  lineStart?: number;
  lineEnd?: number;
  target?: string;
  matchedTokens?: string[];
}

export interface ProcessingLintIssue {
  code: ProcessingLintIssueCode;
  severity: "info" | "warning";
  file: string;
  message: string;
  rationale: string;
  evidence: ProcessingLintEvidence[];
}

export interface ProcessingLintScope {
  total: number;
  eligible: number;
  inspected: number;
  candidateDocuments: number;
  limit: number;
  topic?: string;
  since?: string;
  sinceTime?: string;
}

export interface ProcessMemoryResult {
  root: string;
  mode: ProcessMode;
  applied: boolean;
  topic?: string;
  files: string[];
  summary: string[];
  modifiedCount?: number;
  runId?: string;
  issueCount?: number;
  issues?: ProcessingLintIssue[];
  scope?: ProcessingLintScope;
}

export type MemoryDocumentTargetKind = "local" | "remote";

export interface MemoryDocumentTargetMetadata {
  /** Local CLI/runtime results may use an established local root; remote results must use a safe sentinel such as remote:all. */
  root: string;
  target: MemoryDocumentTargetKind;
  /** Remote V1 uses the single shared memory namespace named all. */
  memory?: "all";
}

export type MemoryDocumentContentHash = `sha256:${string}`;

export interface MemoryDocumentReadResult extends MemoryDocumentTargetMetadata {
  id: string;
  file: string;
  type: MemoryNoteType;
  title: string;
  frontmatter: Frontmatter;
  /** Exact Markdown document content as stored on disk, including frontmatter and body. */
  content: string;
  /** sha256 hash over the exact current Markdown file bytes. */
  contentHash: MemoryDocumentContentHash;
}

export interface MemoryDocumentIndexState {
  stale?: boolean;
  indexed?: boolean;
  lastIndexedAt?: string;
  documents?: number;
  qmdCollection?: string;
}

export interface MemoryDocumentUpdateResult extends MemoryDocumentTargetMetadata {
  id: string;
  file: string;
  oldContentHash: MemoryDocumentContentHash;
  newContentHash: MemoryDocumentContentHash;
  updatedAt: string;
  /** True when the search index was refreshed synchronously; false when the index was left stale or not run. */
  indexed: boolean;
  index?: MemoryDocumentIndexState;
}

export interface DreamCursor {
  mtimeMs: number;
  mtime: string;
  file: string;
}

export interface DreamLimits {
  maxFiles: number;
  bytesPerFile: number;
  maxTotalBytes: number;
}

export type DreamBatchStatus = "open" | "completed" | "abandoned";

export interface DreamBatchSummary {
  batchId: string;
  status: DreamBatchStatus;
  fileCount: number;
  hasMore: boolean;
  createdAt: string;
  expiresAt: string;
  fromCursor?: DreamCursor;
  toCursor?: DreamCursor;
  completedAt?: string;
  abandonedAt?: string;
  summary?: string;
}

export interface DreamStatus extends MemoryDocumentTargetMetadata {
  available: boolean;
  openBatch?: DreamBatchSummary;
  lastCompletedCursor?: DreamCursor;
  lastCompletedBatch?: DreamBatchSummary;
  lastCompletedAt?: string;
  defaults: DreamLimits & { lookbackHours: number };
  caps: DreamLimits;
  warnings: string[];
}

export interface DreamBatchFileMetadata {
  id: string;
  file: string;
  type: MemoryNoteType;
  title: string;
  frontmatter: Frontmatter;
  contentHash: MemoryDocumentContentHash;
  byteLength: number;
  mtime: string;
  mtimeMs: number;
  updatedAt?: string;
}

export interface DreamFileContext extends DreamBatchFileMetadata {
  root: string;
  content: string;
  truncated: boolean;
}

export interface DreamBatch extends MemoryDocumentTargetMetadata {
  batchId: string;
  status: DreamBatchStatus;
  fromCursor?: DreamCursor;
  toCursor?: DreamCursor;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  abandonedAt?: string;
  summary?: string;
  files: DreamFileContext[];
  hasMore: boolean;
  resumed?: boolean;
  instructions: string[];
  limits: DreamLimits;
  warnings: string[];
}

export interface DreamCreateRequest {
  maxFiles?: number;
  bytesPerFile?: number;
  maxTotalBytes?: number;
  force?: boolean;
}

export interface DreamCompleteRequest {
  batchId: string;
  summary?: string;
  updatedDocumentIds?: string[];
  skippedDocumentIds?: string[];
  operatorNotes?: string;
}

export interface DreamCompleteResult extends MemoryDocumentTargetMetadata {
  batchId: string;
  status: "completed";
  advancedCursor?: DreamCursor;
  lastCompletedAt: string;
  summary?: string;
  updatedDocumentIds: string[];
  skippedDocumentIds: string[];
  warnings: string[];
}

export interface DreamAbandonResult extends MemoryDocumentTargetMetadata {
  batchId: string;
  status: "abandoned";
  abandonedAt: string;
  summary?: string;
  warnings: string[];
}

export interface DreamBatchMetadata extends MemoryDocumentTargetMetadata {
  version: 1;
  batchId: string;
  status: DreamBatchStatus;
  fromCursor?: DreamCursor;
  toCursor?: DreamCursor;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  abandonedAt?: string;
  summary?: string;
  files: DreamBatchFileMetadata[];
  hasMore: boolean;
  limits: DreamLimits;
  updatedDocumentIds?: string[];
  skippedDocumentIds?: string[];
  operatorNotes?: string;
  warnings: string[];
}

export interface DreamState {
  version: 1;
  openBatch?: DreamBatchSummary;
  lastCompletedCursor?: DreamCursor;
  /** Per-file completion high-water marks keep edited completed files out of later batches without skipping overflow files. */
  completedFileCursors?: Record<string, DreamCursor>;
  lastCompletedBatch?: DreamBatchSummary;
  lastCompletedAt?: string;
  updatedAt?: string;
}

export interface DreamApplyManifest {
  version: 1;
  batchId: string;
  summary?: string;
  updates: Array<{
    id: string;
    ifMatch: MemoryDocumentContentHash | string;
    contentFile: string;
  }>;
  skippedDocumentIds?: string[];
}

export type MemoryDocumentEditErrorCode =
  | "invalid_id"
  | "missing_id"
  | "duplicate_id"
  | "duplicate_title"
  | "precondition_required"
  | "precondition_failed"
  | "validation_failed"
  | "unsupported_body"
  | "unsupported_media_type"
  | "auth_required"
  | "update_failed";

export interface MemoryDocumentEditError {
  code: MemoryDocumentEditErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface IndexedDocument {
  absolutePath: string;
  relativePath: string;
  frontmatter: Frontmatter;
  bodyStartLine: number;
}

export interface IndexManifest {
  version: 1;
  root: string;
  sourceRoot?: string;
  generatedAt: string;
  qmdCollection: string;
  documents: IndexedDocument[];
}

export interface MemoryRootConfig {
  schemaVersion: number;
  canonical: "markdown";
  derivedDir: ".jumpybrain";
  memoryDirs: string[];
  indexRoot?: string;
  indexing?: IndexingPolicy;
  createdAt: string;
  createdBy: {
    package: string;
    version: string;
  };
}

export interface MemoryRootInitResult {
  root: string;
  configFile: string;
  schemaVersion: number;
  configCreated: boolean;
  memoryDirs: string[];
  gitignoreUpdated: boolean;
}

export interface MemoryRootStatus {
  readiness?: RetrievalReadiness;
  root: string;
  initialized: boolean;
  compatible: boolean;
  configFile?: string;
  schemaVersion?: number;
  message?: string;
}


/** Stateless UTC calendar-window request; no completion or coverage state is recorded. */
export interface DreamWindowRequest {
  from?: string;
  days?: number;
  dateBasis?: "evidence" | "modified";
  offset?: number;
  maxFiles?: number;
  bytesPerFile?: number;
  maxTotalBytes?: number;
}

export interface DreamWindowRange {
  /** Oldest inclusive calendar day, YYYY-MM-DD. */
  from: string;
  /** Anchor inclusive calendar day, YYYY-MM-DD. */
  to: string;
  timezone: "UTC";
  dateBasis: "evidence" | "modified";
}

export type DreamWindowFileDateBasis = "date" | "filename" | "created_at" | "createdAt" | "mtime" | "modified";
/** Provenance confidence, not a probability or verification of the event date. */
export type DreamWindowDateConfidence = "declared" | "filename" | "fallback" | "modified";

export interface DreamWindowDiagnostics {
  /** Successfully read non-dream files, including files outside the requested window. */
  scannedFiles: number;
  unreadableFiles: number;
  /** Creation/mtime dates only; not declared dates or recognized journal filenames. */
  fallbackFiles: number;
  outsideWindowFallbackFiles: number;
  /** Files with date diagnostics (including journal-filename fallback), not warning count. */
  dateDiagnosticFiles: number;
  outsideWindowDateDiagnosticFiles: number;
  /** Matching files consumed by this page but omitted after a concurrent change/read failure. */
  omittedFiles: number;
  truncatedFiles: number;
  metadataOmittedFiles: number;
  omittedWarnings: number;
  truncatedWarnings: number;
}

export interface DreamWindowFileContext {
  root: string;
  /** Missing IDs are allowed for read-only evidence, not silently assigned. */
  id?: string;
  file: string;
  type: MemoryNoteType;
  title: string;
  frontmatter: Frontmatter;
  content: string;
  /** Hash of the complete original file, even when content is truncated. */
  contentHash: MemoryDocumentContentHash;
  byteLength: number;
  returnedBytes: number;
  truncated: boolean;
  date: string;
  dateBasis: DreamWindowFileDateBasis;
  dateConfidence: DreamWindowDateConfidence;
  mtime: string;
}

export interface DreamWindow extends MemoryDocumentTargetMetadata {
  window: DreamWindowRange;
  files: DreamWindowFileContext[];
  hasMore: boolean;
  /** Continue with this offset and the same resolved anchor/window; edits can shift offsets. */
  nextOffset?: number;
  offset: number;
  /** Matching primary evidence files in this scan, not proof of complete review. */
  totalFiles: number;
  limits: DreamLimits;
  diagnostics: DreamWindowDiagnostics;
  warnings: string[];
  instructions: string[];
}
