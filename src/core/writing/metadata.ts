import type { MemoryConfidence, MemoryNoteType, MemoryReviewStatus } from "../../types.js";
import { metadataDate } from "../canonical/metadata-date.js";
export { generateMemoryDocumentId, isValidMemoryDocumentId, MEMORY_DOCUMENT_ID_PATTERN } from "../document-id.js";

export const VALID_MEMORY_TYPES = ["note", "session", "finding", "decision", "preference", "page"] as const satisfies readonly MemoryNoteType[];

export const MEMORY_CONFIDENCE = {
  userReviewed: "user-reviewed",
  agentDrafted: "agent-drafted",
} as const satisfies Record<string, MemoryConfidence>;

export const MEMORY_REVIEW = {
  userReviewRecommended: "user-review-recommended",
} as const satisfies Record<string, MemoryReviewStatus>;

// Creation accepts typed metadata, not truthy strings from untrusted callers.
export function normalizeDreamMarker(value: unknown): boolean | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  throw new Error("dream must be a boolean.");
}

/** Preserve the declared ISO representation; this is not a retrieval interval. */
export function normalizeEvidenceDate(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const date = metadataDate(value);
  if (date !== undefined) return date;
  throw new Error("date must be a real ISO calendar date (YYYY-MM-DD) or a timezone-explicit ISO timestamp.");
}
