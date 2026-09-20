import type { IndexedDocument, RetrievalDepth } from "../../types.js";

export const RETRIEVAL_DEPTHS = ["shallow", "normal", "deep"] as const satisfies readonly RetrievalDepth[];

export interface DepthPolicyDecision {
  depth: RetrievalDepth;
  bucket: string;
  boost: number;
}

export function normalizeRetrievalDepth(value: string | undefined): RetrievalDepth {
  if (!value) return "normal";
  if (isRetrievalDepth(value)) return value;
  throw new Error(`Invalid --depth '${value}'. Use one of: ${RETRIEVAL_DEPTHS.join(", ")}.`);
}

export function isRetrievalDepth(value: string): value is RetrievalDepth {
  return (RETRIEVAL_DEPTHS as readonly string[]).includes(value);
}

export function depthPolicyFor(document: IndexedDocument, depth: RetrievalDepth): DepthPolicyDecision {
  const bucket = documentBucket(document);
  return { depth, bucket, boost: depthBoost(bucket, depth) };
}

function depthBoost(bucket: string, depth: RetrievalDepth): number {
  if (depth === "shallow") {
    if (bucket === "page") return 0.8;
    if (bucket === "decision") return 0.45;
    if (bucket === "preference") return 0.25;
    if (bucket === "finding") return 0.22;
    if (bucket === "session") return -0.35;
    return -0.08;
  }

  if (depth === "deep") {
    if (bucket === "session") return 0.04;
    if (bucket === "page") return 0.02;
    return 0;
  }

  if (bucket === "page") return 0.1;
  if (bucket === "decision") return 0.08;
  if (bucket === "preference" || bucket === "finding") return 0.04;
  if (bucket === "session") return -0.04;
  return 0;
}

function documentBucket(document: IndexedDocument): string {
  const type = String(document.frontmatter.type ?? "").toLowerCase();
  if (type) return type;

  const path = document.relativePath.toLowerCase();
  const firstSegment = path.split("/")[0] ?? "";
  if (firstSegment === "pages") return "page";
  if (firstSegment === "decisions") return "decision";
  if (firstSegment === "preferences") return "preference";
  if (firstSegment === "findings") return "finding";
  if (firstSegment === "sessions") return "session";
  if (firstSegment === "notes") return "note";
  return firstSegment || "unknown";
}

/** Only a parsed YAML boolean activates dreaming; links and quoted scalars do not. */
export function isDreamDocument(document: { frontmatter: Record<string, unknown> }): boolean {
  return document.frontmatter.dream === true;
}

/** Explicit evidence/detail requests should not be displaced by maps-first policy. */
export function isSourceFocusedQuery(query: string): boolean {
  return /\b(?:source|sources|raw|original|verbatim|exact|quote|quoted|historical|history|journal|journals|session|sessions)\b|\b(?:19|20)\d{2}\b|["“][^"”]+["”]|\b[\w./-]+\.md\b/i.test(query);
}

/**
 * The dream preference is a target TOTAL depth preference, not another full page
 * bonus. Relevance (0..1) gates the incremental contribution; deep adds none.
 */
export function dreamBoostFor(document: IndexedDocument, depth: RetrievalDepth, query: string, relevance: number): number {
  if (!isDreamDocument(document) || depth === "deep" || isSourceFocusedQuery(query)) return 0;
  if (!Number.isFinite(relevance) || relevance <= 0) return 0;
  const target = depth === "shallow" ? 1 : 0.55;
  return Math.max(0, target - depthPolicyFor(document, depth).boost) * Math.min(1, relevance);
}
