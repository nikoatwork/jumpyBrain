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
}

export type RetrievalDepth = "shallow" | "normal" | "deep";

export interface ScoreBreakdown {
  qmdScore: number;
  exactMatchBoost: number;
  metadataBoost: number;
  temporalRelevance?: number;
  memoryStrength?: number;
  provenanceConfidence?: number;
  depthPolicyBoost?: number;
  retrievalDepth?: RetrievalDepth;
  finalScore: number;
  driver: string;
}

export interface SearchResult {
  id: string;
  score: number;
  snippet: string;
  provenance: Provenance;
  sessionId?: string;
  session_id?: string;
  scoreBreakdown?: ScoreBreakdown;
}

export interface IndexMemoryResult {
  root: string;
  documents: number;
  qmdCollection: string;
}

export interface SearchMemoryResult {
  root: string;
  query: string;
  depth?: RetrievalDepth;
  results: SearchResult[];
}

export interface SearchMemoryOptions {
  depth?: RetrievalDepth | string;
}

export type MemoryNoteType = "note" | "session" | "finding" | "decision" | "preference" | "page";

export type MemoryConfidence = "user-reviewed" | "agent-drafted";

export type MemoryReviewStatus = "user-review-recommended";

export interface MemoryNoteDraft {
  type: string;
  title: string;
  body: string;
  tags?: string[];
}

export interface MemoryWriteResult {
  file: string;
}

export type ProcessMode = "lint" | "synthesize";

export interface ProcessMemoryOptions {
  mode: ProcessMode | string;
  apply?: boolean;
  topic?: string;
  since?: string;
  limit?: number;
}

export interface ProcessMemoryResult {
  root: string;
  mode: ProcessMode;
  applied: boolean;
  topic?: string;
  files: string[];
  summary: string[];
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
  root: string;
  initialized: boolean;
  compatible: boolean;
  configFile?: string;
  schemaVersion?: number;
  message?: string;
}
