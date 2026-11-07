import { loadManifest, readQmdSemanticLinks, withQmdOperation, type QmdManifest } from "../../adapters/qmd/index.js";
import { retrievalReadiness } from "./freshness.js";
import type { MemoryGraphEdge, MemoryGraphResult } from "../../types.js";

export async function semanticGraph(root: string, manifest: QmdManifest | undefined, files: string[], signal?: AbortSignal): Promise<{
  edges: MemoryGraphEdge[]; semantic: NonNullable<MemoryGraphResult["semantic"]>; warnings: string[];
}> {
  const fallback = (state: NonNullable<MemoryGraphResult["semantic"]>["state"], warning?: string) => ({
    edges: [], semantic: { state, comparedDocuments: 0, totalDocuments: files.length }, warnings: warning ? [warning] : [],
  });
  if (manifest?.policy?.mode !== "semantic") return fallback("disabled", "Related-note connections are unavailable until semantic indexing is set up. Explicit links are shown.");
  try {
    return await withQmdOperation(root, "search", { signal, timeoutMs: 10_000 }, async () => {
      const readiness = await retrievalReadiness(root, manifest);
      if (readiness.freshness !== "fresh") return fallback("stale", "Related-note connections are waiting for an up-to-date index. Explicit links are shown.");
      if (!manifest.generation || !readiness.modes.includes("semantic")) return fallback("unavailable", "Related-note connections are unavailable. Explicit links are shown.");
      const result = await readQmdSemanticLinks(root, manifest.generation, files);
      const after = await retrievalReadiness(root, manifest);
      if (after.freshness !== "fresh" || !after.modes.includes("semantic") || (await loadManifest(root)).generation !== manifest.generation)
        return fallback("stale", "Related-note connections changed while loading. Refresh the map after indexing finishes.");
      const partial = result.comparedDocuments < files.length;
      return {
        edges: result.edges.map(edge => ({ ...edge, id: `semantic-link:${edge.source}->${edge.target}`, kind: "semantic-link" as const, count: 1, resolved: true })),
        semantic: { state: partial ? "partial" as const : "ready" as const, comparedDocuments: result.comparedDocuments, totalDocuments: files.length },
        warnings: partial ? [`Related-note connections compared ${result.comparedDocuments} of ${files.length} notes; some notes are outside the comparison budget or have no usable embeddings.`] : [],
      };
    });
  } catch {
    signal?.throwIfAborted();
    return fallback("unavailable", "Related-note connections are temporarily unavailable. Explicit links are shown; refresh to retry.");
  }
}
