import { qmdVirtualPathToRelative, runQmd } from "./qmd-cli.js";

export interface QmdCandidate {
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
  score: number;
}

export async function searchWithQmdCli(root: string, query: string, limit: number): Promise<QmdCandidate[]> {
  const merged = new Map<string, QmdCandidate>();
  const lexQueries = qmdLexQueries(query);

  const addRows = (rows: Array<{ file?: string; score?: number; snippet?: string; line?: number }>, weight: number) => {
    rows.forEach((item, rank) => {
      const snippetRange = lineRangeFromSnippet(item.snippet ?? "");
      const lineStart = item.line ?? snippetRange?.lineStart;
      const file = qmdVirtualPathToRelative(item.file ?? "");
      if (!file) return;
      const score = Math.max(Number(item.score ?? 0), 1 / (rank + 1)) * weight;
      const key = `${file}:${lineStart ?? 0}:${item.snippet ?? ""}`;
      const candidate = {
        file,
        lineStart,
        lineEnd: snippetRange?.lineEnd ?? lineStart,
        snippet: item.snippet,
        score,
      };
      const existing = merged.get(key);
      if (!existing || candidate.score > existing.score) merged.set(key, candidate);
    });
  };

  for (const lexQuery of lexQueries.slice(0, 8)) {
    try {
      const result = runQmd(root, ["search", lexQuery, "--json", "-n", String(limit)]);
      addRows(parseQmdJsonRows(result.stdout), 1);
    } catch {
      // Keep search runs alive when one QMD lexical query emits malformed JSON or fails.
    }
  }

  try {
    const queryLines = [...lexQueries.slice(0, 8).map((lexQuery) => `lex: ${lexQuery}`), `vec: ${query}`];
    const result = runQmd(root, ["query", queryLines.join("\n"), "--json", "-n", String(limit), "--no-rerank"]);
    addRows(parseQmdJsonRows(result.stdout), 0.9);
  } catch {
    // QMD query mode can fail when embeddings are unavailable; BM25 QMD search above is still real QMD retrieval.
  }

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function parseQmdJsonRows(stdout: string): Array<{ file?: string; score?: number; snippet?: string; line?: number }> {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  const jsonText = start >= 0 && end >= start ? stdout.slice(start, end + 1) : stdout;
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : [];
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
