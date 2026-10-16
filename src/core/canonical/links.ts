import path from "node:path";
import { normalizedDocumentTitle } from "../document-title.js";
import type { MemoryConnectionEdgeKind } from "../../types.js";
import { isValidMemoryDocumentId } from "../document-id.js";

export interface CanonicalLinkReference {
  kind: MemoryConnectionEdgeKind;
  target: string;
}

export function extractCanonicalLinks(content: string, definitionContext = content): CanonicalLinkReference[] {
  const links: CanonicalLinkReference[] = [];

  const definitions = new Map<string, string>();
  // Definitions are destinations, not link occurrences. First definition wins,
  // even if it points outside canonical memory.
  const definitionPattern = /^ {0,3}\[([^\]\n]+)\]:[ \t]*(<[^>\n]*>|[^\s\n]+)[^\n]*$/gm;
  for (const match of definitionContext.matchAll(definitionPattern)) {
    const key = normalizeReferenceLabel(match[1]!);
    if (!definitions.has(key)) definitions.set(key, normalizeMarkdownTarget(match[2]!));
  }
  let text = content.replace(definitionPattern, definition => " ".repeat(definition.length));

  const wikiPattern = /(!?)\[\[([^\]\n]+)\]\]/g;
  text = text.replace(wikiPattern, (link, image: string, destination: string) => {
    const target = normalizeWikiTarget(destination);
    if (!image && target && isLocalTarget(target)) links.push({ kind: "wiki-link", target });
    // Do not reinterpret wiki links or embeds as Markdown shortcuts.
    return " ".repeat(link.length);
  });

  const markdownPattern = /(!?)\[([^\]\n]*)\](?:\((<[^>\n]*>(?:[ \t]+[^)\n]*)?|[^)\n]*)\)|\[([^\]\n]*)\])?/g;
  for (const match of text.matchAll(markdownPattern)) {
    if (match[1] === "!") continue;
    const target = match[3] !== undefined
      ? normalizeMarkdownTarget(match[3])
      : definitions.get(normalizeReferenceLabel(match[4] || match[2] || ""));
    if (target) links.push({ kind: "markdown-link", target });
  }

  return links;
}

export function buildCanonicalLinkTargetLookup(documents: { relativePath: string; frontmatter?: { id?: unknown; title?: unknown } }[]): Map<string, string | undefined> {
  const values = new Map<string, Set<string>>();
  for (const document of documents) {
    const keys = canonicalDocumentLinkKeys(document.relativePath);
    if (isValidMemoryDocumentId(document.frontmatter?.id)) keys.push(document.frontmatter.id);
    for (const key of keys) {
      const normalized = normalizeCanonicalLinkLookupKey(key);
      const set = values.get(normalized) ?? new Set<string>();
      set.add(document.relativePath);
      values.set(normalized, set);
    }
  }

  // Exact metadata titles take precedence for literal page references. Keep a
  // separate namespace so legacy filename/ID keys retain their existing rules.
  const titles = new Map<string, typeof documents>();
  for (const document of documents) {
    const title = normalizedDocumentTitle(document.frontmatter?.title);
    if (title) titles.set(title, [...(titles.get(title) ?? []), document]);
  }
  const lookup = new Map<string, string | undefined>();
  for (const [title, matches] of titles) {
    const match = matches[0]!;
    const id = match.frontmatter?.id;
    const uniqueId = isValidMemoryDocumentId(id) && values.get(normalizeCanonicalLinkLookupKey(id))?.size === 1;
    // An ID-less legacy filename reference remains a filename reference.
    if (matches.length === 1 && !uniqueId && normalizedDocumentTitle(path.posix.basename(match.relativePath, ".md")) === title) continue;
    lookup.set(titleKey(title), matches.length === 1 && uniqueId ? match.relativePath : undefined);
  }
  for (const [key, matches] of values.entries()) {
    lookup.set(key, matches.size === 1 ? [...matches][0] : undefined);
  }
  return lookup;
}

