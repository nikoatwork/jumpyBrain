import { fileURLToPath } from "node:url";
import { resolveQmdSdk } from "./qmd-cli.js";
import { runQmdChild } from "./qmd-execution.js";
import { assertSameReadOnlyQmdGeneration, observeReadOnlyQmdGeneration } from "./qmd-read-only.js";
import { SEMANTIC_LINK_POLICY, type SemanticLink } from "../../core/retrieval-policy/semantic-links.js";

/** Called inside the app's bounded QMD execution scope after canonical freshness checks. */
export async function readQmdSemanticLinks(root: string, generation: string, files: string[]): Promise<{ edges: SemanticLink[]; comparedDocuments: number }> {
  const before = await observeReadOnlyQmdGeneration(root);
  if (before.generation !== generation) throw new Error("Semantic graph generation changed");
  const selected = files.slice(0, SEMANTIC_LINK_POLICY.maxDocuments);
  const result = await runQmdChild(process.execPath, [fileURLToPath(new URL("./qmd-graph-worker.js", import.meta.url))], {
    input: JSON.stringify({ root, generation, files: selected, sdkPath: resolveQmdSdk() }),
    maxBytes: 4 * 1024 * 1024, acceptNonzero: true, env: { ...process.env, SQLITE_USE_URI: "1" },
  });
  const payload = JSON.parse(result.stdout);
  if (result.exitCode !== 0 || payload.error || payload.generation !== generation || !Array.isArray(payload.edges)) throw new Error("Semantic graph unavailable");
  assertSameReadOnlyQmdGeneration(before, await observeReadOnlyQmdGeneration(root));
  return { edges: payload.edges, comparedDocuments: payload.comparedDocuments };
}
