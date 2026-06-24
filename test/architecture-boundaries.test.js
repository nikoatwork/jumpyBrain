import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const srcRoot = path.join(repoRoot, "src");

const staticImportExportPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
const dynamicImportPattern = /import\(\s*["']([^"']+)["']\s*\)/g;

function sourceRelative(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
  }));
  return files.flat();
}

async function sourceFilesFor(relativePath) {
  const absolute = path.join(srcRoot, relativePath);
  if (absolute.endsWith(".ts")) return [absolute];
  return sourceFiles(absolute);
}

function importSpecifiers(text) {
  return [
    ...[...text.matchAll(staticImportExportPattern)].map((match) => match[1]),
    ...[...text.matchAll(dynamicImportPattern)].map((match) => match[1]),
  ];
}

function resolveSourceSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const withoutJs = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;
  const base = path.resolve(path.dirname(fromFile), withoutJs);
  const candidates = [
    `${base}.ts`,
    path.join(base, "index.ts"),
  ];
  return candidates.find((candidate) => candidate.startsWith(srcRoot) && existsSync(candidate));
}

function unresolvedRelativeTarget(fromFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const withoutJs = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;
  const absolute = path.resolve(path.dirname(fromFile), withoutJs);
  return absolute.startsWith(srcRoot) ? sourceRelative(absolute) : undefined;
}

async function importEdgesForFile(file) {
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

async function importsIn(relativePath) {
  const files = await sourceFilesFor(relativePath);
  const imports = await Promise.all(files.map(importEdgesForFile));
  return imports.flat();
}

async function sourceImportGraph(entryFile) {
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

function formatEdge(edge) {
  const target = edge.target ? ` (${edge.target})` : "";
  return `${edge.from} -> ${edge.specifier}${target}`;
}

function assertNoImportEdges(edges, predicate, message) {
  assert.deepEqual(edges.filter(predicate).map(formatEdge), [], message);
}

function assertNoGraphPaths(paths, predicate, message) {
  assert.deepEqual(paths.filter(predicate), [], message);
}

function isCliPath(file) {
  return file === "src/cli.ts" || file.startsWith("src/cli/");
}

function isServerPath(file) {
  return file.startsWith("src/server/");
}

function isQmdPath(file) {
  return file === "src/qmd" || file.startsWith("src/qmd/");
}

function isTargetClientPath(file) {
  return file === "src/targets/client" || file === "src/targets/client.ts" || file.startsWith("src/targets/client/");
}

test("core and domain modules stay independent of CLI, server, targets, and QMD internals", async () => {
  const domainFiles = [
    ...await sourceFilesFor("core"),
    ...await sourceFilesFor("canonical"),
    ...await sourceFilesFor("setup"),
    ...await sourceFilesFor("writing"),
    ...await sourceFilesFor("retrieval/depth-policy.ts"),
  ];

  const offenders = new Set();
  for (const file of domainFiles) {
    const graph = await sourceImportGraph(file);
    for (const imported of graph) {
      if (isCliPath(imported) || isServerPath(imported) || isTargetClientPath(imported) || isQmdPath(imported)) {
        offenders.add(`${sourceRelative(file)} -> ${imported}`);
      }
    }
  }

  assert.deepEqual(
    [...offenders].sort(),
    [],
    "core/domain import graphs must not reach CLI, server, targets/client, or QMD adapter internals",
  );
});

test("CLI modules do not import the QMD adapter directly", async () => {
  const cliImports = [
    ...await importsIn("cli.ts"),
    ...await importsIn("cli"),
  ];

  assertNoImportEdges(
    cliImports,
    (edge) => edge.target !== undefined && isQmdPath(edge.target),
    "CLI modules must call runtime through the local transport and must not import src/qmd/ directly",
  );
});

test("server modules do not import CLI command parsing code", async () => {
  const serverFiles = await sourceFilesFor("server");
  const offenders = new Set();

  for (const file of serverFiles) {
    const graph = await sourceImportGraph(file);
    for (const imported of graph) {
      if (isCliPath(imported)) offenders.add(`${sourceRelative(file)} -> ${imported}`);
    }
  }

  assert.deepEqual(
    [...offenders].sort(),
    [],
    "server import graphs must not reach CLI command parsing or CLI helper modules",
  );
});

test("writing, retrieval, and canonical layer boundaries stay explicit", async () => {
  const writingImports = await importsIn("writing");
  assertNoImportEdges(
    writingImports,
    (edge) => edge.target !== undefined && (edge.target.startsWith("src/retrieval/") || isQmdPath(edge.target)),
    "writing modules must not import retrieval or QMD modules",
  );

  const retrievalImports = await importsIn("retrieval");
  assertNoImportEdges(
    retrievalImports,
    (edge) => edge.target !== undefined && edge.target.startsWith("src/writing/"),
    "retrieval modules must not import writing modules",
  );

  const canonicalImports = await importsIn("canonical");
  assertNoImportEdges(
    canonicalImports,
    (edge) => edge.target !== undefined && (edge.target.startsWith("src/retrieval/") || edge.target.startsWith("src/writing/") || isQmdPath(edge.target)),
    "canonical modules must stay retrieval-, writer-, and QMD-agnostic",
  );
});