export function resolveCanonicalLinkTarget(sourceFile: string, rawTarget: string, kind: MemoryConnectionEdgeKind, lookup: Map<string, string | undefined>): string | undefined {
  if (kind === "wiki-link" && !/[\[\]\x00-\x1f\x7f|#\\/]/.test(rawTarget)) {
    const title = titleKey(normalizedDocumentTitle(rawTarget));
    // An ambiguous/unopenable title must not fall through to another filename.
    if (lookup.has(title)) return lookup.get(title);
  }
  const localTarget = rawTarget.trim().replace(/\\/g, "/");
  if (!isLocalTarget(localTarget)) return undefined;
  const rooted = localTarget.startsWith("/");
  const target = localTarget.replace(/^\/+/, "");
  const sourceDir = posixDirname(sourceFile);
  // Wiki paths are root-based; Markdown may traverse up from the source, but
  // never out of memory. Validate before basename fallback or normalization.
  const rootTarget = kind === "wiki-link" || rooted || sourceDir === "." ? target : `${sourceDir}/${target}`;
  if (!staysWithinRoot(rootTarget)) return undefined;
  // An ambiguous ID must not fall through to a coincidentally named local file.
  const key = normalizeCanonicalLinkLookupKey(target);
  if (isValidMemoryDocumentId(key) && lookup.has(key)) return lookup.get(key);
  const candidates = kind === "wiki-link"
    ? wikiCandidates(target)
    : markdownCandidates(target, rooted ? "." : sourceDir);

  for (const candidate of candidates) {
    const found = lookup.get(normalizeCanonicalLinkLookupKey(candidate));
    if (found) return found;
  }
  return undefined;
}

export function normalizeCanonicalLinkLookupKey(value: string): string {
  return normalizePosix(value).replace(/\.md$/i, "").toLowerCase();
}

export function canonicalDocumentLinkKeys(relativePath: string): string[] {
  const withoutExtension = relativePath.replace(/\.md$/i, "");
  const basename = path.posix.basename(withoutExtension);
  return [relativePath, withoutExtension, basename, `${withoutExtension}.md`];
}

function normalizeWikiTarget(raw: string): string {
  const withoutAlias = raw.split("|")[0] ?? "";
  const withoutHeading = withoutAlias.split("#")[0] ?? "";
  return withoutHeading.trim().replace(/\\/g, "/");
}

function normalizeMarkdownTarget(raw: string): string {
  const value = raw.trim();
  let target = value.startsWith("<") ? value.match(/^<([^>\n]*)>(?:\s|$)/)?.[1] ?? "" : value.split(/\s+/)[0] ?? "";
  if (!isLocalTarget(target)) return "";
  target = target.split("#")[0]?.split("?")[0] ?? "";
  try {
    target = decodeURIComponent(target);
  } catch {
    // Retain literal malformed percent escapes, as for existing inline links.
  }
  target = target.replace(/\\/g, "/");
  return isLocalTarget(target) ? target : "";
}

function normalizeReferenceLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isLocalTarget(value: string): boolean {
  return Boolean(value) && !value.startsWith("#") && !value.startsWith("//") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value) && !/[\u0000-\u001f]/.test(value);
}

function staysWithinRoot(value: string): boolean {
  let depth = 0;
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (--depth < 0) return false;
    } else depth++;
  }
  return true;
}

function wikiCandidates(target: string): string[] {
  const normalized = normalizePosix(target);
  const withoutExtension = normalized.replace(/\.md$/i, "");
  return [normalized, withoutExtension, `${withoutExtension}.md`, path.posix.basename(withoutExtension)];
}

function markdownCandidates(target: string, sourceDir: string): string[] {
  const normalized = normalizePosix(target);
  const relative = path.posix.normalize(`${sourceDir === "." ? "" : `${sourceDir}/`}${normalized}`);
  const values = [normalized, relative].filter(staysWithinRoot);
  for (const value of [...values]) {
    if (!/\.md$/i.test(value)) values.push(`${value}.md`);
  }
  return values;
}

function normalizePosix(value: string): string {
  return path.posix.normalize(value.replace(/\\/g, "/")).replace(/^\.\//, "");
}

function posixDirname(value: string): string {
  return path.posix.dirname(value);
}

function titleKey(title: string): string { return "\0title:" + title; }
