import path from "node:path";
import { isDreamDocument, isSourceFocusedQuery } from "../../core/retrieval-policy/index.js";
import type { IndexedDocument, RetrievalDepth, SearchResult } from "../../types.js";
import { tokenize } from "./qmd-query.js";

/** Preserve punctuation: C++ and C are different titles. Never infer a body heading. */
export function normalizeSearchTitle(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase().normalize("NFC");
}

function searchTitle(document: IndexedDocument): { title: string; fallback: boolean } {
  const title = document.frontmatter.title;
  if (typeof title === "string" && title.trim()) return { title, fallback: false };
  return { title: path.posix.basename(document.relativePath).replace(/\.md$/i, ""), fallback: true };
}

export function isExactTitleMatch(query: string, document: IndexedDocument): boolean {
  const { title, fallback } = searchTitle(document);
  const normalized = normalizeSearchTitle(query);
  if (!normalized) return false;
  if (!fallback) return normalized === normalizeSearchTitle(title);
  // Filename-only notes accept the stem, its .md spelling, and space-separated slugs.
  return normalizeSearchTitle(normalized.replace(/\.md$/i, "").replace(/[-_]+/g, " "))
    === normalizeSearchTitle(title.replace(/[-_]+/g, " "));
}

export function titleMatchBoostFor(query: string, document: IndexedDocument): number {
  // A separate navigation tier: even a supplement with QMD=0 and the shallow
  // session penalty outranks the maximum possible non-exact combined score (<3.1).
  if (isExactTitleMatch(query, document)) return 4;
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return 0;
  const words = new Set(tokenize(searchTitle(document).title));
  const coverage = terms.filter((term) => words.has(term)).length / terms.length;
  return coverage >= 0.5 ? 0.2 * coverage : 0;
}

export function exactBoost(query: string, text: string): number {
  const lower = text.toLowerCase();
  const tokens = tokenize(query);
  const rareMatches = tokens.filter((token) => token.length >= 5 && lower.includes(token)).length;
  const phraseBoost = lower.includes(query.toLowerCase()) ? 0.25 : 0;
  return Math.min(0.35, phraseBoost + rareMatches * 0.03);
}

export function metadataBoostFor(query: string, metadata: Record<string, unknown>): number {
  const haystack = Object.values(metadata).flat().join(" ").toLowerCase();
  const matches = tokenize(query).filter((token) => haystack.includes(token)).length;
  return Math.min(0.15, matches * 0.03);
}

export function temporalBoostFor(query: string, metadata: Record<string, unknown>, stats: { min: number; max: number } | undefined, relevance = 0): number {
  const time = documentTime(metadata);
  if (!stats || time === undefined) return 0;

  const intent = temporalIntent(query);
  const recency = stats.max === stats.min ? 0.5 : Math.max(0, Math.min(1, (time - stats.min) / (stats.max - stats.min)));

  if (intent.anchorDirection === "after") {
    if (time <= intent.anchorTime) return 0;
    return boundedTemporalBoost(0.06 + recency * 0.06);
  }

  if (intent.anchorDirection === "before") {
    if (time >= intent.anchorTime) return 0;
    return boundedTemporalBoost(0.06 + (1 - recency) * 0.06);
  }

  if (!intent.wantsRecent && !intent.wantsOld) {
    // Do not turn a historical, date-scoped, or unresolved relative-time query
    // into a request for new evidence. These remain ranking hints, not filters.
    if (isSourceFocusedQuery(query) || /\b(?:after|before|since|until|during|as of|past|previous|old)\b/i.test(query)) return 0;
    if (stats.max === stats.min || !Number.isFinite(relevance)) return 0;
    return 0.18 * recency * Math.max(0, Math.min(1, relevance));
  }
  if (intent.wantsRecent === intent.wantsOld) return 0;
  if (stats.max === stats.min) return 0.05;
  return boundedTemporalBoost((intent.wantsOld ? 1 - recency : recency) * 0.12);
}

export function memoryStrengthBoost(metadata: Record<string, unknown>): number {
  const type = String(metadata.type ?? metadata.question_type ?? "").toLowerCase();
  const typeBoost = ["decision", "preference", "finding", "fact"].includes(type) ? 0.05 : 0;
  return typeBoost + confidenceBoost(metadata.confidence);
}

function confidenceBoost(value: unknown): number {
  if (value === "user-reviewed") return 0.05;
  if (value === "agent-drafted") return 0.02;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(0.05, numeric * 0.05)) : 0;
}

