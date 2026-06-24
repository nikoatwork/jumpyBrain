import { readMarkdownDocuments, resolveMemoryRoot } from "../canonical/markdown-store.js";
import { assertCompatibleMemoryRoot, resolveIndexRoot } from "../setup/index.js";
import { buildQmdIndex, searchQmdIndex } from "../qmd/index.js";
import { normalizeRetrievalDepth } from "./depth-policy.js";
import type { IndexMemoryResult, SearchMemoryOptions, SearchMemoryResult } from "../types.js";

export async function indexMemory(rootArg: string): Promise<IndexMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const sourceRoot = await resolveIndexRoot(root);
  const documents = await readMarkdownDocuments(sourceRoot);
  const manifest = await buildQmdIndex(root, documents, { sourceRoot });
  return { root, documents: manifest.documents.length, qmdCollection: manifest.qmdCollection };
}

export async function searchMemory(rootArg: string, query: string, limit: number, options: SearchMemoryOptions = {}): Promise<SearchMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const depth = normalizeRetrievalDepth(options.depth);
  const results = await searchQmdIndex(root, query, limit, { depth });
  return { root, query, depth, results };
}
