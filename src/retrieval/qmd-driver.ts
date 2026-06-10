import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { withSessionAliases } from "../canonical/provenance.js";
import type { IndexManifest, IndexedDocument, MarkdownDocument, SearchResult } from "../types.js";

const INDEX_VERSION = 1;
const COLLECTION = "jumpybrain";

export function derivedRoot(root: string): string {
  return path.join(root, ".jumpybrain");
}

export function manifestPath(root: string): string {
  return path.join(derivedRoot(root), "index.json");
}

export async function buildQmdIndex(root: string, documents: MarkdownDocument[]): Promise<IndexManifest> {
  const derived = derivedRoot(root);
  await mkdir(derived, { recursive: true });

  const manifest: IndexManifest = {
    version: INDEX_VERSION,
    root,
    generatedAt: new Date().toISOString(),
    qmdCollection: COLLECTION,
    documents: documents.map(toIndexedDocument),
  };

  await writeFile(manifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rebuildQmdCliCollection(root);

  return manifest;
}

export async function loadManifest(root: string): Promise<IndexManifest> {
  const raw = await readFile(manifestPath(root), "utf8");
  return JSON.parse(raw) as IndexManifest;
}

interface Candidate {
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
  score: number;
}

export async function searchQmdIndex(root: string, query: string, limit: number): Promise<SearchResult[]> {
  const manifest = await loadManifest(root);
  const candidates = await searchWithQmdCli(root, query, Math.max(limit * 4, 20));
  const byFile = new Map();
  for (const document of manifest.documents) {
    byFile.set(document.relativePath, document);
    byFile.set(normalizeQmdLookupPath(document.relativePath), document);
  }
  const temporalStats = dateStats(manifest.documents);
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const candidate of candidates) {
    if (!candidate.file) continue;
    const document = byFile.get(candidate.file) ?? byFile.get(normalizeQmdLookupPath(candidate.file));
    if (!document) continue;

    let lineStart = candidate.lineStart ?? document.bodyStartLine;
    let lineEnd = candidate.lineEnd ?? lineStart;
    let snippet = boundedSnippet(cleanQmdSnippet(candidate.snippet ?? ""));

    if (lineStart < document.bodyStartLine || looksLikeUnhelpfulSnippet(snippet)) {
      const repaired = await snippetFromOriginalBody(document, query);
      lineStart = repaired.lineStart;
      lineEnd = repaired.lineEnd;
      snippet = repaired.snippet;
    } else if (snippet.length < 180) {
      const expanded = await neighborSnippetFromOriginal(document, lineStart, lineEnd);
      lineStart = expanded.lineStart;
      lineEnd = expanded.lineEnd;
      snippet = expanded.snippet;
    }

    const id = `qmd-${stableResultId(candidate.file, lineStart, snippet)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const provenance = withSessionAliases({
      file: document.relativePath,
      lineStart,
      lineEnd,
      metadata: document.frontmatter,
    });
    const exactMatchBoost = exactBoost(query, snippet);
    const metadataBoost = metadataBoostFor(query, document.frontmatter);
    const temporalRelevance = temporalBoostFor(query, document.frontmatter, temporalStats);
    const memoryStrength = memoryStrengthBoost(document.frontmatter);
    const provenanceConfidence = provenanceConfidenceBoost(provenance);
    const qmdScore = clampScore(candidate.score);
    const finalScore = qmdScore + exactMatchBoost + metadataBoost + temporalRelevance + memoryStrength + provenanceConfidence;

    results.push({
      id,
      score: round(finalScore),
      snippet,
      provenance,
      sessionId: provenance.sessionId,
      session_id: provenance.session_id,
      scoreBreakdown: {
        qmdScore: round(qmdScore),
        exactMatchBoost: round(exactMatchBoost),
        metadataBoost: round(metadataBoost),
        temporalRelevance: round(temporalRelevance),
        memoryStrength: round(memoryStrength),
        provenanceConfidence: round(provenanceConfidence),
        finalScore: round(finalScore),
        driver: "qmd-cli",
      },
    });
  }

  return results
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function toIndexedDocument(document: MarkdownDocument): IndexedDocument {
  return {
    absolutePath: document.absolutePath,
    relativePath: document.relativePath,
    frontmatter: document.frontmatter,
    bodyStartLine: document.bodyStartLine,
  };
}

async function rebuildQmdCliCollection(root: string): Promise<void> {
  const derived = derivedRoot(root);
  await rm(path.join(derived, "qmd-cache"), { recursive: true, force: true });
  await rm(path.join(derived, "qmd-config"), { recursive: true, force: true });
  await mkdir(path.join(derived, "qmd-cache"), { recursive: true });
  await mkdir(path.join(derived, "qmd-config"), { recursive: true });
  await mkdir(path.join(derived, "qmd-home"), { recursive: true });

  runQmd(root, ["collection", "add", root, "--name", COLLECTION, "--mask", "**/*.md"]);
  runQmd(root, ["update"]);

  if (truthy(process.env.JUMPYBRAIN_QMD_EMBED) || qmdRetrievalMode() === "vsearch") {
    runQmd(root, ["embed"]);
  }
}

type QmdRetrievalMode = "merged" | "search" | "query" | "native" | "vsearch";

function qmdRetrievalMode(): QmdRetrievalMode {
  const value = String(process.env.JUMPYBRAIN_QMD_MODE ?? "merged").toLowerCase();
  if (value === "search" || value === "query" || value === "native" || value === "vsearch") return value;
  return "merged";
}

async function searchWithQmdCli(root: string, query: string, limit: number): Promise<Candidate[]> {
  const merged = new Map<string, Candidate>();
  const lexQueries = qmdLexQueries(query);
  const mode = qmdRetrievalMode();

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

  if (mode === "search" || mode === "merged") {
    for (const lexQuery of lexQueries.slice(0, 8)) {
      try {
        const result = runQmd(root, ["search", lexQuery, "--json", "-n", String(limit)]);
        addRows(parseQmdJsonRows(result.stdout), 1);
      } catch {
        // Keep benchmark/search runs alive when one QMD lexical query emits malformed JSON or fails.
      }
    }
  }

  if (mode === "query" || mode === "merged") {
    try {
      const queryLines = lexQueries.slice(0, 8).map((lexQuery) => `lex: ${lexQuery}`);
      if (mode === "merged") queryLines.push(`vec: ${query}`);
      const result = runQmd(root, ["query", queryLines.join("\n"), "--json", "-n", String(limit), "--no-rerank"]);
      addRows(parseQmdJsonRows(result.stdout), mode === "query" ? 1 : 0.9);
    } catch {
      // QMD vector/query mode can fail when embeddings are unavailable; BM25 QMD search above is still real QMD retrieval.
    }
  }

  if (mode === "native") {
    for (let attempt = 0; attempt < 2 && merged.size === 0; attempt += 1) {
      try {
        const result = runQmd(root, ["query", query, "--json", "-n", String(limit)]);
        addRows(parseQmdJsonRows(result.stdout), 1);
      } catch {
        // Keep explicit QMD native-query comparison runs alive when local reranking/expansion cannot run.
      }
    }
  }

  if (mode === "vsearch") {
    for (let attempt = 0; attempt < 2 && merged.size === 0; attempt += 1) {
      try {
        const result = runQmd(root, ["vsearch", query, "--json", "-n", String(limit)]);
        addRows(parseQmdJsonRows(result.stdout), 1);
      } catch {
        // Keep explicit embedding comparison runs alive when one workspace cannot vector search.
      }
    }
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

function runQmd(root: string, args: string[]): { stdout: string; stderr: string } {
  const derived = derivedRoot(root);
  const result = spawnSync("qmd", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      HOME: path.join(derived, "qmd-home"),
      XDG_CACHE_HOME: path.join(derived, "qmd-cache"),
      QMD_CONFIG_DIR: path.join(derived, "qmd-config"),
      GGML_METAL_NO_RESIDENCY: process.env.QMD_METAL_KEEP_RESIDENCY ? process.env.GGML_METAL_NO_RESIDENCY : "1",
    },
  });

  if (result.error && result.error.message.includes("ENOENT")) {
    throw new Error("qmd CLI is required. Install with: npm install -g @tobilu/qmd");
  }

  if (result.status !== 0) {
    throw new Error(`qmd ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

function qmdVirtualPathToRelative(file: string): string | undefined {
  const prefix = `qmd://${COLLECTION}/`;
  if (!file.startsWith(prefix)) return undefined;
  return decodeURIComponent(file.slice(prefix.length));
}

function normalizeQmdLookupPath(file: string): string {
  return file.toLowerCase().replace(/_/g, "-");
}

function lineRangeFromSnippet(snippet: string): { lineStart: number; lineEnd: number } | undefined {
  const match = snippet.match(/^@@\s+-(\d+),(\d+)\s+@@/);
  if (!match) return undefined;
  const lineStart = Number(match[1]);
  const count = Number(match[2]);
  return { lineStart, lineEnd: lineStart + Math.max(1, count) - 1 };
}

function cleanQmdSnippet(snippet: string): string {
  return snippet
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("@@ "))
    .join("\n")
    .trim();
}

async function snippetFromOriginalBody(document: IndexedDocument, query: string): Promise<{ lineStart: number; lineEnd: number; snippet: string }> {
  const text = await readFile(document.absolutePath, "utf8");
  const lines = text.split(/\r?\n/);
  const bodyIndex = Math.max(0, document.bodyStartLine - 1);
  const center = bestBodyLineIndex(lines, bodyIndex, query);
  return neighborSnippetFromLines(lines, bodyIndex, center + 1, center + 1);
}

async function neighborSnippetFromOriginal(document: IndexedDocument, lineStart: number, lineEnd: number | undefined): Promise<{ lineStart: number; lineEnd: number; snippet: string }> {
  const text = await readFile(document.absolutePath, "utf8");
  const lines = text.split(/\r?\n/);
  const bodyIndex = Math.max(0, document.bodyStartLine - 1);
  return neighborSnippetFromLines(lines, bodyIndex, lineStart, lineEnd ?? lineStart);
}

function neighborSnippetFromLines(lines: string[], bodyIndex: number, lineStart: number, lineEnd: number): { lineStart: number; lineEnd: number; snippet: string } {
  const start = Math.max(bodyIndex, lineStart - 2);
  const end = Math.min(lines.length - 1, lineEnd + 6);
  return {
    lineStart: start + 1,
    lineEnd: end + 1,
    snippet: boundedSnippet(lines.slice(start, end + 1).join("\n")),
  };
}

function bestBodyLineIndex(lines: string[], bodyIndex: number, query: string): number {
  const terms = expandedQueryTerms(query);
  const phrases = salientAdjacentQueries(query).slice(0, 8);
  let bestIndex = bodyIndex;
  let bestScore = 0;

  for (let index = bodyIndex; index < lines.length; index += 1) {
    const line = lines[index].toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (line.includes(term)) score += queryTermWeight(term);
    }
    for (const phrase of phrases) {
      if (line.includes(phrase)) score += 4;
    }
    if (/^#{1,6}\s/.test(lines[index])) score *= 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function looksLikeUnhelpfulSnippet(snippet: string): boolean {
  const trimmed = snippet.trim();
  if (!trimmed) return true;
  if (looksLikeFrontmatterOnly(trimmed)) return true;
  if (/##\s+Assistant\s*$/.test(trimmed)) return true;

  const withoutHeadings = trimmed
    .split(/\s*#{1,6}\s+[A-Za-z][^#]*?/)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutHeadings.length === 0;
}

function looksLikeFrontmatterOnly(snippet: string): boolean {
  return /(^|\s)(source|question_id|session_id|date|question_type):\s/.test(snippet) && !/\b(User|Assistant|Note)\b/i.test(snippet);
}

function qmdLexQueries(value: string): string[] {
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

function expandedQueryTerms(value: string): string[] {
  const expanded = new Set<string>();
  for (const token of tokenize(value)) {
    expanded.add(token);
    if (token.length > 4 && token.endsWith("ies")) expanded.add(`${token.slice(0, -3)}y`);
    else if (token.length > 4 && token.endsWith("s")) expanded.add(token.slice(0, -1));
  }
  return [...expanded];
}

function salientAdjacentQueries(value: string): string[] {
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

function queryTermWeight(term: string): number {
  if (LOW_VALUE_QUERY_TERMS.has(term)) return 0.2;
  if (term.length >= 8) return 3;
  if (term.length >= 5) return 2;
  return 1;
}

export const qmdIndexInternalsForTests = {
  normalizeQmdLookupPath,
  qmdLexQueries,
  qmdRetrievalMode,
  looksLikeUnhelpfulSnippet,
};

function tokenize(value: string): string[] {
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

function exactBoost(query: string, text: string): number {
  const lower = text.toLowerCase();
  const tokens = tokenize(query);
  const rareMatches = tokens.filter((token) => token.length >= 5 && lower.includes(token)).length;
  const phraseBoost = lower.includes(query.toLowerCase()) ? 0.25 : 0;
  return Math.min(0.35, phraseBoost + rareMatches * 0.03);
}

function metadataBoostFor(query: string, metadata: Record<string, unknown>): number {
  const haystack = Object.values(metadata).flat().join(" ").toLowerCase();
  const matches = tokenize(query).filter((token) => haystack.includes(token)).length;
  return Math.min(0.15, matches * 0.03);
}

function temporalBoostFor(query: string, metadata: Record<string, unknown>, stats: { min: number; max: number } | undefined): number {
  const time = documentTime(metadata);
  if (!stats || time === undefined) return 0;
  const tokens = new Set(tokenize(query));
  const wantsRecent = ["recent", "latest", "newest", "after"].some((token) => tokens.has(token));
  const wantsOld = ["oldest", "first", "earliest", "before"].some((token) => tokens.has(token));
  if (!wantsRecent && !wantsOld) return 0;
  if (stats.max === stats.min) return 0.05;
  const recency = (time - stats.min) / (stats.max - stats.min);
  const directional = wantsOld ? 1 - recency : recency;
  return Math.max(0, Math.min(0.12, directional * 0.12));
}

function memoryStrengthBoost(metadata: Record<string, unknown>): number {
  const type = String(metadata.type ?? metadata.question_type ?? "").toLowerCase();
  const confidence = Number(metadata.confidence);
  const typeBoost = ["decision", "preference", "finding", "fact"].includes(type) ? 0.05 : 0;
  const confidenceBoost = Number.isFinite(confidence) ? Math.max(0, Math.min(0.05, confidence * 0.05)) : 0;
  return typeBoost + confidenceBoost;
}

function provenanceConfidenceBoost(provenance: SearchResult["provenance"]): number {
  let boost = 0;
  if (provenance.file) boost += 0.02;
  if (provenance.lineStart > 0 && provenance.lineEnd >= provenance.lineStart) boost += 0.02;
  if (provenance.sessionId) boost += 0.03;
  return boost;
}

function dateStats(documents: IndexedDocument[]): { min: number; max: number } | undefined {
  const times = documents.map((document) => documentTime(document.frontmatter)).filter((time): time is number => time !== undefined);
  if (times.length === 0) return undefined;
  return { min: Math.min(...times), max: Math.max(...times) };
}

function documentTime(metadata: Record<string, unknown>): number | undefined {
  const value = metadata.updated_at ?? metadata.created_at ?? metadata.date;
  if (!value) return undefined;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : undefined;
}

function boundedSnippet(text: string, maxLength = 500): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}…`;
}

function stableResultId(file: string, lineStart: number, snippet: string): string {
  return Buffer.from(`${file}:${lineStart}:${snippet}`).toString("base64url").slice(0, 24);
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}
