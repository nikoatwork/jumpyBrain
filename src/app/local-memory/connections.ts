import { readFile } from "node:fs/promises";
import { buildCanonicalLinkTargetLookup, extractCanonicalLinks, resolveCanonicalLinkTarget } from "../../core/canonical/index.js";
import type { MarkdownDocument, MemoryConnectionEdge, MemoryConnectionEdgeKind } from "../../types.js";

/** Canonical connection policy shared by lightweight overview and graph projections. */
export async function collectConnections(documents: MarkdownDocument[], visit?: (document: MarkdownDocument, content: string) => Promise<void>, options: { neighbors?: boolean } = {}) {
  const lookup = buildCanonicalLinkTargetLookup(documents);
  const edgeCounts = new Map<string, MemoryConnectionEdge>();
  const unresolved: Array<{ source: string; target: string; kind: MemoryConnectionEdgeKind }> = [];
  const neighbors = new Map<string, Set<string>>();
  for (const document of documents) {
    const content = await readFile(document.absolutePath, "utf8");
    await visit?.(document, content);
    for (const reference of extractCanonicalLinks(content)) {
      const target = resolveCanonicalLinkTarget(document.relativePath, reference.target, reference.kind, lookup);
      if (target === document.relativePath) continue;
      if (!target) {
        unresolved.push({ source: document.relativePath, target: reference.target, kind: reference.kind });
        continue;
      }
      const key = `${document.relativePath}\0${target}\0${reference.kind}`;
      const existing = edgeCounts.get(key);
      if (existing) existing.count++;
      else edgeCounts.set(key, { source: document.relativePath, target, kind: reference.kind, count: 1 });
      if (options.neighbors !== false) for (const [source, neighbor] of [[document.relativePath, target], [target, document.relativePath]] as const) {
        const adjacent = neighbors.get(source) ?? new Set<string>();
        adjacent.add(neighbor);
        neighbors.set(source, adjacent);
      }
    }
  }
  const edges = [...edgeCounts.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.kind.localeCompare(b.kind));
  return { edges, unresolved, neighbors };
}
