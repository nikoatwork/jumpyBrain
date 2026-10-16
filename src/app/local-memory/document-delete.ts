import { deleteCanonicalMemoryDocumentById, listCanonicalMemoryMarkdownFiles, readCanonicalMemoryDocumentById, readMarkdownDocument, resolveMemoryRoot } from "../../core/canonical/index.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { collectConnections } from "./connections.js";
import type { MemoryDocumentDeletePreview } from "../../types.js";

/** Observational warning, not a complete dependency graph or a deletion lock. */
export async function previewMemoryDocumentDeletion(rootArg: string, id: string): Promise<MemoryDocumentDeletePreview> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const selected = await readCanonicalMemoryDocumentById(root, id, { guarded: true });
  const documents = [];
  for (const file of await listCanonicalMemoryMarkdownFiles(root)) documents.push(await readMarkdownDocument(root, file));
  const { edges } = await collectConnections(documents);
  const inbound = edges.filter(edge => edge.target === selected.file && edge.source !== selected.file);
  const fields = ["supersedes", "superseded_by", "conflicts_with", "supports", "contradicts", "related", "related_to"];
  const related = documents.filter(doc => doc.relativePath !== selected.file && fields.some(field => {
    const value = doc.frontmatter[field];
    return (Array.isArray(value) ? value : [value]).some(item => item === id || item === selected.file);
  }));
  const examples = [...new Set([...inbound.map(edge => edge.source), ...related.map(doc => doc.relativePath)])];
  return { root, target: "local", id, file: selected.file, title: selected.title, contentHash: selected.contentHash, permanent: true,
    references: { links: inbound.reduce((sum, edge) => sum + edge.count, 0), relationships: related.length,
      examples: examples.slice(0, 20), truncated: examples.length > 20 } };
}

export async function deleteMemoryDocument(rootArg: string, id: string, options: { ifMatch: string; apply: true }) {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  return deleteCanonicalMemoryDocumentById(root, id, options);
}
