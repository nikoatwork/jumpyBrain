import { mkdir, readFile, writeFile } from "node:fs/promises";
import { withSessionAliases } from "../canonical/provenance.js";
import type { IndexManifest, IndexedDocument, MarkdownDocument, SearchResult } from "../types.js";
import { derivedRoot, manifestPath, normalizeQmdLookupPath, rebuildQmdCliCollection } from "./qmd-cli.js";
import { qmdLexQueries, searchWithQmdCli } from "./qmd-query.js";
import {
  clampScore,
  dateStats,
  exactBoost,
  memoryStrengthBoost,
  metadataBoostFor,
  provenanceConfidenceBoost,
  round,
  temporalBoostFor,
} from "./qmd-ranking.js";
import {
  boundedSnippet,
  cleanQmdSnippet,
  looksLikeUnhelpfulSnippet,
  neighborSnippetFromOriginal,
  snippetFromOriginalBody,
} from "./qmd-snippets.js";

export { derivedRoot, manifestPath } from "./qmd-cli.js";

const INDEX_VERSION = 1;

export async function buildQmdIndex(root: string, documents: MarkdownDocument[]): Promise<IndexManifest> {
  await mkdir(derivedRoot(root), { recursive: true });

  const manifest: IndexManifest = {
    version: INDEX_VERSION,
    root,
    generatedAt: new Date().toISOString(),
    qmdCollection: "jumpybrain",
    documents: documents.map(toIndexedDocument),
  };

  await writeFile(manifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rebuildQmdCliCollection(root, { embed: truthy(process.env.JUMPYBRAIN_QMD_EMBED) });

  return manifest;
}

export async function loadManifest(root: string): Promise<IndexManifest> {
  try {
    const raw = await readFile(manifestPath(root), "utf8");
    return JSON.parse(raw) as IndexManifest;
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      throw new Error(`Memory index not found at ${manifestPath(root)}. Run: jumpybrain index --root ${JSON.stringify(root)}`);
    }
    throw error;
  }
}

export async function searchQmdIndex(root: string, query: string, limit: number): Promise<SearchResult[]> {
  const manifest = await loadManifest(root);
  const candidates = await searchWithQmdCli(root, query, Math.max(limit * 4, 20));
  const documents = documentsByQmdPath(manifest.documents);
  const temporalStats = dateStats(manifest.documents);
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const candidate of candidates) {
    if (!candidate.file) continue;
    const document = documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file));
    if (!document) continue;

    const repaired = await resultSnippet(document, query, {
      lineStart: candidate.lineStart ?? document.bodyStartLine,
      lineEnd: candidate.lineEnd ?? candidate.lineStart ?? document.bodyStartLine,
      snippet: candidate.snippet ?? "",
    });

    const id = `qmd-${stableResultId(candidate.file, repaired.lineStart, repaired.snippet)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    results.push(toSearchResult({
      candidateScore: candidate.score,
      document,
      id,
      lineStart: repaired.lineStart,
      lineEnd: repaired.lineEnd,
      query,
      snippet: repaired.snippet,
      temporalStats,
    }));
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

function documentsByQmdPath(documents: IndexedDocument[]): Map<string, IndexedDocument> {
  const byFile = new Map<string, IndexedDocument>();
  for (const document of documents) {
    byFile.set(document.relativePath, document);
    byFile.set(normalizeQmdLookupPath(document.relativePath), document);
  }
  return byFile;
}

async function resultSnippet(
  document: IndexedDocument,
  query: string,
  candidate: { lineStart: number; lineEnd: number; snippet: string },
): Promise<{ lineStart: number; lineEnd: number; snippet: string }> {
  let lineStart = candidate.lineStart;
  let lineEnd = candidate.lineEnd;
  let snippet = boundedSnippet(cleanQmdSnippet(candidate.snippet));

  if (lineStart < document.bodyStartLine || looksLikeUnhelpfulSnippet(snippet)) {
    return snippetFromOriginalBody(document, query);
  }

  if (snippet.length < 180) {
    const expanded = await neighborSnippetFromOriginal(document, lineStart, lineEnd);
    lineStart = expanded.lineStart;
    lineEnd = expanded.lineEnd;
    snippet = expanded.snippet;
  }

  return { lineStart, lineEnd, snippet };
}

function toSearchResult(options: {
  candidateScore: number;
  document: IndexedDocument;
  id: string;
  lineStart: number;
  lineEnd: number;
  query: string;
  snippet: string;
  temporalStats: { min: number; max: number } | undefined;
}): SearchResult {
  const provenance = withSessionAliases({
    file: options.document.relativePath,
    lineStart: options.lineStart,
    lineEnd: options.lineEnd,
    metadata: options.document.frontmatter,
  });
  const exactMatchBoost = exactBoost(options.query, options.snippet);
  const metadataBoost = metadataBoostFor(options.query, options.document.frontmatter);
  const temporalRelevance = temporalBoostFor(options.query, options.document.frontmatter, options.temporalStats);
  const memoryStrength = memoryStrengthBoost(options.document.frontmatter);
  const provenanceConfidence = provenanceConfidenceBoost(provenance);
  const qmdScore = clampScore(options.candidateScore);
  const finalScore = qmdScore + exactMatchBoost + metadataBoost + temporalRelevance + memoryStrength + provenanceConfidence;

  return {
    id: options.id,
    score: round(finalScore),
    snippet: options.snippet,
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
  };
}

function stableResultId(file: string, lineStart: number, snippet: string): string {
  return Buffer.from(`${file}:${lineStart}:${snippet}`).toString("base64url").slice(0, 24);
}

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export const qmdIndexInternalsForTests = {
  normalizeQmdLookupPath,
  qmdLexQueries,
  looksLikeUnhelpfulSnippet,
};
