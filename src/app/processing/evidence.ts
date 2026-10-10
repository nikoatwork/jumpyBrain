import type { MarkdownDocument } from "../../types.js";
import { selectEvidenceExcerpt } from "../../core/retrieval-policy/excerpts.js";
import { isDreamDocument } from "../../core/retrieval-policy/index.js";

export interface SourceDocument extends MarkdownDocument { content: string; body: string }

// Deliberately conservative: common question/function words cannot establish evidence.
const STOPWORDS = new Set("a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may might more most must no not of on or our should so than that the their them then there these they this those to was we were what when where which who why will with would you your about after before use used using answer answered decided decision resolved closed".split(" "));
export function tokens(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
}
export function distinctiveTokens(text: string): string[] {
  return tokens(text).filter(token => token.length >= 3 && !STOPWORDS.has(token));
}
export function topicMatches(document: SourceDocument, terms: string[]): boolean {
  const words = new Set(tokens([document.relativePath, ...Object.values(document.frontmatter).flat().map(String), document.body].join(" ")));
  return terms.every(term => words.has(term));
}
export function isPage(document: SourceDocument): boolean {
  return document.relativePath.startsWith("pages/") || String(document.frontmatter.type ?? "").toLowerCase() === "page";
}
export function isPrimarySource(document: SourceDocument): boolean {
  return !isPage(document) && !isDreamDocument(document);
}
export function headingTitle(body: string): string | undefined {
  return body.split(/\r?\n/).find(line => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim();
}
export function sourceExcerpt(source: SourceDocument, topic: string) {
  const lines = source.content.split(/\r?\n/);
  const bodyLines = source.body.split(/\r?\n/);
  const bodyStartLine = lines.length - bodyLines.length + 1;
  const terms = distinctiveTokens(topic);
  // Metadata/title-only hits are not topical understanding. Abstain without a body passage.
  if (!bodyLines.some(line => !/^\s*#/.test(line) && terms.some(term => tokens(line).includes(term)))) return undefined;
  return selectEvidenceExcerpt(lines, {
    bodyStartLine, lineStart: bodyStartLine, lineEnd: lines.length,
    terms: terms.map(text => ({ text, weight: 1 })), maxChars: 1000,
  });
}

export interface Paragraph { text: string; lineStart: number; lineEnd: number }
/** Keep whole paragraph boundaries, including oversized caveats. Callers bound returned evidence. */
export function evidenceParagraphs(source: SourceDocument): Paragraph[] {
  const lines = source.content.split(/\r?\n/);
  const start = lines.length - source.body.split(/\r?\n/).length;
  const result: Paragraph[] = [];
  let blockStart = start;
  let fence: string | undefined;
  const flush = (end: number) => {
    const text = lines.slice(blockStart, end).join("\n").trim();
    if (text) result.push({ text, lineStart: blockStart + 1, lineEnd: end });
  };
  for (let i = start; i <= lines.length; i++) {
    const line = lines[i] ?? "";
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) { if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined; blockStart = i + 1; continue; }
    if (marker || !line.trim() || /^\s*#/.test(line)) {
      flush(i); blockStart = i + 1; if (marker) fence = marker;
    }
  }
  return result;
}

export const ANSWER_CUE = /\b(?:answer(?:ed)?|decid(?:ed|ing)|decision|resolved|resolution|concluded)\b/i;
// Negative/status caveats must not turn into closure suggestions, even with lexical overlap.
export const UNRESOLVED = /\?|\b(?:unresolved|unanswered|undecided|unknown|pending|uncertain|tentative|provisional|hypothetical|awaiting|inconclusive)\b|\b(?:not|never|no|cannot|can't|couldn't|hasn't|haven't|isn't|wasn't|without)\b.{0,55}\b(?:answer|decid\w*|decision|resolv\w*|conclu\w*|confirm\w*)\b|\b(?:answer|decision|resolution)\b.{0,35}\b(?:not|unknown|pending)\b/i;
