import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { repoRoot, sourceImportGraph, srcRoot } from "./source-graph-helpers.js";

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
