import type { SearchResult } from "../types.js";

export function formatHumanResults(results: SearchResult[]): string {
  if (results.length === 0) return "No memory matches found.";

  return results.map((result, index) => {
    const provenance = result.provenance;
    const where = `${provenance.file}:${provenance.lineStart}-${provenance.lineEnd}`;
    const session = provenance.sessionId ? ` session=${provenance.sessionId}` : "";
    return [
      `${index + 1}. ${where}${session} score=${result.score}`,
      `   ${result.snippet}`,
    ].join("\n");
  }).join("\n\n");
}
