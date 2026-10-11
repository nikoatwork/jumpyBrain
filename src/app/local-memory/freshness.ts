import { stat } from "node:fs/promises";
import path from "node:path";
import { listMarkdownFiles } from "../../core/canonical/markdown-store.js";
import { automaticIndexingPolicy, indexingPolicyMatches, resolveIndexRoot } from "../../core/memory-root/index.js";
import { checkExecution, executionSignal, loadManifest, qmdReadiness, readExecution, type QmdManifest } from "../../adapters/qmd/index.js";
import type { RetrievalReadiness } from "../../types.js";

/** Observational canonical/policy readiness, also evaluated against the searched generation. */
export async function retrievalReadiness(root: string, searchedManifest?: QmdManifest): Promise<RetrievalReadiness> {
  let manifest = searchedManifest;
  if (!manifest) try { manifest = await loadManifest(root); } catch { checkExecution(); /* Missing/corrupt derived manifest. */ }
  let stale = !manifest?.sources;
  if (manifest?.sources) {
    try {
      const sourceRoot = await readExecution(resolveIndexRoot(root));
      const files = await readExecution(listMarkdownFiles(sourceRoot, executionSignal()));
      const expected = new Map(manifest.sources.map(item => [item.file, item]));
      stale = (manifest.sourceRoot ?? root) !== sourceRoot || files.length !== expected.size;
      for (const file of files) {
        checkExecution();
        const info = await readExecution(stat(file));
        const previous = expected.get(path.relative(sourceRoot, file).split(path.sep).join("/"));
        if (!previous || previous.size !== info.size || previous.mtimeMs !== info.mtimeMs || previous.ctimeMs !== info.ctimeMs) { stale = true; break; }
      }
    } catch { checkExecution(); stale = true; }
  }
  const readiness = await readExecution(qmdReadiness(root, manifest, stale));
  const configured = await readExecution(automaticIndexingPolicy(root));
  if (!indexingPolicyMatches(configured, manifest?.policy, manifest?.embedding?.modelHash)) {
    readiness.freshness = manifest ? "stale" : "missing";
    readiness.embedding = configured.mode === "lexical" ? "disabled" : "incomplete";
    readiness.modes = readiness.modes.filter(mode => mode !== "semantic");
  }
  if (configured.mode === "semantic" && readiness.embedding !== "complete" && readiness.freshness === "fresh") {
    readiness.freshness = "stale";
  }
  return readiness;
}
