import { parseFrontmatter } from "./frontmatter.js";
import type { Frontmatter, FrontmatterValue } from "../types.js";

export const PROTECTED_MEMORY_DOCUMENT_FRONTMATTER_KEYS = [
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
    merged.set(key, value);
  }

  for (const key of PROTECTED_MEMORY_DOCUMENT_FRONTMATTER_KEYS) {
    if (Object.hasOwn(existing.frontmatter, key)) {
      merged.set(key, existing.frontmatter[key]!);
    }
  }
  merged.set("updated_at", updatedAt);

  const frontmatter: Frontmatter = Object.fromEntries(merged.entries());
  return {
    content: renderMergedMarkdownDocument([...merged.entries()], submitted.body, submitted.lineEnding),
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
