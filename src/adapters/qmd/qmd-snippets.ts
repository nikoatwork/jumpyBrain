import { open } from "node:fs/promises";
import type { IndexedDocument } from "../../types.js";
import { selectEvidenceExcerpt } from "../../core/retrieval-policy/excerpts.js";
import { expandedQueryTerms, queryTermWeight, salientAdjacentQueries } from "./qmd-query.js";

export interface SnippetRepair {
  lineStart: number;
  lineEnd: number;
  snippet: string;
}

export function cleanQmdSnippet(snippet: string): string {
  return snippet
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("@@ "))
    .join("\n")
    .trim();
}

export async function snippetFromOriginalBody(document: IndexedDocument, query: string): Promise<SnippetRepair> {
  const { lines, truncated } = await boundedOriginalLines(document.absolutePath);
  const bodyIndex = Math.max(0, document.bodyStartLine - 1);
  if (bodyIndex >= lines.length) return { lineStart: document.bodyStartLine, lineEnd: document.bodyStartLine, snippet: "" };
  return selectCanonicalExcerpt(lines, truncated, document.bodyStartLine, document.bodyStartLine, lines.length, query);
}

export async function neighborSnippetFromOriginal(document: IndexedDocument, lineStart: number, lineEnd: number | undefined, query = ""): Promise<SnippetRepair> {
  const { lines, truncated } = await boundedOriginalLines(document.absolutePath);
  if (lineStart > lines.length || (truncated && (lineEnd ?? lineStart) > lines.length)) {
    return { lineStart, lineEnd: lineEnd ?? lineStart, snippet: "" };
  }
  return selectCanonicalExcerpt(lines, truncated, document.bodyStartLine, lineStart, lineEnd ?? lineStart, query);
}

function selectCanonicalExcerpt(lines: string[], truncated: boolean, bodyStartLine: number, lineStart: number, lineEnd: number, query: string): SnippetRepair {
  const options = { bodyStartLine, lineStart, lineEnd, terms: excerptTerms(query) };
  const result = selectEvidenceExcerpt(lines, options);
  // A prefix's final section is not necessarily the canonical section's end.
  if (truncated && result.lineEnd >= lines.length) {
    const marker = " [source continues beyond read bound; expand source]";
    const bounded = selectEvidenceExcerpt(lines, { ...options, maxChars: 1000 - marker.length });
    return { ...bounded, snippet: bounded.snippet + marker };
  }
  return result;
}

function excerptTerms(query: string): Array<{ text: string; weight: number }> {
  return [...expandedQueryTerms(query).map((text) => ({ text, weight: queryTermWeight(text) })),
    ...salientAdjacentQueries(query).slice(0, 8).map((text) => ({ text, weight: 4 }))];
}

/** Beyond the canonical read bound, retain backend evidence rather than reading the full file. */
export function excerptFromQmdWindow(snippet: string, lineStart: number, query: string): SnippetRepair {
  // Do not trim leading blank lines: they are part of QMD's source coordinates.
  const lines = snippet.split(/\r?\n/);
  // Only the first line is a backend envelope. Later @@ lines may be real diff
  // content and must retain both their text and source coordinates.
  if (/^@@\s+-\d+,\d+\s+@@/.test(lines[0] ?? "")) lines.shift();
  const result = selectEvidenceExcerpt(lines, { bodyStartLine: 1, lineStart: 1, lineEnd: lines.length, terms: excerptTerms(query) });
  return { ...result, lineStart: lineStart + result.lineStart - 1, lineEnd: lineStart + result.lineEnd - 1 };
}

export function looksLikeUnhelpfulSnippet(snippet: string): boolean {
  const trimmed = snippet.trim();
  if (!trimmed) return true;
  if (looksLikeFrontmatterOnly(trimmed)) return true;
  if (/##\s+Assistant\s*$/.test(trimmed)) return true;

  const withoutHeadings = trimmed
    .split(/\s*#{1,6}\s+[A-Za-z][^#]*?/)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutHeadings.length === 0;
}

function looksLikeFrontmatterOnly(snippet: string): boolean {
  return /(^|\s)(source|question_id|session_id|date|question_type):\s/.test(snippet) && !/\b(User|Assistant|Note)\b/i.test(snippet);
}

// Repair is best-effort, not an unbounded full-document read. QMD's own snippet
// remains usable for hits beyond this prefix; callers can explicitly expand it.
async function boundedOriginalLines(file: string): Promise<{ lines: string[]; truncated: boolean }> {
  const maximumBytes = 128 * 1024;
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(maximumBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const lines = buffer.subarray(0, Math.min(bytesRead, maximumBytes)).toString("utf8").split(/\r?\n/);
    if (bytesRead > maximumBytes) lines.pop(); // Never quote a partial trailing line.
    return { lines, truncated: bytesRead > maximumBytes };
  } finally {
    await handle.close();
  }
}
