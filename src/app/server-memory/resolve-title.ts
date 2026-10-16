import { resolveCanonicalMemoryDocumentByTitle, resolveMemoryRoot, type CanonicalMemoryTitleResolution } from "../../core/canonical/index.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";

/** Minimal remote-safe outcome; no titles, candidate paths, bodies, or index state. */
export async function resolveServerMemoryTitle(options: { root: string; title: string }): Promise<CanonicalMemoryTitleResolution> {
  const root = await resolveMemoryRoot(options.root);
  await assertCompatibleMemoryRoot(root);
  // Editor scope, not the retrieval-only indexRoot. No writes or indexing.
  return resolveCanonicalMemoryDocumentByTitle(root, options.title);
}
