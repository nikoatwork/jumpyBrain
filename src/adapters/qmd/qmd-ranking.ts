import { isDreamDocument } from "../../core/retrieval-policy/index.js";
import type { IndexedDocument, RetrievalDepth, SearchResult } from "../../types.js";
import { tokenize } from "./qmd-query.js";

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

export function temporalBoostFor(query: string, metadata: Record<string, unknown>, stats: { min: number; max: number } | undefined): number {
  const time = documentTime(metadata);
  if (!stats || time === undefined) return 0;

  const intent = temporalIntent(query);
  const recency = stats.max === stats.min ? 0.5 : (time - stats.min) / (stats.max - stats.min);

  if (intent.anchorDirection === "after") {
    if (time <= intent.anchorTime) return 0;
    return boundedTemporalBoost(0.06 + recency * 0.06);
  }

  if (intent.anchorDirection === "before") {
    if (time >= intent.anchorTime) return 0;
    return boundedTemporalBoost(0.06 + (1 - recency) * 0.06);
  }

  // Deferred intentionally: relative anchors such as "after the refactor", cross-root
  // filtering, timelines, and session/file diversity. This layer only reranks the
  // QMD-matched candidate set with small deterministic boosts.
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
  // Prefer an explicit event/session date when present; note and wrapup memories that
  // only have write timestamps still order by updated_at/created_at.
  // A newly synthesized map is not new evidence. Without an explicit evidence
  // date it has no temporal ranking signal (including in candidate date stats).
  const value = metadata.dream === true ? metadata.date : metadata.date ?? metadata.updated_at ?? metadata.created_at;
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

  if (!/^\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}/i.test(text)) return undefined;
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
 * Keep one chunk per map in everyday context, and omit near-verbatim echoes only
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
      if (!nearIdentical(result.snippet, other.snippet)) return false;
      if (dream && otherDream) return true;
      // A new code, number, name, or detail in raw evidence is enough to keep it.
      // Only omit a source echo if it contributes no new tokens to the map.
      const rawWords = diversityTokens(dream ? other.snippet : result.snippet);
      const mapWords = diversityTokens(dream ? result.snippet : other.snippet);
      return [...rawWords].every((word) => mapWords.has(word));
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
