import path from "node:path";
import { hashMemoryDocumentContent, readCanonicalMemoryDocumentById } from "../../core/canonical/markdown-store.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { resolveIndexRoot } from "../../core/memory-root/index.js";
import { compactWrittenDate, excerptMatchesSource, packCompactRecall, type CompactRecallCandidate, type CompactRecallOptions,
  type CompactRecallPacket, type CompactRecallPassage, type ExpansionUnavailableReason } from "../../core/retrieval-policy/compact.js";
import { validatePacketMaxBytes } from "../../core/serialized-budget.js";
import type { MemoryDocumentReadResult } from "../../types.js";
import { searchMemory } from "./index.js";

export type { CompactRecallOptions, CompactRecallPacket, CompactRecallPassage } from "../../core/retrieval-policy/compact.js";
export { serializeCompactRecall } from "../../core/retrieval-policy/compact.js";

/** Opt-in bounded recall; legacy search ranking, excerpt selection, and full-document reads are unchanged. */
export async function compactSearchMemory(root: string, query: string, limit: number, options: CompactRecallOptions = {}): Promise<CompactRecallPacket> {
  const maxBytes = validatePacketMaxBytes(options.maxBytes);
  if (typeof query !== "string" || !query.trim() || !Number.isSafeInteger(limit) || limit < 1
    || (options.diagnostics !== undefined && typeof options.diagnostics !== "boolean")) {
    throw new Error("Compact recall requires query, a positive integer limit, and boolean diagnostics.");
  }
  const search = await searchMemory(root, query, limit, { depth: options.depth });
  const sourceRoot = await resolveIndexRoot(search.root);
  type Source = { document: MemoryDocumentReadResult } | { reason: ExpansionUnavailableReason };
  const sources = new Map<string, Promise<Source>>();
  const sourceFor = (id: string): Promise<Source> => {
    let source = sources.get(id);
    if (!source) {
      source = readCanonicalMemoryDocumentById(search.root, id, { guarded: true }).then((document): Source => {
        // Hashes cover raw bytes. Lossy UTF-8 must not acquire a seemingly valid expansion token.
        return hashMemoryDocumentContent(document.content) === document.contentHash ? { document } : { reason: "invalid_utf8" };
      }).catch((error): Source => {
        const code = (error as { code?: string }).code;
        return { reason: code === "duplicate_id" ? "duplicate_id" : code === "missing_id" || code === "precondition_failed"
          ? "source_changed" : "source_unavailable" };
      });
      sources.set(id, source);
    }
    return source;
  };
  const candidates: CompactRecallCandidate[] = [];
  for (const result of search.results) {
    const passages: CompactRecallPassage[] = [];
    const seen = new Set<string>();
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
        expansion: { available: false, reason: "missing_id" },
        ...(options.diagnostics ? { diagnostics: { hitId: result.id, score: result.score,
          ...(result.scoreBreakdown ? { scoreBreakdown: result.scoreBreakdown } : {}),
          ...(provenance.metadata ? { metadata: provenance.metadata } : {}) } } : {}),
      };
      const id = provenance.metadata?.id;
      if (!withinRoot) passage.expansion = { available: false, reason: "outside_canonical_root" };
      else if (id !== undefined && !isValidMemoryDocumentId(id)) passage.expansion = { available: false, reason: "invalid_id" };
      else if (typeof id === "string") {
        const source = await sourceFor(id);
        if ("reason" in source) passage.expansion = { available: false, reason: source.reason };
        else if (source.document.file !== passage.filePath) passage.expansion = { available: false, reason: "source_mismatch" };
        else {
          passage.documentId = source.document.id;
          passage.date = compactWrittenDate(source.document.frontmatter);
          if (!excerptMatchesSource(snippet, provenance.lineStart, provenance.lineEnd, source.document.content)) {
            passage.expansion = { available: false, reason: "source_changed" };
          } else {
            passage.expansion = { available: true, id: source.document.id, expectedContentHash: source.document.contentHash,
              startLine: provenance.lineStart, endLine: provenance.lineEnd };
          }
        }
      }
      passages.push(passage);
    }
    candidates.push({ passages, omittedPassages: result.omittedPassages });
  }
  return packCompactRecall({ query: search.query, depth: search.depth ?? "normal",
    readiness: search.readiness ?? { freshness: "unknown", modes: [], embedding: "unknown" },
    retrieval: search.retrieval ?? { status: "partial", warnings: ["retrieval_outcome_unavailable"] },
  }, candidates, { maxBytes, diagnostics: options.diagnostics });
}
