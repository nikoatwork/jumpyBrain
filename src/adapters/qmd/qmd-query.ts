import type { RetrievalOutcome } from "../../types.js";
import { QMD_COLLECTION, QMD_DREAM_COLLECTION, qmdVirtualPathToRelative, runQmd } from "./qmd-cli.js";

export interface QmdCandidate {
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
  score: number;
  dreamSupplement?: boolean;
  temporalBackfill?: boolean;
}

export async function searchWithQmdCli(root: string, query: string, limit: number, options: { dreamsOnly?: boolean; semantic?: boolean; model?: string; outcome?: RetrievalOutcome } = {}): Promise<QmdCandidate[]> {
  const collection = options.dreamsOnly ? QMD_DREAM_COLLECTION : QMD_COLLECTION;
  // Supplemental retrieval stays lexical: at most two processes and 24 rows each.
  limit = Math.max(1, Math.min(options.dreamsOnly ? 24 : 160, limit));
  const merged = new Map<string, QmdCandidate>();
  const lexQueries = qmdLexQueries(query);
  let successes = 0;
  const warn = (code: string) => {
    if (!options.outcome) return;
    options.outcome.status = "partial";
    if (!options.outcome.warnings.includes(code)) options.outcome.warnings.push(code);
  };

  const addRows = (rows: Array<{ file?: string; score?: number; snippet?: string; line?: number }>, weight: number) => {
    rows.forEach((item, rank) => {
      const snippetRange = lineRangeFromSnippet(item.snippet ?? "");
      // JSON line is the match anchor, not necessarily the excerpt start.
      // The @@ header describes the context window actually returned by QMD.
      const lineStart = snippetRange?.lineStart ?? item.line;
      const file = qmdVirtualPathToRelative(item.file ?? "", collection);
      if (!file) return;
      // QMD can round BM25 scores to zero, so retain a rank fallback. A tiny
      // dream collection earns at most half the ordinary rank fallback; the
      // driver additionally requires query overlap before admitting supplements.
      const score = Math.max(Number(item.score ?? 0), (options.dreamsOnly ? 0.5 : 1) / (rank + 1)) * weight;
      const key = `${file}:${lineStart ?? 0}:${item.snippet ?? ""}`;
      const candidate = {
        file,
        lineStart,
        lineEnd: snippetRange?.lineEnd ?? lineStart,
        snippet: item.snippet,
        score,
        dreamSupplement: options.dreamsOnly,
      };
      // Max, not additive RRF: correlated lexical variants must not accumulate
      // votes. Fixed-pool fusion ablations show specialist/consensus tradeoffs,
      // not a justified replacement for the calibrated driver score contract.
      const existing = merged.get(key);
      if (!existing || candidate.score > existing.score) merged.set(key, candidate);
    });
  };

  for (const lexQuery of lexQueries.slice(0, options.dreamsOnly ? 2 : 8)) {
    try {
      const result = runQmd(root, ["search", lexQuery, "--json", "-n", String(limit), "-c", collection]);
      addRows(parseQmdJsonRows(result.stdout), 1);
      successes++;
    } catch {
      warn(options.dreamsOnly ? "dream_query_failed" : "lexical_query_failed");
    }
  }

  if (!options.dreamsOnly && options.semantic !== false) try {
    const queryLines = [...lexQueries.slice(0, 8).map((lexQuery) => `lex: ${lexQuery}`), `vec: ${query}`];
    const result = runQmd(root, ["query", queryLines.join("\n"), "--json", "-n", String(limit), "--no-rerank", "-c", collection], options.model);
    addRows(parseQmdJsonRows(result.stdout), 0.9);
    successes++;
  } catch {
    warn("semantic_query_failed_lexical_fallback");
  }
  if (!successes && !options.dreamsOnly) throw new Error("QMD retrieval failed; no backend query succeeded. This is not an empty memory result.");

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function parseQmdJsonRows(stdout: string): Array<{ file?: string; score?: number; snippet?: string; line?: number }> {
  if (stdout.trim() === "No results found.") return []; // QMD 2.8.3's empty --json response.
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  const jsonText = start >= 0 && end >= start ? stdout.slice(start, end + 1) : stdout;
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("Invalid QMD result packet.");
  return parsed;
}

function lineRangeFromSnippet(snippet: string): { lineStart: number; lineEnd: number } | undefined {
  const match = snippet.match(/^@@\s+-(\d+),(\d+)\s+@@/);
  if (!match) return undefined;
  const lineStart = Number(match[1]);
  const count = Number(match[2]);
  return { lineStart, lineEnd: lineStart + Math.max(1, count) - 1 };
}

export function qmdLexQueries(value: string): string[] {
  const terms = expandedQueryTerms(value);
  const queries = new Set<string>();

  for (const phrase of salientAdjacentQueries(value).slice(0, 8)) {
    queries.add(phrase);
  }

  if (terms.length > 0) queries.add(terms.join(" "));

  const salient = terms
    .filter((term) => term.length >= 5)
    .sort((left, right) => queryTermWeight(right) - queryTermWeight(left) || left.localeCompare(right))
    .slice(0, 8);
  for (let left = 0; left < salient.length; left += 1) {
    for (let right = left + 1; right < salient.length; right += 1) {
      queries.add(`${salient[left]} ${salient[right]}`);
      if (queries.size >= 16) return [...queries];
    }
  }

  return queries.size > 0 ? [...queries] : [value];
}

export function expandedQueryTerms(value: string): string[] {
  const expanded = new Set<string>();
  for (const token of tokenize(value)) {
    expanded.add(token);
    if (token.length > 4 && token.endsWith("ies")) expanded.add(`${token.slice(0, -3)}y`);
    else if (token.length > 4 && token.endsWith("s")) expanded.add(token.slice(0, -1));
  }
  return [...expanded];
}

export function salientAdjacentQueries(value: string): string[] {
  const terms = tokenize(value);
  const phrases = new Map<string, number>();
  for (let index = 0; index < terms.length - 1; index += 1) {
    const left = terms[index];
    const right = terms[index + 1];
    const phrase = `${left} ${right}`;
    const score = queryTermWeight(left) + queryTermWeight(right) + index / Math.max(1, terms.length) * 0.25;
    phrases.set(phrase, Math.max(phrases.get(phrase) ?? 0, score));
  }

  return [...phrases.entries()]
    .sort(([leftPhrase, leftScore], [rightPhrase, rightScore]) => rightScore - leftScore || leftPhrase.localeCompare(rightPhrase))
    .map(([phrase]) => phrase);
}

export function queryTermWeight(term: string): number {
  if (LOW_VALUE_QUERY_TERMS.has(term)) return 0.2;
  if (term.length >= 8) return 3;
  if (term.length >= 5) return 2;
  return 1;
}

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9._/-]+/)
    .map((token) => token.replace(/^[._/-]+|[._/-]+$/g, ""))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "where", "what", "who", "which", "did", "does", "into", "from", "have", "has", "had", "was", "were", "are",
  "about", "again", "any", "as", "at", "back", "been", "can", "chat", "check", "checking", "conversation", "could", "current", "do", "earlier", "get", "going", "got", "he", "her", "his", "i", "in", "is", "it", "me", "my", "of", "on", "our", "previous", "remember", "remind", "she", "some", "their", "time", "to", "told", "upcoming", "ve", "wanted", "would", "you", "your",
]);

const LOW_VALUE_QUERY_TERMS = new Set(["advice", "day", "days", "events", "first", "getting", "happened", "helped", "last", "months", "order", "passed", "pick", "results", "since", "suggest", "weeks"]);
