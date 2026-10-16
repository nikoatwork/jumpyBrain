// Shared exact-title eligibility. Visible suggestions cannot prove global uniqueness.
import { isValidMemoryDocumentId } from "../../core/document-id-format.js";
export interface ReferenceCandidate { documentId?: string | null; referenceTitle?: string | null }
export type ReferenceProblem = "unsafe_title" | "missing_id" | "visible_duplicate";
export function safeReferenceTitle(title: unknown): title is string {
  return typeof title === "string" && Boolean(title) && title === title.trim() && !/[\[\]\x00-\x1f\x7f|#\\/]/.test(title);
}
export function referenceEligibility(result: ReferenceCandidate, visible: readonly ReferenceCandidate[]): ReferenceProblem | null {
  const title = result.referenceTitle;
  if (!safeReferenceTitle(title)) return "unsafe_title";
  if (!isValidMemoryDocumentId(result.documentId)) return "missing_id";
  if (visible.some(other => other.documentId !== result.documentId && other.referenceTitle?.trim().toLowerCase() === title.toLowerCase())) return "visible_duplicate";
  return null;
}
