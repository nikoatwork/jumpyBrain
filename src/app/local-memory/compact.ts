import path from "node:path";
import { withQmdOperation, readExecution, executionSignal, checkExecution } from "../../adapters/qmd/index.js";
import { evidenceDate, evidenceInInterval, resolveTemporalQuery } from "../../core/retrieval-policy/temporal.js";
import { hashMemoryDocumentContent, readCanonicalMemoryDocumentById } from "../../core/canonical/markdown-store.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { resolveIndexRoot } from "../../core/memory-root/index.js";
import { compactWrittenDate, excerptMatchesSource, packCompactRecall, type CompactRecallCandidate, type CompactRecallOptions,
  type CompactRecallPacket, type CompactRecallPassage, type ExpansionUnavailableReason } from "../../core/retrieval-policy/compact.js";
import { validatePacketMaxBytes } from "../../core/serialized-budget.js";
import type { Frontmatter, MemoryDocumentReadResult } from "../../types.js";
import { searchMemory } from "./index.js";

export type { CompactRecallOptions, CompactRecallPacket, CompactRecallPassage } from "../../core/retrieval-policy/compact.js";
export { serializeCompactRecall } from "../../core/retrieval-policy/compact.js";

/** Opt-in bounded recall; legacy search ranking, excerpt selection, and full-document reads are unchanged. */
export async function compactSearchMemory(root: string, query: string, limit: number, options: CompactRecallOptions = {}): Promise<CompactRecallPacket> {
  return withQmdOperation(root, "search", options, async () => {
  const interval = resolveTemporalQuery(options.temporal);
  const maxBytes = validatePacketMaxBytes(options.maxBytes);
  if (typeof query !== "string" || !query.trim() || !Number.isSafeInteger(limit) || limit < 1
    || (options.diagnostics !== undefined && typeof options.diagnostics !== "boolean")) {
    throw new Error("Compact recall requires query, a positive integer limit, and boolean diagnostics.");
  }
  const search = await searchMemory(root, query, limit, { depth: options.depth, temporal: options.temporal });
  if (interval && !search.temporal) throw new Error("Temporal search did not return its resolved scope; refresh the runtime before retrying.");
  const sourceRoot = await resolveIndexRoot(search.root);
  type Source = { document: MemoryDocumentReadResult } | { reason: ExpansionUnavailableReason };
  const sources = new Map<string, Promise<Source>>();
  const sourceFor = (id: string): Promise<Source> => {
    let source = sources.get(id);
    if (!source) {
      source = readCanonicalMemoryDocumentById(search.root, id, { guarded: true, signal: executionSignal() }).then((document): Source => {
        // Hashes cover raw bytes. Lossy UTF-8 must not acquire a seemingly valid expansion token.
        return hashMemoryDocumentContent(document.content) === document.contentHash ? { document } : { reason: "invalid_utf8" };
      }).catch((error): Source => {
        checkExecution();
        const code = (error as { code?: string }).code;
        return { reason: code === "duplicate_id" ? "duplicate_id" : code === "missing_id" || code === "precondition_failed"
          ? "source_changed" : "source_unavailable" };
      });
      sources.set(id, source);
    }
    return source;
  };
  const candidates: CompactRecallCandidate[] = [];
  let sourceChanged = false;
  for (const result of search.results) {
    checkExecution();
    const passages: CompactRecallPassage[] = [];
    const seen = new Set<string>();
    let changedPassages = 0;
    for (const evidence of [result, ...(result.passages ?? [])]) {
      const { provenance, snippet } = evidence;
      const key = JSON.stringify([provenance.file, provenance.lineStart, provenance.lineEnd, snippet]);
      if (seen.has(key)) continue;
      seen.add(key);
      const sourcePath = path.resolve(sourceRoot, provenance.file);
      const relative = path.relative(search.root, sourcePath);
      const withinRoot = relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      const passage: CompactRecallPassage = {
        filePath: withinRoot ? relative.split(path.sep).join("/") : provenance.file,
        pathBasis: withinRoot ? "canonical_root" : "index_root",
        startLine: provenance.lineStart, endLine: provenance.lineEnd, text: snippet, scope: "excerpt", partial: true,
        date: compactWrittenDate(provenance.metadata),
        ...(interval ? { evidenceDate: provenance.evidenceDate ?? evidenceDate(provenance.file, provenance.metadata ?? {}),
          relationships: declaredRelationships(provenance.metadata) } : {}),
        expansion: { available: false, reason: "missing_id" },
        ...(options.diagnostics ? { diagnostics: { hitId: result.id, score: result.score,
          ...(result.scoreBreakdown ? { scoreBreakdown: result.scoreBreakdown } : {}),
          ...(provenance.metadata ? { metadata: provenance.metadata } : {}) } } : {}),
      };
      const id = provenance.metadata?.id;
      if (!withinRoot) passage.expansion = { available: false, reason: "outside_canonical_root" };
      else if (id !== undefined && !isValidMemoryDocumentId(id)) passage.expansion = { available: false, reason: "invalid_id" };
      else if (typeof id === "string") {
        const source = await readExecution(sourceFor(id));
        if ("reason" in source) passage.expansion = { available: false, reason: source.reason };
        else if (source.document.file !== passage.filePath) passage.expansion = { available: false, reason: "source_mismatch" };
        else {
          passage.documentId = source.document.id;
          passage.date = compactWrittenDate(source.document.frontmatter);
          if (interval) {
            const currentDate = evidenceDate(provenance.file, source.document.frontmatter);
            if (JSON.stringify(currentDate) !== JSON.stringify(passage.evidenceDate) || !evidenceInInterval(currentDate, interval)) {
              sourceChanged = true;
              changedPassages++;
              continue;
            }
            passage.relationships = declaredRelationships(source.document.frontmatter);
          }
          if (!excerptMatchesSource(snippet, provenance.lineStart, provenance.lineEnd, source.document.content)) {
            passage.expansion = { available: false, reason: "source_changed" };
          } else {
            passage.expansion = { available: true, id: source.document.id, expectedContentHash: source.document.contentHash,
              startLine: provenance.lineStart, endLine: provenance.lineEnd };
          }
        }
      }
      if (interval && !passage.expansion.available && ["source_changed", "source_mismatch"].includes(passage.expansion.reason)) {
        sourceChanged = true;
        changedPassages++;
        continue;
      }
      passages.push(passage);
    }
    candidates.push({ passages, omittedPassages: (result.omittedPassages ?? 0) + changedPassages });
  }
  return packCompactRecall({ query: search.query, depth: search.depth ?? "normal",
    readiness: search.readiness ?? { freshness: "unknown", modes: [], embedding: "unknown" },
    retrieval: sourceChanged ? { status: "partial", warnings: [...new Set([...(search.retrieval?.warnings ?? []), "source_changed"])] }
      : search.retrieval ?? { status: "partial", warnings: ["retrieval_outcome_unavailable"] },
    ...(interval && search.temporal ? { temporal: search.temporal } : {}),
  }, candidates, { maxBytes, diagnostics: options.diagnostics });
  });
}

function declaredRelationships(metadata: Frontmatter = {}): CompactRecallPassage["relationships"] {
  const relationships: NonNullable<CompactRecallPassage["relationships"]> = {};
  for (const key of ["conflicts_with", "supersedes"] as const) {
    const value = metadata[key];
    if (typeof value === "string" || (Array.isArray(value) && value.every(item => typeof item === "string"))) relationships[key] = value;
  }
  return Object.keys(relationships).length ? relationships : undefined;
}
