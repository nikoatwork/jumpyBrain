import { createHash } from "node:crypto";
import path from "node:path";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { withSessionAliases } from "../../core/provenance.js";
import type { IndexManifest, IndexedDocument, MarkdownDocument, RetrievalDepth, ScoreBreakdown, SearchResult } from "../../types.js";
import { QMD_DREAM_COLLECTION, derivedRoot, manifestPath, normalizeQmdLookupPath, rebuildQmdCliCollection } from "./qmd-cli.js";
import { qmdLexQueries, searchWithQmdCli } from "./qmd-query.js";
import {
  clampScore,
  dateStats,
  diversifyResults,
  dreamRelevance,
  exactBoost,
  memoryStrengthBoost,
  metadataBoostFor,
  provenanceConfidenceBoost,
  round,
  temporalBoostFor,
} from "./qmd-ranking.js";
import { depthPolicyFor, dreamBoostFor, isDreamDocument, isSourceFocusedQuery, normalizeRetrievalDepth } from "../../core/retrieval-policy/index.js";
import {
  boundedSnippet,
  cleanQmdSnippet,
  looksLikeUnhelpfulSnippet,
  neighborSnippetFromOriginal,
  snippetFromOriginalBody,
} from "./qmd-snippets.js";

export { derivedRoot, manifestPath } from "./qmd-cli.js";

const INDEX_VERSION = 1;

export interface QmdManifest extends IndexManifest {
  dreamCollection?: typeof QMD_DREAM_COLLECTION;
}

export async function buildQmdIndex(root: string, documents: MarkdownDocument[], options: { sourceRoot?: string } = {}): Promise<IndexManifest> {
  await mkdir(derivedRoot(root), { recursive: true });

  const dreamRoot = await stageDreamDocuments(root, documents);
  const manifest: QmdManifest = {
    version: INDEX_VERSION,
    root,
    sourceRoot: options.sourceRoot && options.sourceRoot !== root ? options.sourceRoot : undefined,
    generatedAt: new Date().toISOString(),
    qmdCollection: "jumpybrain",
    dreamCollection: dreamRoot ? QMD_DREAM_COLLECTION : undefined,
    documents: documents.map(toIndexedDocument),
  };

  await writeFile(manifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rebuildQmdCliCollection(root, { embed: truthy(process.env.JUMPYBRAIN_QMD_EMBED), sourceRoot: options.sourceRoot, dreamRoot });

  return manifest;
}

export async function loadManifest(root: string): Promise<QmdManifest> {
  try {
    const raw = await readFile(manifestPath(root), "utf8");
    return JSON.parse(raw) as QmdManifest;
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      throw new Error(`Memory index not found at ${manifestPath(root)}. Run: jumpybrain index --root ${JSON.stringify(root)}`);
    }
    throw error;
  }
}

export async function searchQmdIndex(root: string, query: string, limit: number, options: { depth?: RetrievalDepth } = {}): Promise<SearchResult[]> {
  const depth = normalizeRetrievalDepth(options.depth);
  const manifest = await loadManifest(root);
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const documents = documentsByQmdPath(manifest.documents);
  const candidates = await searchWithQmdCli(root, query, Math.min(160, Math.max(limit * 8, 40)));
  if (depth !== "deep" && manifest.dreamCollection === QMD_DREAM_COLLECTION) {
    const supplemental = await searchWithQmdCli(root, query, Math.min(24, Math.max(8, limit * 2)), { dreamsOnly: true });
    candidates.push(...supplemental.filter((candidate) => {
      const document = candidate.file && (documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file)));
      return document && isDreamDocument(document);
    }));
  }
  candidates.sort((a, b) => b.score - a.score);
  const candidateDocuments = matchedCandidateDocuments(candidates, documents);
  const temporalStats = dateStats(candidateDocuments);
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

    if (!repaired.snippet) continue;
    if (candidate.dreamSupplement && dreamRelevance(query, repaired.snippet, document.frontmatter, clampScore(candidate.score)) === 0) continue;
    const id = `qmd-${stableResultId(document.relativePath, repaired.lineStart, repaired.snippet)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    results.push(toSearchResult({
      candidateScore: candidate.score,
      depth,
      document,
      id,
      lineStart: repaired.lineStart,
      lineEnd: repaired.lineEnd,
      query,
      snippet: repaired.snippet,
      temporalStats,
    }));
  }

  return diversifyResults(results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), isSourceFocusedQuery(query) ? "deep" : depth).slice(0, limit);
}

/** Copies are derived snapshots; all result provenance still addresses originals. */
async function stageDreamDocuments(root: string, documents: MarkdownDocument[]): Promise<string | undefined> {
  const staging = path.join(derivedRoot(root), "qmd-dreams");
  await rm(staging, { recursive: true, force: true });
  const dreams = documents.filter(isDreamDocument);
  if (!dreams.length) return undefined;
  for (const document of dreams) {
    const destination = path.resolve(staging, document.relativePath);
    const relative = path.relative(path.resolve(staging), destination);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid dream document path");
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(document.absolutePath, destination);
  }
  return staging;
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

function matchedCandidateDocuments(candidates: Array<{ file?: string }>, documents: Map<string, IndexedDocument>): IndexedDocument[] {
  const matched = new Map<string, IndexedDocument>();
  for (const candidate of candidates) {
    if (!candidate.file) continue;
    const document = documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file));
    if (document) matched.set(document.relativePath, document);
  }
  return [...matched.values()];
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
    if (expanded.snippet) {
      lineStart = expanded.lineStart;
      lineEnd = expanded.lineEnd;
      snippet = expanded.snippet;
    }
  }

  return { lineStart, lineEnd, snippet };
}

function toSearchResult(options: {
  candidateScore: number;
  depth: RetrievalDepth;
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
  const depthPolicy = depthPolicyFor(options.document, options.depth);
  // A dream's write time is not the date of the claims it summarizes. Explicit
  // source/date requests also bypass the large shallow page preference for maps.
  if (isDreamDocument(options.document) && isSourceFocusedQuery(options.query)) {
    depthPolicy.boost = Math.min(0.1, depthPolicy.boost);
  }
  const dreamBoost = dreamBoostFor(options.document, options.depth, options.query,
    dreamRelevance(options.query, options.snippet, options.document.frontmatter, qmdScore));
  const finalScore = qmdScore + exactMatchBoost + metadataBoost + temporalRelevance + memoryStrength + provenanceConfidence + depthPolicy.boost + dreamBoost;

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
      depthPolicyBoost: round(depthPolicy.boost),
      dreamBoost: round(dreamBoost),
      retrievalDepth: options.depth,
      finalScore: round(finalScore),
      driver: `qmd-cli:${depthPolicy.bucket}`,
    } satisfies ScoreBreakdown,
  };
}

function stableResultId(file: string, lineStart: number, snippet: string): string {
  return createHash("sha256").update(`${file}:${lineStart}:${snippet}`).digest("hex").slice(0, 24);
}

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export const qmdIndexInternalsForTests = {
  normalizeQmdLookupPath,
  qmdLexQueries,
  looksLikeUnhelpfulSnippet,
  dateStats,
  temporalBoostFor,
};
