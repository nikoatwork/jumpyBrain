import path from "node:path";
import { MEMORY_DOCUMENT_ID_PATTERN, isValidMemoryDocumentId } from "../document-id-format.js";
import { markdownStructure } from "../canonical/markdown-structure.js";
import { extractCanonicalLinks } from "../canonical/links.js";
import type { Frontmatter } from "../../types.js";

export const SOURCE_CHECK_LIMITS = { pageBytes: 65536, references: 32, files: 500, fileBytes: 262144, totalBytes: 4194304 } as const;
export type SourceCheckStatus = "unchanged" | "changed" | "missing" | "ambiguous" | "not_checked";
export interface SourceReference { target: string; kind: "markdown-link" | "wiki-link"; expectedHash?: string }
export interface SourceCheck extends SourceReference { status: SourceCheckStatus; reason?: string; file?: string; id?: string; title?: string; currentHash?: string }
export interface SourceCheckRequest { id?: string; content?: string; file?: string }
export interface SourceCheckResult {
  checkedAt: string; page: { file: string; contentHash: string; id?: string };
  coverage: "complete" | "partial"; omittedReferences: number; scannedFiles: number; unreadFiles: number;
  limits: typeof SOURCE_CHECK_LIMITS; sources: SourceCheck[]; warnings: string[];
}

/** Inline Markdown link titles carry version fingerprints. Other links stay visibly unchecked. */
export function pageSourceReferences(content: string): SourceReference[] {
  // Do not interpret fenced/inline code or examples as citations. Preserve reference definitions.
  const lines = content.split(/\r?\n/);
  for (const [start, end] of markdownStructure(lines, 0).fences) for (let i = start; i <= end; i++) lines[i] = "";
  let prose = lines.map(line => /^(?: {4}|\t)/.test(line) ? "" : line).join("\n");
  const ticks = [...prose.matchAll(/`+/g)];
  for (let i = 0; i < ticks.length; i++) {
    const start = ticks[i]!;
    let endIndex = i + 1;
    while (endIndex < ticks.length && ticks[endIndex]![0].length !== start[0].length) endIndex++;
    if (endIndex === ticks.length) continue;
    const end = ticks[endIndex]!;
    prose = prose.slice(0, start.index!) + " ".repeat(end.index! + end[0].length - start.index!) + prose.slice(end.index! + end[0].length);
    i = endIndex;
  }
  const inline = /(?<!!)\[[^\]\n]*\]\((<[^>\n]+>|[^\s)\n]+)[ \t]+"(sha256:[0-9a-f]{64})"\)/g;
  // Keep distinct versions of the same source separate; an unversioned occurrence cannot inherit a hash.
  const versioned = new Set<string>();
  const result: SourceReference[] = [];
  const rest = prose.replace(inline, text => {
    const link = extractCanonicalLinks(text)[0];
    if (link) {
      const hash = /"(sha256:[0-9a-f]{64})"/.exec(text)![1]!;
      const key = link.target + hash;
      if (!versioned.has(key)) { result.push({ ...link, expectedHash: hash }); versioned.add(key); }
    }
    return " ".repeat(text.length);
  });
  for (const link of extractCanonicalLinks(rest, prose)) {
    if (!result.some(ref => !ref.expectedHash && ref.target === link.target && ref.kind === link.kind)) result.push(link);
  }
  return result;
}

export interface SourceVersion { relativePath: string; frontmatter: Frontmatter; contentHash: string }
export function checkSourceReference(pageFile: string, ref: SourceReference, documents: SourceVersion[], scanComplete: boolean): SourceCheck {
  if (!ref.expectedHash) return { ...ref, status: "not_checked", reason: "no_version_fingerprint" };
  if (!scanComplete) return { ...ref, status: "not_checked", reason: "source_scan_incomplete" };
  const target = ref.target;
  let matches: SourceVersion[];
  if (MEMORY_DOCUMENT_ID_PATTERN.test(target)) matches = documents.filter(doc => doc.frontmatter.id === target);
  else {
    const file = target.startsWith("/") ? target.slice(1) : target.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(pageFile), target)) : target;
    if (!/^(notes|findings|decisions|preferences|sessions|pages)\/.+\.md$/.test(file) || file.split("/").some(part => part === ".." || part === "." || !part)) return { ...ref, status: "not_checked", reason: "requires_canonical_id_or_exact_path" };
    matches = documents.filter(doc => doc.relativePath === file);
  }
  if (matches.length > 1) return { ...ref, status: "ambiguous", reason: "multiple_canonical_targets" };
  if (!matches.length) return { ...ref, status: "missing", reason: "no_canonical_target" };
  const match = matches[0]!;
  const id = isValidMemoryDocumentId(match.frontmatter.id) ? match.frontmatter.id : undefined;
  // Duplicate IDs remain ambiguous even when the citation names one exact path.
  if (id && documents.filter(doc => doc.frontmatter.id === id).length > 1) return { ...ref, status: "ambiguous", reason: "duplicate_source_id" };
  return { ...ref, status: match.contentHash === ref.expectedHash ? "unchanged" : "changed", file: match.relativePath, id, ...(typeof match.frontmatter.title === "string" ? { title: match.frontmatter.title.slice(0, 200) } : {}), currentHash: match.contentHash };
}
