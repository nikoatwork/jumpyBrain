import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
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

    const text = await import("node:fs/promises").then(({ readFile }) => readFile(file, "utf8"));
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

test("local runtime boundary exports current memory operations without importing CLI", async () => {
  const runtime = await import(pathToFileURL(path.join(repoRoot, "dist/runtime/index.js")).href);

  assert.equal(typeof runtime.initializeMemoryRoot, "function");
  assert.equal(typeof runtime.memoryRootStatus, "function");
  assert.equal(typeof runtime.findMemoryRoot, "function");
  assert.equal(typeof runtime.indexMemory, "function");
  assert.equal(typeof runtime.searchMemory, "function");
  assert.equal(typeof runtime.rememberMemory, "function");
  assert.equal(typeof runtime.writeSessionWrapup, "function");
  assert.equal(typeof runtime.processMemory, "function");

  const graph = await sourceImportGraph(path.join(srcRoot, "runtime/index.ts"));
  assert.equal(graph.includes("src/cli.ts"), false, `runtime import graph must not include CLI command parsing: ${graph.join(", ")}`);
});

test("local runtime can initialize and inspect a memory root directly", async () => {
  const runtime = await import(pathToFileURL(path.join(repoRoot, "dist/runtime/index.js")).href);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-runtime-"));
  try {
    const init = await runtime.initializeMemoryRoot(tempRoot);
    assert.equal(init.configFile, "jumpybrain.json");
    assert.equal(init.schemaVersion, 1);
    assert.equal(init.configCreated, true);

    const status = await runtime.memoryRootStatus(tempRoot);
    assert.equal(status.initialized, true);
    assert.equal(status.compatible, true);
    assert.equal(status.root, init.root);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
