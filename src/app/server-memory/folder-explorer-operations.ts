import { createCanonicalMemoryFolder, moveCanonicalMemoryDocumentById, resolveMemoryRoot, MemoryDocumentLookupError } from "../../core/canonical/index.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { markRemoteIndexStale } from "./state.js";

/** Host serializes these operations with ordinary document writes. */
export async function applyServerMemoryFileOperation(options: { root: string; operation: Record<string, unknown>; ifMatch?: string }) {
  const root = await resolveMemoryRoot(options.root);
  await assertCompatibleMemoryRoot(root);
  const op = options.operation;
  if (op.action === "create-folder" && Object.keys(op).every(key => ["action", "path"].includes(key))) {
    try { await createCanonicalMemoryFolder(root, op.path as string); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new MemoryDocumentLookupError("validation_failed", "A file or folder already exists with that name.");
      throw new MemoryDocumentLookupError("validation_failed", "Could not create this folder. Choose a new name inside an existing memory folder.");
    }
    return { created: true, folder: op.path };
  }
  if (op.action === "move-file" && typeof op.id === "string" && typeof op.file === "string" && typeof op.destination === "string" && Object.keys(op).every(key => ["action", "id", "file", "destination"].includes(key))) {
    const result = await moveCanonicalMemoryDocumentById(root, op.id, { file: op.file, destination: op.destination, ifMatch: options.ifMatch ?? "" });
    if (!result.moved) return result;
    try { await markRemoteIndexStale(root); return { ...result, indexing: { status: "pending" } }; }
    catch { return { ...result, indexing: { status: "failed" } }; }
  }
  throw new MemoryDocumentLookupError("validation_failed", "Invalid file operation.");
}
