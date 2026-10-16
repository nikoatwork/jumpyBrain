import type { ExpansionOptions, ExpansionResult } from "../../core/canonical/index.js";
import { expandMemoryDocument } from "../local-memory/expansion.js";

/** Identical bounded wire packet locally and remotely; no server-root metadata or extra envelope. */
export function expandServerMemoryDocument(options: ExpansionOptions & { root: string }): Promise<ExpansionResult> {
  return expandMemoryDocument(options.root, options);
}
