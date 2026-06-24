import type { IndexedDocument, SearchResult } from "../types.js";
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
  const value = metadata.date ?? metadata.updated_at ?? metadata.created_at;
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
