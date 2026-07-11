import path from "node:path";
import type { MemoryConnectionEdgeKind } from "../../types.js";

export interface CanonicalLinkReference {
  kind: MemoryConnectionEdgeKind;
  target: string;
}

export function extractCanonicalLinks(content: string): CanonicalLinkReference[] {
  const links: CanonicalLinkReference[] = [];

  const wikiPattern = /(^|[^!])\[\[([^\]\n]+)\]\]/g;
  for (const match of content.matchAll(wikiPattern)) {
    const target = normalizeWikiTarget(match[2] ?? "");
    if (target) links.push({ kind: "wiki-link", target });
  }

  const markdownPattern = /(!?)\[[^\]\n]*\]\(([^)\n]+)\)/g;
  for (const match of content.matchAll(markdownPattern)) {
    if (match[1] === "!") continue;
    const target = normalizeMarkdownTarget(match[2] ?? "");
    if (target) links.push({ kind: "markdown-link", target });
  }

  return links;
}

export function buildCanonicalLinkTargetLookup(documents: { relativePath: string }[]): Map<string, string | undefined> {
  const values = new Map<string, Set<string>>();
  for (const document of documents) {
    for (const key of canonicalDocumentLinkKeys(document.relativePath)) {
      const normalized = normalizeCanonicalLinkLookupKey(key);
      const set = values.get(normalized) ?? new Set<string>();
      set.add(document.relativePath);
      values.set(normalized, set);
    }
  }

  const lookup = new Map<string, string | undefined>();
  for (const [key, matches] of values.entries()) {
    lookup.set(key, matches.size === 1 ? [...matches][0] : undefined);
  }
  return lookup;
}

export function resolveCanonicalLinkTarget(sourceFile: string, rawTarget: string, kind: MemoryConnectionEdgeKind, lookup: Map<string, string | undefined>): string | undefined {
  const target = rawTarget.replace(/^\/+/, "");
  const sourceDir = posixDirname(sourceFile);
  const candidates = kind === "wiki-link"
    ? wikiCandidates(target)
    : markdownCandidates(target, sourceDir);

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
  let target = raw.trim();
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1).trim();
  target = target.split(/\s+/)[0] ?? "";
  if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return "";
  target = target.split("#")[0]?.split("?")[0] ?? "";
  target = target.trim().replace(/\\/g, "/");
  if (!target) return "";
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function wikiCandidates(target: string): string[] {
  const normalized = normalizePosix(target);
  const withoutExtension = normalized.replace(/\.md$/i, "");
  return [normalized, withoutExtension, `${withoutExtension}.md`, path.posix.basename(withoutExtension)];
}

function markdownCandidates(target: string, sourceDir: string): string[] {
  const normalized = normalizePosix(target);
  const relative = path.posix.normalize(`${sourceDir === "." ? "" : `${sourceDir}/`}${normalized}`);
  const values = [normalized, relative];
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
