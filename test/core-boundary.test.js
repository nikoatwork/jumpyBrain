import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { repoRoot, sourceImportGraph, srcRoot } from "./source-graph-helpers.js";

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
