import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const srcRoot = path.join(repoRoot, "src");

async function sourceImportGraph(entryFile) {
  const visited = new Set();
  const queue = [entryFile];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveSourceSpecifier(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }

  return [...visited].map((file) => path.relative(repoRoot, file)).sort();
}

function resolveSourceSpecifier(fromFile, specifier) {
  const withoutJs = specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier;
  const base = path.resolve(path.dirname(fromFile), withoutJs);
  const candidates = [
    `${base}.ts`,
    path.join(base, "index.ts"),
  ];
  return candidates.find((candidate) => candidate.startsWith(srcRoot) && existsSync(candidate));
}

test("core boundary exports backend-agnostic memory APIs without importing CLI", async () => {
  const core = await import(pathToFileURL(path.join(repoRoot, "dist/core/index.js")).href);

  assert.equal(typeof core.readMarkdownDocuments, "function");
  assert.equal(typeof core.initializeMemoryRoot, "function");
  assert.equal(typeof core.rememberMemory, "function");
  assert.equal(typeof core.validateWrapupBody, "function");
  assert.equal(typeof core.normalizeRetrievalDepth, "function");
  assert.equal(core.RETRIEVAL_DEPTHS.includes("normal"), true);

  assert.equal(core.processMemory, undefined, "core must not expose QMD-backed processing runtime yet");
  assert.equal(core.indexMemory, undefined, "core must not expose QMD-backed indexing runtime yet");
  assert.equal(core.searchMemory, undefined, "core must not expose QMD-backed search runtime yet");

  const graph = await sourceImportGraph(path.join(srcRoot, "core/index.ts"));
  assert.equal(graph.includes("src/cli.ts"), false, `core import graph must not include CLI code: ${graph.join(", ")}`);
  assert.equal(graph.some((file) => file.includes("/qmd-")), false, `core import graph must not include QMD adapter internals: ${graph.join(", ")}`);
});
