import type { MemoryConfidence, MemoryNoteType, MemoryReviewStatus } from "../types.js";

export const VALID_MEMORY_TYPES = ["note", "session", "finding", "decision", "preference", "page"] as const satisfies readonly MemoryNoteType[];

export const MEMORY_CONFIDENCE = {
  userReviewed: "user-reviewed",
  agentDrafted: "agent-drafted",
} as const satisfies Record<string, MemoryConfidence>;

export const MEMORY_REVIEW = {
  userReviewRecommended: "user-review-recommended",
} as const satisfies Record<string, MemoryReviewStatus>;
