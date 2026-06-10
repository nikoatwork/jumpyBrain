export type FrontmatterValue = string | number | boolean | string[];

export type Frontmatter = Record<string, FrontmatterValue>;

export interface MarkdownDocument {
  absolutePath: string;
  relativePath: string;
  content: string;
  frontmatter: Frontmatter;
  body: string;
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

export interface SearchOptions {
  limit: number;
  json?: boolean;
  mode?: "search" | "recall";
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
