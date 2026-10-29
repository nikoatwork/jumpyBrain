import { createHash, randomUUID } from "node:crypto";
import { withQmdOperation, readExecution, executionSignal, checkExecution, MemoryExecutionError } from "./qmd-execution.js";
import { readFile, stat } from "node:fs/promises";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { readCanonicalMarkdownIndexInput, type CanonicalMarkdownIndexInput } from "../../core/canonical/index.js";
import { automaticIndexingPolicy, indexingPolicy, indexingPolicyMatches } from "../../core/memory-root/index.js";
import { withReadOnlyQmdGeneration } from "./qmd-read-only.js";
import { assertQmdPublished, qmdReadiness, recordQmdFailure, recoverQmdPublication, updateQmdGeneration, withQmdLock } from "./qmd-lifecycle.js";
import { withSessionAliases } from "../../core/provenance.js";
import { evidenceDate, evidenceInInterval } from "../../core/retrieval-policy/temporal.js";
import type { ExecutionOptions, TemporalRetrieval, TemporalResolution } from "../../types.js";
import type { IndexManifest, IndexMemoryOptions, IndexingPolicy, IndexedDocument, MarkdownDocument, RetrievalDepth, RetrievalOutcome, ScoreBreakdown, SearchResult } from "../../types.js";
import { QMD_DREAM_COLLECTION, manifestPath, normalizeQmdLookupPath, resolveQmdSdk } from "./qmd-cli.js";
import { hasQueryConstraints, hasQueryExclusions, searchWithQmdCli, tokenize, type QmdCandidate } from "./qmd-query.js";
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
import { depthPolicyFor, dreamBoostFor, isDreamDocument, isSourceFocusedQuery, matchesNamedSubject, namedSubjectFor, normalizeRetrievalDepth } from "../../core/retrieval-policy/index.js";
import {
  canonicalPrefixCache,
  type CanonicalPrefix,
  excerptFromQmdWindow,
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

export async function buildQmdIndex(root: string, documents: Array<string | CanonicalMarkdownIndexInput>, options: IndexMemoryOptions & { sourceRoot?: string; persistPolicy?: boolean } = {}): Promise<QmdManifest & { work?: import("./qmd-worker.js").WorkerWork }> {
  return withQmdOperation(root, "index", options, () => withQmdLock(root, async () => {
    try {
      const legacy = truthy(process.env.JUMPYBRAIN_QMD_EMBED)
        ? { mode: "semantic" as const, model: process.env.QMD_EMBED_MODEL } : undefined;
      const policy = options.persistPolicy === false
        ? await readExecution(automaticIndexingPolicy(root))
        : await indexingPolicy(root, options.indexing, legacy);
      const snapshots = [];
      const sources = [];
      for (const doc of documents) {
        checkExecution();
        const snapshot = await readExecution(readCanonicalMarkdownIndexInput(options.sourceRoot ?? root, typeof doc === "string" ? { absolutePath: doc } : doc, executionSignal()));
        if (!snapshot) continue;
        const { sourceStat, ...input } = snapshot;
        snapshots.push(input);
        sources.push({ file: snapshot.relativePath, ...sourceStat });
      }
      const model = policy.mode === "semantic" ? await readExecution(stat(policy.model!)) : undefined;
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
      if (!(error instanceof MemoryExecutionError) && (error as NodeJS.ErrnoException).code) throw new Error("Index input or provisioned model is unavailable; check local configuration and retry.");
      throw error;
    }
  }));
}

export async function loadManifest(root: string): Promise<QmdManifest> {
  try {
    const raw = await readExecution(readFile(manifestPath(root), { encoding: "utf8", signal: executionSignal() }));
    return JSON.parse(raw) as QmdManifest;
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      throw new Error(`Memory index not found at ${manifestPath(root)}. Run: jumpybrain index --root ${JSON.stringify(root)}`);
    }
    throw error;
  }
}

interface SearchOptions extends ExecutionOptions {
  depth?: RetrievalDepth;
  outcome?: RetrievalOutcome;
  temporal?: TemporalRetrieval;
  inspect?: (manifest: QmdManifest) => Promise<void>;
  /** Disable commit-publication recovery for deliberate nonrepairing reads. */
  recover?: boolean;
  readOnly?: boolean;
}
const TEMPORAL_BACKFILL_BUDGET = 64;

export async function searchQmdIndex(root: string, query: string, limit: number, options: SearchOptions = {}): Promise<SearchResult[]> {
  if (options.readOnly) return withQmdOperation(root, "search", options, () =>
    withReadOnlyQmdGeneration(root, () => searchGeneration(root, query, limit, options)));
  return withQmdOperation(root, "search", options, () => withQmdLock(root, async () => {
    resolveQmdSdk();
    if (options.recover !== false) await recoverQmdPublication(root);
    else assertQmdPublished(root);
    return searchGeneration(root, query, limit, options);
  }));
}

