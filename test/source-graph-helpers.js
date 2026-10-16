import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const testDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(testDir, "..");
export const srcRoot = path.join(repoRoot, "src");

const staticImportExportPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
const dynamicImportPattern = /import\(\s*["']([^"']+)["']\s*\)/g;

export function sourceRelative(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

export async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
  }));
  return files.flat();
}

export async function sourceFilesFor(relativePath) {
  const absolute = path.join(srcRoot, relativePath);
  if (absolute.endsWith(".ts")) return [absolute];
  return sourceFiles(absolute);
}

export function importSpecifiers(text) {
  return [
    ...[...text.matchAll(staticImportExportPattern)].map((match) => match[1]),
    ...[...text.matchAll(dynamicImportPattern)].map((match) => match[1]),
  ];
}

export function resolveSourceSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const withoutJs = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;
  const base = path.resolve(path.dirname(fromFile), withoutJs);
  const candidates = [
    `${base}.ts`,
    path.join(base, "index.ts"),
  ];
  return candidates.find((candidate) => candidate.startsWith(srcRoot) && existsSync(candidate));
}

export function unresolvedRelativeTarget(fromFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const withoutJs = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;
  const absolute = path.resolve(path.dirname(fromFile), withoutJs);
  return absolute.startsWith(srcRoot) ? sourceRelative(absolute) : undefined;
}

export async function importEdgesForFile(file) {
  const text = await readFile(file, "utf8");
  return importSpecifiers(text).map((specifier) => {
    const resolved = resolveSourceSpecifier(file, specifier);
    return {
      from: sourceRelative(file),
      specifier,
      target: resolved ? sourceRelative(resolved) : unresolvedRelativeTarget(file, specifier),
    };
  });
}

export async function importsIn(relativePath) {
  const files = await sourceFilesFor(relativePath);
  const imports = await Promise.all(files.map(importEdgesForFile));
  return imports.flat();
}

export async function sourceImportGraph(entryFile) {
  const visited = new Set();
  const queue = [entryFile];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const edges = await importEdgesForFile(file);
    for (const edge of edges) {
      if (!edge.specifier.startsWith(".")) continue;
      const resolved = resolveSourceSpecifier(file, edge.specifier);
      if (resolved) queue.push(resolved);
    }
  }

  return [...visited].map(sourceRelative).sort();
}

export function formatEdge(edge) {
  const target = edge.target ? ` (${edge.target})` : "";
  return `${edge.from} -> ${edge.specifier}${target}`;
}

export function assertNoImportEdges(edges, predicate, message) {
  assert.deepEqual(edges.filter(predicate).map(formatEdge), [], message);
}

export function assertNoGraphPaths(paths, predicate, message) {
  assert.deepEqual(paths.filter(predicate), [], message);
}
