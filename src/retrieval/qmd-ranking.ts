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
  const tokens = new Set(tokenize(query));
  const wantsRecent = ["recent", "latest", "newest", "after"].some((token) => tokens.has(token));
  const wantsOld = ["oldest", "first", "earliest", "before"].some((token) => tokens.has(token));
  if (!wantsRecent && !wantsOld) return 0;
  if (stats.max === stats.min) return 0.05;
  const recency = (time - stats.min) / (stats.max - stats.min);
  const directional = wantsOld ? 1 - recency : recency;
  return Math.max(0, Math.min(0.12, directional * 0.12));
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

function documentTime(metadata: Record<string, unknown>): number | undefined {
  const value = metadata.updated_at ?? metadata.created_at ?? metadata.date;
  if (!value) return undefined;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : undefined;
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

export function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
