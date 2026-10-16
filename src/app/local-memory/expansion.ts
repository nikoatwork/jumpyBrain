import { expandCanonicalMemoryDocument, resolveMemoryRoot, type ExpansionOptions, type ExpansionResult } from "../../core/canonical/index.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";

/** Expand canonical evidence at the editor root, never a retrieval-only indexRoot. */
export async function expandMemoryDocument(rootArg: string, options: ExpansionOptions): Promise<ExpansionResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  return expandCanonicalMemoryDocument(root, options);
}
