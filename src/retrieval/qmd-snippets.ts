import { readFile } from "node:fs/promises";
import type { IndexedDocument } from "../types.js";
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
  const text = await readFile(document.absolutePath, "utf8");
  const lines = text.split(/\r?\n/);
  const bodyIndex = Math.max(0, document.bodyStartLine - 1);
  const center = bestBodyLineIndex(lines, bodyIndex, query);
  return neighborSnippetFromLines(lines, bodyIndex, center + 1, center + 1);
}

export async function neighborSnippetFromOriginal(document: IndexedDocument, lineStart: number, lineEnd: number | undefined): Promise<SnippetRepair> {
  const text = await readFile(document.absolutePath, "utf8");
  const lines = text.split(/\r?\n/);
  const bodyIndex = Math.max(0, document.bodyStartLine - 1);
  return neighborSnippetFromLines(lines, bodyIndex, lineStart, lineEnd ?? lineStart);
}

function neighborSnippetFromLines(lines: string[], bodyIndex: number, lineStart: number, lineEnd: number): SnippetRepair {
  const start = Math.max(bodyIndex, lineStart - 2);
  const end = Math.min(lines.length - 1, lineEnd + 6);
  return {
    lineStart: start + 1,
    lineEnd: end + 1,
    snippet: boundedSnippet(lines.slice(start, end + 1).join("\n")),
  };
}

function bestBodyLineIndex(lines: string[], bodyIndex: number, query: string): number {
  const terms = expandedQueryTerms(query);
  const phrases = salientAdjacentQueries(query).slice(0, 8);
  let bestIndex = bodyIndex;
  let bestScore = 0;

  for (let index = bodyIndex; index < lines.length; index += 1) {
    const line = lines[index].toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (line.includes(term)) score += queryTermWeight(term);
    }
    for (const phrase of phrases) {
      if (line.includes(phrase)) score += 4;
    }
    if (/^#{1,6}\s/.test(lines[index])) score *= 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
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

export function boundedSnippet(text: string, maxLength = 500): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}…`;
}
