import { resolveCanonicalMemoryDocumentByTitle, resolveMemoryRoot, type CanonicalMemoryTitleResolution } from "../../core/canonical/index.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import type { MemoryWriteResult } from "../../types.js";
import { failedCreationIndex } from "../writing/creation-outcome.js";
import { writeRemoteMemoryNote } from "../writing/remote-writer.js";
import { markRemoteIndexStale } from "./state.js";

export type EnsureServerMemoryTitleResult =
  | { status: "found"; id: string; created: boolean; indexing?: MemoryWriteResult["indexing"] }
  | Exclude<CanonicalMemoryTitleResolution, { status: "found" }>;

/** Match literal reference eligibility; never interpret a title as a path. */
export function isSafeReferencePageTitle(title: unknown): title is string {
  return typeof title === "string" && Boolean(title) && title === title.trim()
    && !/[\[\]\x00-\x1f\x7f|#\\/]/.test(title);
}

/** The host must serialize the entire operation with its other canonical writes. */
export async function ensureServerMemoryTitle(options: { root: string; title: string }): Promise<EnsureServerMemoryTitleResult> {
  if (!isSafeReferencePageTitle(options.title)) throw new Error("Invalid reference page title.");
  const root = await resolveMemoryRoot(options.root);
  await assertCompatibleMemoryRoot(root);
  // Fresh editor-root lookup, never QMD/indexRoot. Failed or ambiguous scans
  // must not become permission to create a second canonical document.
  const resolved = await resolveCanonicalMemoryDocumentByTitle(root, options.title);
  if (resolved.status === "found") return { ...resolved, created: false };
  if (resolved.status !== "missing") return resolved;
  const written = await writeRemoteMemoryNote(root, { type: "page", title: options.title, body: "" }, { emptyReferencePage: true });
  // The Markdown has been published. Never hide its identity behind a derived
  // bookkeeping error: uncertain-response retries resolve this same title.
  try {
    await markRemoteIndexStale(root);
    return { status: "found", id: written.id, created: true, indexing: written.indexing };
  } catch (error) {
    return { status: "found", id: written.id, created: true, indexing: failedCreationIndex(error, true).indexing };
  }
}
