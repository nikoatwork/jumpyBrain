import { readMarkdownDocuments, resolveMemoryRoot } from "../canonical/markdown-store.js";
import { buildQmdIndex, searchQmdIndex } from "./qmd-driver.js";
import type { IndexMemoryResult, SearchMemoryResult } from "../types.js";

export async function indexMemory(rootArg: string): Promise<IndexMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  const documents = await readMarkdownDocuments(root);
  const manifest = await buildQmdIndex(root, documents);
  return { root, documents: manifest.documents.length, qmdCollection: manifest.qmdCollection };
}

export async function searchMemory(rootArg: string, query: string, limit: number): Promise<SearchMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  const results = await searchQmdIndex(root, query, limit);
  return { root, query, results };
}
