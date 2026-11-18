import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  MemoryDocumentLookupError,
  buildCanonicalLinkTargetLookup,
  extractCanonicalLinks,
  listCanonicalMemoryMarkdownFiles,
  readMarkdownDocument,
  resolveCanonicalLinkTarget,
  resolveMemoryRoot,
} from "../../core/canonical/index.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { stringValue } from "./document-fields.js";
import type { MarkdownDocument, MemoryConnectionEdgeKind, MemoryDocumentBacklink, MemoryDocumentBacklinksResult } from "../../types.js";

export const DEFAULT_BACKLINK_LIMIT = 100;
const MAX_BACKLINK_LIMIT = 500;
const SNIPPET_LENGTH = 160;

/**
 * Every canonical note whose title/path links resolve to the page with `id`.
 * Read-only and derived: one fresh scan of the editor's canonical buckets with the
 * same core resolution as the graph, so links written before the page existed
 * resolve once it does. No index, cache or ID stamping.
 */
export async function memoryDocumentBacklinks(rootArg: string, id: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<MemoryDocumentBacklinksResult> {
  const { signal } = options;
  if (!isValidMemoryDocumentId(id)) throw new MemoryDocumentLookupError("invalid_id", `Invalid memory document id '${id}'. Expected mem_<uuid>.`, { id });
  const limit = Number.isSafeInteger(options.limit) && options.limit! > 0 ? Math.min(options.limit!, MAX_BACKLINK_LIMIT) : DEFAULT_BACKLINK_LIMIT;
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  // Editor scope (not the retrieval-only indexRoot), as for ID reads and delete previews.
  const documents: MarkdownDocument[] = [];
  for (const file of await listCanonicalMemoryMarkdownFiles(root, signal)) documents.push(await readMarkdownDocument(root, file, signal));
  const matches = documents.filter(document => document.frontmatter.id === id);
  if (!matches.length) throw new MemoryDocumentLookupError("missing_id", `No canonical memory document found for id '${id}'.`, { id });
  if (matches.length > 1) throw new MemoryDocumentLookupError("duplicate_id", `Multiple canonical memory documents found for id '${id}'.`, { id, files: matches.map(match => match.relativePath) });
  const target = matches[0]!;
  const lookup = buildCanonicalLinkTargetLookup(documents);

  const found: Array<MemoryDocumentBacklink & { content: string; bodyStartLine: number }> = [];
  let links = 0;
  for (const document of documents) {
    signal?.throwIfAborted();
    if (document.relativePath === target.relativePath) continue; // Self-links are not backlinks.
    const content = await readFile(document.absolutePath, { encoding: "utf8", signal });
    if (!content.includes("[")) continue;
    let count = 0;
    const kinds = new Set<MemoryConnectionEdgeKind>();
    for (const reference of extractCanonicalLinks(content)) {
      if (resolveCanonicalLinkTarget(document.relativePath, reference.target, reference.kind, lookup) !== target.relativePath) continue;
      count++; kinds.add(reference.kind);
    }
    if (!count) continue;
    links += count;
    const sourceId = document.frontmatter.id;
    found.push({
      ...(isValidMemoryDocumentId(sourceId) ? { id: sourceId } : {}),
      file: document.relativePath, title: titleFor(document), count, kinds: [...kinds].sort(),
      content, bodyStartLine: document.bodyStartLine,
    });
  }
  signal?.throwIfAborted();
  found.sort((a, b) => a.title.localeCompare(b.title) || a.file.localeCompare(b.file));
  // Snippets are presentation; compute them only for returned records.
  const backlinks = found.slice(0, limit).map(({ content, bodyStartLine, ...backlink }) => {
    const snippet = linkSnippet(content, bodyStartLine, backlink.file, target.relativePath, lookup);
    return snippet ? { ...backlink, snippet } : backlink;
  });
  return {
    root, target: "local", id, file: target.relativePath, title: titleFor(target),
    count: found.length, links, backlinks, limit, truncated: found.length > limit,
  };
}

function titleFor(document: MarkdownDocument): string {
  return stringValue(document.frontmatter.title) ?? path.posix.basename(document.relativePath, ".md");
}

/** The first body line (then metadata line) whose own links resolve to the target. */
function linkSnippet(content: string, bodyStartLine: number, sourceFile: string, targetFile: string, lookup: Map<string, string | undefined>): string | undefined {
  const lines = content.split(/\r?\n/);
  const body = Math.max(0, bodyStartLine - 1);
  for (const index of [...lines.keys()].slice(body).concat([...lines.keys()].slice(0, body))) {
    const line = lines[index]!;
    if (!line.includes("[")) continue;
    // The whole document still supplies reference-style link definitions.
    const reference = extractCanonicalLinks(line, content)
      .find(candidate => resolveCanonicalLinkTarget(sourceFile, candidate.target, candidate.kind, lookup) === targetFile);
    if (reference) return windowed(line, reference.target);
  }
  return undefined;
}

function windowed(line: string, rawTarget: string): string | undefined {
  const text = line.replace(/^\s*(?:(?:[-*+]|\d+[.)])\s+|#{1,6}\s+|>\s?)*/, "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= SNIPPET_LENGTH) return text;
  const at = Math.max(0, text.toLowerCase().indexOf(rawTarget.toLowerCase()));
  const start = Math.max(0, Math.min(at - Math.floor(SNIPPET_LENGTH / 3), text.length - SNIPPET_LENGTH));
  const end = start + SNIPPET_LENGTH;
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}
