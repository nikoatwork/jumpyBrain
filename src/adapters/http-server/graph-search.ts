// Graph-only presentation policy over shared search results; no new retrieval engine.
const SEMANTIC_SCORE_FLOOR = 0.75;
const SEMANTIC_RELATIVE_FLOOR = 0.85;
interface GraphSearchHit {
  snippet?: unknown;
  confirmedWriteMatch?: boolean;
  scoreBreakdown?: { qmdScore?: unknown };
  provenance?: { metadata?: { title?: unknown } };
  passages?: { snippet?: unknown }[];
}
function normalized(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase() : "";
}
function baseScore(hit: GraphSearchHit): number {
  const score = hit.scoreBreakdown?.qmdScore;
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1 ? score : 0;
}
export function graphLexicalMatch(query: string, text: unknown): boolean {
  const term = normalized(query), content = normalized(text);
  if (!term || !content) return false;
  // Preserve punctuation for literal phrases (C++ must not become C).
  const phrase = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp("(^|[^\\p{L}\\p{N}])" + phrase + "(?=$|[^\\p{L}\\p{N}])", "u").test(content)) return true;
  const terms = term.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!terms.length || /[^\p{L}\p{N}\s]/u.test(term)) return false;
  const words = new Set(content.match(/[\p{L}\p{N}]+/gu) ?? []);
  return terms.every(word => words.has(word));
}
export function selectGraphSearchResults(query: string, results: unknown): GraphSearchHit[] {
  if (!query.trim() || !Array.isArray(results)) return [];
  const hits: GraphSearchHit[] = results.filter(hit => hit && typeof hit === "object");
  const threshold = Math.max(SEMANTIC_SCORE_FLOOR, SEMANTIC_RELATIVE_FLOOR * Math.max(0, ...hits.map(baseScore)));
  // Rank/recency/dream boosts are not semantic confidence. Never promote a weak
  // tail just to fill the display; scoreless results need literal evidence.
  return hits.filter(hit => hit.confirmedWriteMatch === true
    || graphLexicalMatch(query, hit.provenance?.metadata?.title)
    || graphLexicalMatch(query, hit.snippet)
    || (hit.passages ?? []).some(passage => graphLexicalMatch(query, passage.snippet))
    || baseScore(hit) >= threshold);
}