export function provenanceConfidenceBoost(provenance: SearchResult["provenance"]): number {
  let boost = 0;
  if (provenance.file) boost += 0.02;
  if (provenance.lineStart > 0 && provenance.lineEnd >= provenance.lineStart) boost += 0.02;
  if (provenance.sessionId) boost += 0.03;
  return boost;
}

export function dateStats(documents: IndexedDocument[]): { min: number; max: number } | undefined {
  const times = documents.map((document) => documentTime(document.frontmatter)).filter((time): time is number => time !== undefined);
  if (times.length === 0) return undefined;
  return { min: Math.min(...times), max: Math.max(...times) };
}

export function documentTime(metadata: Record<string, unknown>): number | undefined {
  // Evidence date wins; otherwise creation dates ordinary notes. updated_at and
  // filesystem mtime do not date claims: metadata-only edits must not rejuvenate
  // evidence. Invalid explicit dates stay undated instead of silently falling back.
  // A synthesized map needs an explicit evidence date, never its write timestamp.
  const value = metadata.dream === true ? metadata.date : metadata.date ?? metadata.created_at;
  return parseIsoLikeTime(value);
}

function temporalIntent(query: string):
  | { wantsRecent: boolean; wantsOld: boolean; anchorDirection?: undefined; anchorTime?: undefined }
  | { wantsRecent: boolean; wantsOld: boolean; anchorDirection: "after" | "before"; anchorTime: number } {
  const anchor = explicitDateAnchor(query);
  if (anchor) return { wantsRecent: false, wantsOld: false, anchorDirection: anchor.direction, anchorTime: anchor.time };

  const lower = query.toLowerCase();
  const wantsRecent = ["recent", "latest", "newest", "newer", "later", "last"].some((cue) => hasCue(lower, cue));
  const wantsOld = ["oldest", "first", "earliest", "older", "earlier", "initial", "original"].some((cue) => hasCue(lower, cue));
  return { wantsRecent, wantsOld };
}

function explicitDateAnchor(query: string): { direction: "after" | "before"; time: number } | undefined {
  const match = query.match(/\b(after|before)\s+(\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:z|[+-]\d{2}:?\d{2})?)?)\b/i);
  if (!match) return undefined;
  const time = parseIsoLikeTime(match[2]);
  return time === undefined ? undefined : { direction: match[1].toLowerCase() as "after" | "before", time };
}

