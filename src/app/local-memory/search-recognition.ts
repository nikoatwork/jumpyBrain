import path from "node:path";
import { readBoundedCanonicalSource } from "../../core/canonical/markdown-store.js";
import { metadataDate } from "../../core/canonical/metadata-date.js";
import { parseFrontmatter } from "../../core/frontmatter.js";
import { currentMemoryEditor } from "../../core/contribution.js";
import { matchesRecognition, RECOGNITION_CANDIDATE_LIMIT } from "../../core/search-recognition.js";
import { resolveIndexRoot } from "../../core/memory-root/index.js";
import type { SearchResult, SearchRecognitionOptions, SearchRecognitionScope, SearchRecognitionMetadata } from "../../types.js";

/** Bounded targeted reads, not per-result HTTP requests or an extra corpus scan. */
export async function recognizeSearchResults(root: string, hits: SearchResult[], limit: number, options: SearchRecognitionOptions, signal?: AbortSignal) {
  const sourceRoot = await resolveIndexRoot(root);
  const results: SearchResult[] = [];
  const read = new Map<string, SearchRecognitionMetadata>();
  let remaining = 8 * 1024 * 1024, unavailable = 0;
  for (const hit of hits.slice(0, RECOGNITION_CANDIDATE_LIMIT)) {
    signal?.throwIfAborted();
    let metadata = read.get(hit.provenance.file);
    if (!metadata) {
      metadata = { metadataStatus: "unavailable" };
      try {
        if (remaining <= 0) throw new Error("Read budget exhausted");
        const absolute = path.resolve(sourceRoot, hit.provenance.file);
        const relative = path.relative(root, absolute);
        if (!/^(notes|pages|findings|decisions|preferences|sessions)\//.test(relative.split(path.sep).join("/"))) throw new Error("Outside canonical buckets");
        const bytes = await readBoundedCanonicalSource(root, absolute, Math.min(remaining, 1024 * 1024));
        remaining -= bytes.length;
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const { frontmatter, body } = parseFrontmatter(content);
        if (frontmatter.id !== hit.provenance.metadata?.id || frontmatter.title !== hit.provenance.metadata?.title) throw new Error("Changed identity/title");
        metadata = { metadataStatus: "current", updatedAt: metadataDate(frontmatter.updated_at) ?? metadataDate(frontmatter.updatedAt),
          createdAt: metadataDate(frontmatter.created_at) ?? metadataDate(frontmatter.createdAt), editor: currentMemoryEditor(content), preview: body.slice(0, 8192) };
      } catch { signal?.throwIfAborted(); }
      read.set(hit.provenance.file, metadata);
    }
    if (metadata.metadataStatus === "unavailable") unavailable++;
    results.push({ ...hit, recognition: metadata });
  }
  const filtered = results.filter(hit => matchesRecognition(hit.recognition!, options));
  if (options.sort === "edited") filtered.sort((a, b) => {
    const aDate = a.recognition?.updatedAt, bDate = b.recognition?.updatedAt;
    const difference = (bDate ? Date.parse(bDate) : -Infinity) - (aDate ? Date.parse(aDate) : -Infinity);
    return (Number.isNaN(difference) ? 0 : difference) || (a.provenance.file < b.provenance.file ? -1 : a.provenance.file > b.provenance.file ? 1 : 0);
  });
  const offset = options.offset ?? 0, pageSize = Math.max(1, Math.min(120, limit));
  const scope: SearchRecognitionScope = { version: 1, options, candidateLimit: RECOGNITION_CANDIDATE_LIMIT, candidates: results.length,
    matched: filtered.length, partial: true, metadataUnavailable: unavailable,
    ...(offset + pageSize < filtered.length ? { nextOffset: offset + pageSize } : {}) };
  return { results: filtered.slice(offset, offset + pageSize), scope };
}
