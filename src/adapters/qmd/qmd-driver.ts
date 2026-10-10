import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { configuredIndexingPolicy, indexingPolicy, indexingPolicyMatches } from "../../core/memory-root/index.js";
import { qmdReadiness, recordQmdFailure, recoverQmdPublication, updateQmdGeneration, withQmdLock } from "./qmd-lifecycle.js";
import { withSessionAliases } from "../../core/provenance.js";
import type { IndexManifest, IndexMemoryOptions, IndexingPolicy, IndexedDocument, MarkdownDocument, RetrievalDepth, RetrievalOutcome, ScoreBreakdown, SearchResult } from "../../types.js";
import { QMD_DREAM_COLLECTION, manifestPath, normalizeQmdLookupPath, resolveQmdSdk } from "./qmd-cli.js";
import { qmdLexQueries, searchWithQmdCli } from "./qmd-query.js";
import {
  clampScore,
  dateStats,
  diversifyResults,
  dreamRelevance,
  groupResultsByFile,
  exactBoost,
  isExactTitleMatch,
  titleMatchBoostFor,
  memoryStrengthBoost,
  metadataBoostFor,
  provenanceConfidenceBoost,
  round,
  temporalBoostFor,
} from "./qmd-ranking.js";
import { depthPolicyFor, dreamBoostFor, isDreamDocument, isSourceFocusedQuery, normalizeRetrievalDepth } from "../../core/retrieval-policy/index.js";
import {
  excerptFromQmdWindow,
  looksLikeUnhelpfulSnippet,
  neighborSnippetFromOriginal,
  snippetFromOriginalBody,
} from "./qmd-snippets.js";

export { derivedRoot, manifestPath } from "./qmd-cli.js";

const INDEX_VERSION = 1;

export interface QmdManifest extends IndexManifest {
  dreamCollection?: typeof QMD_DREAM_COLLECTION;
  generation?: string;
  policy?: IndexingPolicy;
  embedding?: { state: "complete" | "disabled"; modelHash?: string; pending?: number };
  modelStat?: { size: number; mtimeMs: number; ctimeMs?: number };
  sources?: Array<{ file: string; size: number; mtimeMs: number; ctimeMs: number }>;
}

