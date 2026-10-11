import path from "node:path";
import { indexedCreation, pendingCreationIndex, failedCreationIndex } from "./writing/creation-outcome.js";
import { ensureMemoryIndexed, retrievalReadiness } from "./local-memory/index.js";
import { resolveIndexRoot } from "../core/memory-root/index.js";
import { withQmdOperation, readExecution, loadManifest } from "../adapters/qmd/index.js";
import type { ExecutionOptions, MemoryWriteResult } from "../types.js";

/** Post-publication composition; writing and retrieval modules stay independent. */
export async function ensureSavedMemoryIndexed(rootArg: string, saved: MemoryWriteResult, options: ExecutionOptions = {}): Promise<MemoryWriteResult> {
  try {
    return await withQmdOperation(rootArg, "index", options, async () => {
      const indexed = await ensureMemoryIndexed(rootArg);
      const sourceRoot = await readExecution(resolveIndexRoot(indexed.root));
      const absolute = path.resolve(indexed.root, saved.file);
      const relative = path.relative(sourceRoot, absolute);
      const outside = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
      if (outside) return { ...saved, ...pendingCreationIndex(), indexing: { status: "pending", diagnostic: {
        code: "index_scope_excluded", message: "Memory saved outside configured indexRoot; ordinary indexing cannot make it searchable. Review retrieval scope explicitly.",
        recovery: "Do not repeat creation. Keep the returned ID/path and configure the intended retrieval scope before indexing.",
      } } };
      const manifest = await loadManifest(indexed.root);
      if ((await retrievalReadiness(indexed.root, manifest)).freshness !== "fresh"
        || !manifest.documents.some(doc => doc.absolutePath === absolute && doc.frontmatter.id === saved.id)) {
        return { ...saved, ...pendingCreationIndex() };
      }
      return { ...saved, ...indexedCreation() };
    });
  } catch (error) { return { ...saved, ...failedCreationIndex(error) }; }
}
