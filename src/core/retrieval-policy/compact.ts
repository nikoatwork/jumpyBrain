import type { ExecutionOptions, EvidenceDate, TemporalQuery, TemporalRetrieval, Frontmatter, MemoryDocumentContentHash, RetrievalDepth, RetrievalOutcome, RetrievalReadiness, ScoreBreakdown } from "../../types.js";
import { packetFits, PacketBudgetError, serializeBudgetedPacket, validatePacketMaxBytes } from "../serialized-budget.js";
import { metadataDate } from "../canonical/metadata-date.js";

export interface CompactRecallOptions extends ExecutionOptions {
  depth?: RetrievalDepth | string;
  temporal?: TemporalQuery;
  maxBytes?: number;
  diagnostics?: boolean;
}

export type ExpansionUnavailableReason = "missing_id" | "invalid_id" | "duplicate_id" | "source_unavailable"
  | "source_changed" | "source_mismatch" | "invalid_utf8" | "outside_canonical_root";

export interface CompactRecallPassage {
  /** Canonical ID only after unique current-source lookup; never a QMD hit ID. */
  documentId?: string;
  filePath: string;
  /** Whether filePath is relative to the canonical root or a separate retrieval root. */
  pathBasis: "canonical_root" | "index_root";
  startLine: number;
  endLine: number;
  text: string;
  scope: "excerpt";
  /** Excerpts are not complete document/answer context, even without truncation markers. */
  partial: true;
  evidenceDate?: EvidenceDate;
  /** Explicit source declarations only; never inferred reconciliation. */
  relationships?: { conflicts_with?: string | string[]; supersedes?: string | string[] };
  date: { basis: "written"; value: string; field: "created_at" | "createdAt" } | { basis: "unknown" };
  expansion: { available: true; id: string; expectedContentHash: MemoryDocumentContentHash; startLine: number; endLine: number }
    | { available: false; reason: ExpansionUnavailableReason };
  diagnostics?: { hitId: string; score: number; scoreBreakdown?: ScoreBreakdown; metadata?: Frontmatter };
}

export interface CompactRecallPacket {
  version: 1;
  kind: "recall";
  query: string;
  depth: RetrievalDepth;
  maxBytes: number;
  scope: "selected_passages";
  /** Recall is a limited evidence selection, not a complete-source/answer assertion. */
  partial: true;
  temporal?: TemporalRetrieval;
  readiness: RetrievalReadiness;
  retrieval: RetrievalOutcome;
  passages: CompactRecallPassage[];
  /** Counts only candidates returned by search, plus its reported passage omissions. */
  omitted: { results: number; passages: number };
  diagnostics?: { candidateResults: number; candidatePassages: number; budgetOmittedPassages: number };
}

export interface CompactRecallCandidate {
  passages: CompactRecallPassage[];
  omittedPassages?: number;
}

/** Preserve search order and whole evidence units; skip oversized units, never shorten them. */
export function packCompactRecall(
  envelope: Pick<CompactRecallPacket, "query" | "depth" | "readiness" | "retrieval" | "temporal">,
  candidates: CompactRecallCandidate[],
  options: Pick<CompactRecallOptions, "maxBytes" | "diagnostics"> = {},
): CompactRecallPacket {
  const maxBytes = validatePacketMaxBytes(options.maxBytes);
  const candidatePassages = candidates.reduce((count, candidate) => count + candidate.passages.length, 0);
  const upstreamOmitted = candidates.reduce((count, candidate) => count + (candidate.omittedPassages ?? 0), 0);
  const selected: CompactRecallPassage[] = [];
  const represented = new Set<number>();
  const packet = (): CompactRecallPacket => ({
    version: 1, kind: "recall", ...envelope, maxBytes, scope: "selected_passages", partial: true,
    passages: [...selected],
    omitted: { results: candidates.length - represented.size, passages: candidatePassages + upstreamOmitted - selected.length },
    ...(options.diagnostics ? { diagnostics: { candidateResults: candidates.length, candidatePassages,
      budgetOmittedPassages: candidatePassages - selected.length } } : {}),
  });
  if (!packetFits(packet(), maxBytes)) {
    throw new PacketBudgetError("budget_too_small", "Byte budget cannot fit the recall query, readiness, and minimum envelope.");
  }
  for (const [index, candidate] of candidates.entries()) {
    for (const passage of candidate.passages) {
      // Diagnostics are opt-in even for callers of this pure packing seam.
      const { diagnostics, evidenceDate, relationships, ...evidence } = passage;
      selected.push({ ...evidence, ...(envelope.temporal ? { evidenceDate, relationships } : {}),
        ...(options.diagnostics && diagnostics ? { diagnostics } : {}) });
      const previouslyRepresented = represented.has(index);
      represented.add(index);
      if (!packetFits(packet(), maxBytes)) {
        selected.pop();
        if (!previouslyRepresented) represented.delete(index);
      }
    }
  }
  return packet();
}

/** Do not pretty-print, add an envelope, or append diagnostics after packing. */
export function serializeCompactRecall(packet: CompactRecallPacket): string {
  return serializeBudgetedPacket(packet);
}

/** Same strict ISO-calendar validation and creation-field precedence as human recall. No event-date inference. */
export function compactWrittenDate(metadata: Frontmatter = {}): CompactRecallPassage["date"] {
  for (const field of ["created_at", "createdAt"] as const) {
    const value = metadataDate(metadata[field]);
    if (value !== undefined) return { basis: "written", value, field };
  }
  return { basis: "unknown" };
}

/** Match only the cited current source, accounting for the existing excerpt renderer's explicit markers. */
export function excerptMatchesSource(text: string, startLine: number, endLine: number, content: string): boolean {
  const lines = content.split(/(?<=\n)/u);
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) return false;
  const compact = (value: string) => value.replace(/\s+/gu, " ").trim();
  const source = compact(lines.slice(startLine - 1, endLine).join(""));
  // Exact comparison first protects source text that itself happens to contain a marker.
  if (source === compact(text)) return true;
  let excerpt = text.replace(/ \[source continues beyond read bound; expand source\]$/u, "")
    .replace(/ \[ancestor context omitted; expand source\]$/u, "");
  const partialMarker = " … [partial excerpt; expand source]";
  const partial = excerpt.endsWith(partialMarker);
  if (partial) excerpt = excerpt.slice(0, -partialMarker.length);
  const leadingOmission = partial && excerpt.startsWith("… ");
  if (leadingOmission) excerpt = excerpt.slice(2);
  excerpt = compact(excerpt);
  if (!excerpt) return false;
  if (source === excerpt) return true;
  // The only within-line slicing performed by existing excerpts is a single long line.
  return partial && startLine === endLine && (leadingOmission ? source.includes(excerpt) : source.startsWith(excerpt));
}