export async function buildQmdIndex(root: string, documents: MarkdownDocument[], options: IndexMemoryOptions & { sourceRoot?: string } = {}): Promise<QmdManifest & { work?: import("./qmd-worker.js").WorkerWork }> {
  return withQmdLock(root, async () => {
    try {
      const legacy = truthy(process.env.JUMPYBRAIN_QMD_EMBED)
        ? { mode: "semantic" as const, model: process.env.QMD_EMBED_MODEL } : undefined;
      const policy = await indexingPolicy(root, options.indexing, legacy);
      const snapshots = [];
      const sources = [];
      for (const doc of documents) {
        const before = await stat(doc.absolutePath);
        const content = await readFile(doc.absolutePath, "utf8");
        const after = await stat(doc.absolutePath);
        if (before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.size !== after.size) throw new Error("Canonical memory changed during snapshot; retry index.");
        const parsed = parseFrontmatter(content);
        snapshots.push({ ...doc, frontmatter: parsed.frontmatter, bodyStartLine: parsed.bodyStartLine, content });
        sources.push({ file: doc.relativePath, size: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs });
      }
      const model = policy.mode === "semantic" ? await stat(policy.model!) : undefined;
      const manifest: QmdManifest = {
        version: INDEX_VERSION, root,
        sourceRoot: options.sourceRoot && options.sourceRoot !== root ? options.sourceRoot : undefined,
        generatedAt: new Date().toISOString(), generation: randomUUID(),
        qmdCollection: "jumpybrain",
        dreamCollection: snapshots.some(isDreamDocument) ? QMD_DREAM_COLLECTION : undefined,
        documents: snapshots.map(toIndexedDocument), sources,
        ...(model ? { modelStat: { size: model.size, mtimeMs: model.mtimeMs, ctimeMs: model.ctimeMs } } : {}),
      };
      const result = await updateQmdGeneration(root, snapshots, manifest, policy, options);
      return { ...result.manifest, work: result.work };
    } catch (error) {
      await recordQmdFailure(root);
      if ((error as NodeJS.ErrnoException).code) throw new Error("Index input or provisioned model is unavailable; check local configuration and retry.");
      throw error;
    }
  });
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

export async function searchQmdIndex(root: string, query: string, limit: number, options: { depth?: RetrievalDepth; outcome?: RetrievalOutcome; inspect?: (manifest: QmdManifest) => Promise<void> } = {}): Promise<SearchResult[]> {
  return withQmdLock(root, async () => {
    resolveQmdSdk();
    await recoverQmdPublication(root);
    return searchGeneration(root, query, limit, options);
  });
}

async function searchGeneration(root: string, query: string, limit: number, options: { depth?: RetrievalDepth; outcome?: RetrievalOutcome; inspect?: (manifest: QmdManifest) => Promise<void> }): Promise<SearchResult[]> {
  const depth = normalizeRetrievalDepth(options.depth);
  const manifest = await loadManifest(root);
  const readiness = await qmdReadiness(root, manifest);
  const policy = await configuredIndexingPolicy(root);
  const compatible = indexingPolicyMatches(policy, manifest.policy, manifest.embedding?.modelHash);
  const model = compatible && readiness.modes.includes("semantic") ? manifest.policy?.model : undefined;
  if (!Number.isFinite(limit) || limit <= 0) { await options.inspect?.(manifest); return []; }
  const documents = documentsByQmdPath(manifest.documents);
  const candidates = await searchWithQmdCli(root, query, Math.min(160, Math.max(limit * 8, 40)), { model, semantic: !!model, outcome: options.outcome });
  if (depth !== "deep" && manifest.dreamCollection === QMD_DREAM_COLLECTION) {
    const supplemental = await searchWithQmdCli(root, query, Math.min(24, Math.max(8, limit * 2)), { dreamsOnly: true, outcome: options.outcome });
    candidates.push(...supplemental.filter((candidate) => {
      const document = candidate.file && (documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file)));
      return document && isDreamDocument(document);
    }));
  }
  // Exact navigation candidates come from already-loaded canonical metadata,
  // independently of QMD's body-heavy cutoff. No extra QMD calls or global reads.
  const candidateFiles = new Set(candidates.flatMap((candidate) => {
    const document = candidate.file && (documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file)));
    return document ? [document.relativePath] : [];
  }));
  const titleDocuments = manifest.documents
    .filter((document) => !candidateFiles.has(document.relativePath) && isExactTitleMatch(query, document))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .slice(0, 24);
  candidates.push(...titleDocuments.map((document) => ({ file: document.relativePath, score: 0 })));
  candidates.sort((a, b) => b.score - a.score);
  const candidateDocuments = matchedCandidateDocuments(candidates, documents);
  const temporalStats = dateStats(candidateDocuments);
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const candidate of candidates) {
    if (!candidate.file) continue;
    const document = documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file));
    if (!document) continue;

    let repaired;
    try {
      repaired = await resultSnippet(document, query, {
        lineStart: candidate.lineStart ?? document.bodyStartLine,
        lineEnd: candidate.lineEnd ?? candidate.lineStart ?? document.bodyStartLine,
        snippet: candidate.snippet ?? "",
      });
    } catch (error) {
      // An index can briefly outlive a deleted/renamed canonical note.
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
      throw error;
    }

    const exactTitle = isExactTitleMatch(query, document);
    if (!repaired.snippet && !exactTitle) continue;
    if (candidate.dreamSupplement && !exactTitle && dreamRelevance(query, repaired.snippet, document.frontmatter, clampScore(candidate.score)) === 0) continue;
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

  const ranked = results.sort((a, b) => b.score - a.score
    || a.provenance.file.localeCompare(b.provenance.file)
    || a.provenance.lineStart - b.provenance.lineStart
    || a.id.localeCompare(b.id));
  // Explicit evidence requests retain chunk-level limits and all original fields.
  const diversityDepth = isSourceFocusedQuery(query) ? "deep" : depth;
  await options.inspect?.(manifest);
  return diversifyResults(groupResultsByFile(ranked, diversityDepth), diversityDepth).slice(0, limit);
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
  if (candidate.lineStart < document.bodyStartLine || (!candidate.snippet && candidate.lineStart === document.bodyStartLine)) {
    const repaired = await snippetFromOriginalBody(document, query);
    if (repaired.snippet) return repaired;
  }
  const expanded = await neighborSnippetFromOriginal(document, candidate.lineStart, candidate.lineEnd, query);
  if (expanded.snippet) return expanded;
  // Keep hits beyond the bounded canonical prefix usable. QMD's window start
  // (not its match-anchor field) owns these fallback source coordinates.
  return excerptFromQmdWindow(candidate.snippet, candidate.lineStart, query);
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
  const titleMatchBoost = titleMatchBoostFor(options.query, options.document);
  const metadataBoost = metadataBoostFor(options.query, options.document.frontmatter);
  const relevance = dreamRelevance(options.query, options.snippet, options.document.frontmatter, clampScore(options.candidateScore));
  const temporalRelevance = temporalBoostFor(options.query, options.document.frontmatter, options.temporalStats, relevance);
  const memoryStrength = memoryStrengthBoost(options.document.frontmatter);
  const provenanceConfidence = provenanceConfidenceBoost(provenance);
  const qmdScore = clampScore(options.candidateScore);
  const depthPolicy = depthPolicyFor(options.document, options.depth);
  // A dream's write time is not the date of the claims it summarizes. Explicit
  // source/date requests also bypass the large shallow page preference for maps.
  if (isDreamDocument(options.document) && isSourceFocusedQuery(options.query)) {
    depthPolicy.boost = Math.min(0.1, depthPolicy.boost);
  }
  const dreamBoost = dreamBoostFor(options.document, options.depth, options.query, relevance);
  const finalScore = qmdScore + exactMatchBoost + titleMatchBoost + metadataBoost + temporalRelevance + memoryStrength + provenanceConfidence + depthPolicy.boost + dreamBoost;

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
      titleMatchBoost: round(titleMatchBoost),
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
