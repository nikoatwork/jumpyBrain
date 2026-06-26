import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { repoRoot, sourceImportGraph, srcRoot } from "./source-graph-helpers.js";

test("server boundary imports without CLI command parsing", async () => {
  const server = await import(pathToFileURL(path.join(repoRoot, "dist/server/index.js")).href);

  assert.equal(typeof server.createServerMemoryRuntime, "function");

  const graph = await sourceImportGraph(path.join(srcRoot, "server/index.ts"));
  assert.equal(graph.includes("src/cli.ts"), false, `server import graph must not include CLI command parsing: ${graph.join(", ")}`);
  assert.equal(graph.some((file) => file.startsWith("src/cli/")), false, `server import graph must not include CLI helpers: ${graph.join(", ")}`);
});

test("server runtime composes local operations against a server-local memory root", async () => {
  const server = await import(pathToFileURL(path.join(repoRoot, "dist/server/index.js")).href);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-server-"));
  try {
    const memory = server.createServerMemoryRuntime({ root: tempRoot });
    assert.equal(memory.root, tempRoot);

    const init = await memory.initializeMemoryRoot();
    assert.equal(init.configFile, "jumpybrain.json");
    assert.equal(init.schemaVersion, 1);

    const status = await memory.memoryRootStatus();
    assert.equal(status.root, init.root);
    assert.equal(status.initialized, true);
    assert.equal(status.compatible, true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