async function searchGeneration(root: string, query: string, limit: number, options: SearchOptions): Promise<SearchResult[]> {
  const depth = normalizeRetrievalDepth(options.depth);
  const manifest = await loadManifest(root);
  const readiness = await readExecution(qmdReadiness(root, manifest));
  const policy = await readExecution(automaticIndexingPolicy(root));
  const compatible = indexingPolicyMatches(policy, manifest.policy, manifest.embedding?.modelHash);
  const model = compatible && readiness.modes.includes("semantic") ? manifest.policy?.model : undefined;
  if (!Number.isFinite(limit) || limit <= 0) { await options.inspect?.(manifest); return []; }
  const interval = options.temporal?.interval;
  const warn = (code: string) => {
    if (!options.outcome) return;
    options.outcome.status = "partial";
    if (!options.outcome.warnings.includes(code)) options.outcome.warnings.push(code);
  };
  const eligible = manifest.documents.filter(document => !interval || evidenceInInterval(evidenceDate(document.relativePath, document.frontmatter), interval));
  // Names are lexical relevance hints, never temporal/constraint relaxation.
  // Resolve once against canonical metadata and reuse for admission and ordering.
  const namedSubject = !model && !options.temporal && !hasQueryConstraints(query)
    && !eligible.some(document => isExactTitleMatch(query, document))
    ? namedSubjectFor(query, eligible.map(document => document.frontmatter)) : undefined;
  const documents = documentsByQmdPath(eligible);
  const lookup = (candidate: QmdCandidate) => candidate.file ? documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file)) : undefined;
  // Backend cutoffs still exist; the independent manifest backfill below is what
  // lets in-range evidence outside the ordinary top-k participate in selection.
  const candidates = (await searchWithQmdCli(root, query, Math.min(160, Math.max(limit * 8, 40)), {
    readOnly: options.readOnly, model, semantic: !!model && !options.readOnly, outcome: options.outcome,
    eligible: candidate => !!lookup(candidate),
    allowRelaxation: eligible.length > 0 && !eligible.some(document => isExactTitleMatch(query, document)),
  }));
  if (depth !== "deep" && manifest.dreamCollection === QMD_DREAM_COLLECTION) {
    const supplemental = await searchWithQmdCli(root, query, Math.min(24, Math.max(8, limit * 2)), { readOnly: options.readOnly, dreamsOnly: true, outcome: options.outcome });
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
  const titleDocuments = eligible
    .filter((document) => !hasQueryExclusions(query) && !candidateFiles.has(document.relativePath) && isExactTitleMatch(query, document))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .slice(0, 24);
  candidates.push(...titleDocuments.map((document) => ({ file: document.relativePath, score: 0 })));
  if (options.temporal) {
    for (const doc of titleDocuments) candidateFiles.add(doc.relativePath);
    // Token-only body/title backfill cannot enforce phrases, exclusions or
    // exact identifiers. Never reintroduce a constrained backend rejection.
    const backfill = (hasQueryConstraints(query) ? [] : eligible).filter(doc => !candidateFiles.has(doc.relativePath))
      .sort((a, b) => titleMatchBoostFor(query, b) - titleMatchBoostFor(query, a) || comparePath(a.relativePath, b.relativePath))
      .slice(0, TEMPORAL_BACKFILL_BUDGET);
    candidates.push(...backfill.map(doc => ({ file: doc.relativePath, score: 0, temporalBackfill: true })));
    const excluded = manifest.documents.filter(doc => !documents.has(doc.relativePath))
      .map(doc => evidenceDate(doc.relativePath, doc.frontmatter));
    Object.assign(options.temporal.coverage, {
      eligibleDocuments: eligible.length,
      excludedUndated: excluded.filter(date => date.basis === "unknown" && date.reason !== "invalid").length,
      excludedInvalid: excluded.filter(date => date.basis === "unknown" && date.reason === "invalid").length,
      backfillBudget: TEMPORAL_BACKFILL_BUDGET, backfilledDocuments: backfill.length,
      unvisitedDocuments: Math.max(0, eligible.length - candidateFiles.size - backfill.length),
    });
    warn("temporal_bounded_discovery");
    if (options.temporal.coverage.unvisitedDocuments) warn("temporal_candidate_budget_exhausted");
    if (options.temporal.coverage.excludedUndated) warn("temporal_undated_excluded");
    if (options.temporal.coverage.excludedInvalid) warn("temporal_invalid_dates_excluded");
  }
  if (namedSubject) {
    const namedDocuments = eligible
      .filter(document => !candidateFiles.has(document.relativePath) && matchesNamedSubject(document.frontmatter, namedSubject))
      .sort((a, b) => comparePath(a.relativePath, b.relativePath))
      .slice(0, 8);
    // Preserve every original candidate and its score. Supplemental documents
    // use the existing bounded source repair and provenance path below.
    candidates.push(...namedDocuments.map(document => ({ file: document.relativePath, score: 0 })));
  }
  candidates.sort((a, b) => b.score - a.score);
  const candidateDocuments = matchedCandidateDocuments(candidates, documents);
  const temporalStats = dateStats(candidateDocuments);
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  const prefix = canonicalPrefixCache();

  for (const candidate of candidates) {
    checkExecution();
    if (!candidate.file) continue;
    const document = documents.get(candidate.file) ?? documents.get(normalizeQmdLookupPath(candidate.file));
    if (!document) continue;

    let repaired;
    try {
      const source = await readExecution(prefix(document.absolutePath));
      if (interval) {
        const text = source.lines.join("\n");
        // An opened-but-unclosed header (short or beyond our prefix) must not
        // masquerade as a metadata-free journal eligible through its filename.
        const parsed = parseFrontmatter(text);
        if ((source.lines[0]?.trim() === "---" && parsed.bodyStartLine === 1)
          || parsed.bodyStartLine !== document.bodyStartLine
          || JSON.stringify(parsed.frontmatter) !== JSON.stringify(document.frontmatter)) {
          warn("source_changed");
          continue;
        }
      }
      repaired = await resultSnippet(document, query, {
        lineStart: candidate.lineStart ?? document.bodyStartLine,
        lineEnd: candidate.lineEnd ?? candidate.lineStart ?? document.bodyStartLine,
        snippet: candidate.snippet ?? "",
      }, source);
    } catch (error) {
      // An index can briefly outlive a deleted/renamed canonical note.
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) { if (interval) warn("source_changed"); continue; }
      throw error;
    }

    const exactTitle = isExactTitleMatch(query, document);
    if (!repaired.snippet && !exactTitle) continue;
    if (candidate.temporalBackfill && !exactTitle && !backfillRelevant(query, repaired.snippet, document)) continue;
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
      interval,
    }));
  }

  const ranked = results.sort((a, b) => b.score - a.score
    || a.provenance.file.localeCompare(b.provenance.file)
    || a.provenance.lineStart - b.provenance.lineStart
    || a.id.localeCompare(b.id));
  // Explicit evidence requests retain chunk-level limits and all original fields.
  const diversityDepth = isSourceFocusedQuery(query) ? "deep" : depth;
  await options.inspect?.(manifest);
  const grouped = groupResultsByFile(ranked, diversityDepth);
  const namedMatch = (result: SearchResult) => !!namedSubject
    && matchesNamedSubject(documents.get(result.provenance.file)!.frontmatter, namedSubject);
  const pool = namedSubject ? grouped.slice(0, 40) : [];
  const ordered = namedSubject
    ? [...pool.filter(namedMatch), ...pool.filter(result => !namedMatch(result)), ...grouped.slice(40)]
    : grouped;
  // Explicit history keeps declared conflicts/updates even when snippets echo a map.
  const selected = (interval ? ordered : diversifyResults(ordered, diversityDepth)).slice(0, limit);
  // Selection is relevance-first; chronology is a presentation of that same set.
  if (interval?.order === "chronological") selected.sort((a, b) => {
    const time = (hit: SearchResult) => {
      const date = hit.provenance.evidenceDate;
      return date && date.basis !== "unknown" ? Date.parse(date.value) : Infinity;
    };
    return time(a) - time(b) || comparePath(a.provenance.file, b.provenance.file)
      || a.provenance.lineStart - b.provenance.lineStart || comparePath(a.id, b.id);
  });
  return selected;
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
  source?: CanonicalPrefix,
): Promise<{ lineStart: number; lineEnd: number; snippet: string }> {
  if (candidate.lineStart < document.bodyStartLine || (!candidate.snippet && candidate.lineStart === document.bodyStartLine)) {
    const repaired = await snippetFromOriginalBody(document, query, source);
    if (repaired.snippet) return repaired;
  }
  const expanded = await neighborSnippetFromOriginal(document, candidate.lineStart, candidate.lineEnd, query, source);
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
  interval?: TemporalResolution;
}): SearchResult {
  const provenance = withSessionAliases({
    file: options.document.relativePath,
    lineStart: options.lineStart,
    lineEnd: options.lineEnd,
    metadata: options.document.frontmatter,
    ...(options.interval ? { evidenceDate: evidenceDate(options.document.relativePath, options.document.frontmatter) } : {}),
  });
  const exactMatchBoost = exactBoost(options.query, options.snippet);
  const titleMatchBoost = titleMatchBoostFor(options.query, options.document);
  const metadataBoost = metadataBoostFor(options.query, options.document.frontmatter);
  const relevance = dreamRelevance(options.query, options.snippet, options.document.frontmatter, clampScore(options.candidateScore));
  const temporalRelevance = options.interval ? 0 : temporalBoostFor(options.query, options.document.frontmatter, options.temporalStats, relevance);
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

function backfillRelevant(query: string, snippet: string, document: IndexedDocument): boolean {
  const terms = [...new Set(tokenize(query))];
  const words = new Set(tokenize(`${document.frontmatter.title ?? ""} ${snippet}`));
  // This branch has no backend relevance evidence. Require every meaningful
  // query token rather than letting a generic word (e.g. "map") admit a different topic.
  return terms.length > 0 && terms.every(term => words.has(term));
}

function comparePath(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function stableResultId(file: string, lineStart: number, snippet: string): string {
  return createHash("sha256").update(`${file}:${lineStart}:${snippet}`).digest("hex").slice(0, 24);
}

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}
