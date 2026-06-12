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

export interface ScoreBreakdown {
  qmdScore: number;
  exactMatchBoost: number;
  metadataBoost: number;
  temporalRelevance?: number;
  memoryStrength?: number;
  provenanceConfidence?: number;
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
  results: SearchResult[];
}

export type MemoryNoteType = "note" | "session" | "finding" | "decision" | "preference";

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

export interface IndexedDocument {
  absolutePath: string;
  relativePath: string;
  frontmatter: Frontmatter;
  bodyStartLine: number;
}

export interface IndexManifest {
  version: 1;
  root: string;
  generatedAt: string;
  qmdCollection: string;
  documents: IndexedDocument[];
}