function parseIsoLikeTime(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const time = Date.UTC(year, month - 1, day);
    const normalized = new Date(time);
    return normalized.getUTCFullYear() === year && normalized.getUTCMonth() === month - 1 && normalized.getUTCDate() === day ? time : undefined;
  }

  const timestamp = /^(\d{4}-\d{2}-\d{2})[t ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:z|[+-]\d{2}:?\d{2})?$/i.exec(text);
  if (!timestamp || parseIsoLikeTime(timestamp[1]) === undefined
    || Number(timestamp[2]) > 23 || Number(timestamp[3]) > 59 || Number(timestamp[4] ?? 0) > 59) return undefined;
  const normalizedText = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text.replace(" ", "T")}Z`;
  const time = Date.parse(normalizedText);
  return Number.isFinite(time) ? time : undefined;
}

function hasCue(lowerQuery: string, cue: string): boolean {
  return new RegExp(`\\b${cue}\\b`, "i").test(lowerQuery);
}

function boundedTemporalBoost(value: number): number {
  return Math.max(0, Math.min(0.12, value));
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

export function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Require real lexical overlap as well as QMD relevance before preferring maps. */
export function dreamRelevance(query: string, snippet: string, metadata: Record<string, unknown>, qmdScore: number): number {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || qmdScore < 0.15) return 0;
  const words = new Set(tokenize(`${metadata.title ?? ""} ${snippet}`));
  const coverage = terms.filter((term) => words.has(term)).length / terms.length;
  return coverage < 0.5 ? 0 : coverage * Math.min(1, qmdScore / 0.5);
}

/**
 * Ranked canonical files, not chunks, consume ordinary result slots. Keep the
 * best hit's score/identity and at most two source excerpts (primary + one extra).
 * Collapse redundant overlapping windows by selecting an existing excerpt,
 * never by joining text or widening its citation over unread intervening lines.
 * Deep/source-focused callers retain the original chunk contract.
 */
export function groupResultsByFile(results: SearchResult[], depth: RetrievalDepth): SearchResult[] {
  if (depth === "deep") return results;
  const files = new Map<string, SearchResult[]>();
  for (const result of results) {
    const group = files.get(result.provenance.file);
    if (group) group.push(result);
    else files.set(result.provenance.file, [result]);
  }
  return [...files.values()].map((hits) => {
    const distinct: SearchResult[] = [];
    for (const hit of hits) {
      const representative = [...distinct.filter((other) => redundantPassages(hit, other)), hit]
        .sort((a, b) => passageText(b.snippet).length - passageText(a.snippet).length)[0];
      const redundant = distinct.flatMap((other, index) => redundantPassages(representative, other) ? [index] : []);
      if (!redundant.length) distinct.push(representative);
      else {
        // A containing excerpt can retain a qualification omitted by shorter
        // windows, including a single wider excerpt subsuming two earlier hits.
        distinct[redundant[0]] = representative;
        for (const index of redundant.slice(1).reverse()) distinct.splice(index, 1);
      }
    }
    const primary = distinct[0];
    return {
      ...hits[0],
      snippet: primary.snippet,
      provenance: primary.provenance,
      ...(distinct.length > 1 ? { passages: [{ snippet: distinct[1].snippet, provenance: distinct[1].provenance }] } : {}),
      ...(distinct.length > 2 ? { omittedPassages: distinct.length - 2 } : {}),
    };
  });
}

function passageText(snippet: string): string {
  // Only presentation whitespace and a trailing truncation marker are ignored;
  // numbers, punctuation, and negations must not disappear during deduplication.
  return snippet.trim().replace(/(?:\.\.\.|…)$/, "").replace(/\s+/gu, " ").trim();
}

function redundantPassages(left: SearchResult, right: SearchResult): boolean {
  const a = left.provenance;
  const b = right.provenance;
  if (a.lineStart > b.lineEnd || b.lineStart > a.lineEnd) return false;
  const leftText = passageText(left.snippet);
  const rightText = passageText(right.snippet);
  // Range overlap alone is insufficient: long/truncated lines or partially
  // overlapping windows can contain different evidence, including negations.
  return leftText === rightText || Boolean(leftText && rightText
    && (leftText.includes(rightText) || rightText.includes(leftText)));
}

/**
 * Keep one result per map in everyday context, and omit near-verbatim echoes only
 * when a map is involved. Merely citing a source never suppresses that source.
 * Deep retrieval retains distinct chunks, including raw details from one file.
 */
export function diversifyResults(results: SearchResult[], depth: RetrievalDepth): SearchResult[] {
  if (depth === "deep") return results;
  const selected: SearchResult[] = [];
  const mapFiles = new Set<string>();
  for (const result of results) {
    const dream = isDreamDocument({ frontmatter: result.provenance.metadata ?? {} });
    if (dream && mapFiles.has(result.provenance.file)) continue;
    if (selected.some((other) => {
      const otherDream = other.provenance.metadata?.dream === true;
      if (!dream && !otherDream) return false;
      // A grouped hit is an echo only when *every* retained passage is an
      // echo. Unknown omitted evidence also prevents cross-file suppression.
      if (result.omittedPassages || other.omittedPassages) return false;
      const incoming = [result, ...(result.passages ?? [])];
      const existing = [other, ...(other.passages ?? [])];
      return incoming.every((passage) => existing.some((kept) => {
        if (!nearIdentical(passage.snippet, kept.snippet)) return false;
        // Token similarity is only a gate, never proof that evidence is
        // redundant. Preserve new qualifications in maps as well as raw notes,
        // even when negation moves without changing the token set.
        const incomingText = passageText(passage.snippet);
        return Boolean(incomingText && passageText(kept.snippet).includes(incomingText));
      }));
    })) continue;
    selected.push(result);
    if (dream) mapFiles.add(result.provenance.file);
  }
  return selected;
}

function nearIdentical(left: string, right: string): boolean {
  const a = diversityTokens(left);
  const b = diversityTokens(right);
  // Short phrases and shared headings are not sufficient evidence of duplication.
  if (Math.min(a.size, b.size) < 8) return false;
  const overlap = [...a].filter((term) => b.has(term)).length;
  return overlap / (a.size + b.size - overlap) >= 0.85;
}

function diversityTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9._/-]*/g) ?? []);
}
