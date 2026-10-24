import { ATTRIBUTION_KEYS, stampMemoryActor } from "./contribution.js";
import { parseFrontmatter } from "./frontmatter.js";
import type { Frontmatter, FrontmatterValue, MemoryActor } from "../types.js";

export const PROTECTED_MEMORY_DOCUMENT_FRONTMATTER_KEYS = [
  "creator_kind", "creator_id", "creator_name",
  "id",
  "type",
  "created_at",
  "source",
  "confidence",
  "review",
  "session_id",
  "sessionId",
  "recall_topic",
  "topic",
] as const;

export interface MergeMemoryDocumentUpdateOptions {
  updatedAt?: string;
  actor?: MemoryActor;
}

export interface MergeMemoryDocumentUpdateResult {
  content: string;
  updatedAt: string;
  frontmatter: Frontmatter;
}

export function mergeMemoryDocumentUpdate(
  existingContent: string,
  submittedContent: string,
  options: MergeMemoryDocumentUpdateOptions = {},
): MergeMemoryDocumentUpdateResult {
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const existing = parseFrontmatter(existingContent);
  const submitted = parseFrontmatter(submittedContent);

  const merged = new Map<string, FrontmatterValue>();
  for (const [key, value] of Object.entries(submitted.frontmatter)) {
    if (!(ATTRIBUTION_KEYS as readonly string[]).includes(key)) merged.set(key, value);
  }

  for (const key of PROTECTED_MEMORY_DOCUMENT_FRONTMATTER_KEYS) {
    if (Object.hasOwn(existing.frontmatter, key)) {
      merged.set(key, existing.frontmatter[key]!);
    }
  }
  // Body-only edits retain evidence dates and dream classification. These are
  // editable metadata: an explicitly submitted value still replaces the old one.
  for (const key of ["dream", "date", "attention_at"]) {
    if (!merged.has(key) && Object.hasOwn(existing.frontmatter, key)) {
      merged.set(key, existing.frontmatter[key]!);
    }
  }
  merged.set("updated_at", updatedAt);

  const content = stampMemoryActor(renderMergedMarkdownDocument([...merged.entries()], submitted.body, submitted.lineEnding), options.actor);
  const frontmatter = parseFrontmatter(content).frontmatter;
  return {
    content,
    updatedAt,
    frontmatter,
  };
}

function renderMergedMarkdownDocument(frontmatter: [string, FrontmatterValue][], body: string, lineEnding: string): string {
  const lines = [
    "---",
    ...frontmatter.map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
  ];
  return `${lines.join(lineEnding)}${lineEnding}${body}`;
}
