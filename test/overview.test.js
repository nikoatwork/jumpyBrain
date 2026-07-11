import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { overviewMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { extractCanonicalLinks } from "../dist/core/canonical/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const cliPath = path.join(repoRoot, "dist/cli.js");

test("canonical link extraction finds Markdown and Obsidian wiki links without external URLs", () => {
  assert.deepEqual(extractCanonicalLinks([
    "See [[Beta]] and [[Gamma#Heading|Gamma Alias]].",
    "Also [Delta](../notes/delta.md) and [external](https://example.com).",
    "Skip image ![Diagram](diagram.png) and embed ![[Attachment.png]].",
  ].join("\n")), [
    { kind: "wiki-link", target: "Beta" },
    { kind: "wiki-link", target: "Gamma" },
    { kind: "markdown-link", target: "../notes/delta.md" },
  ]);
});

test("local overview reports explicit Markdown/wiki-link connection stats without memory bodies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-overview-local-"));
  try {
    await initializeMemoryRoot(root);
    await writeFixtureMemory(root);

    const overview = await overviewMemory(root, { connections: true, showFiles: true, limit: 5 });

    assert.equal(overview.documents, 3);
    assert.equal(overview.index.present, false);
    assert.equal(overview.index.stale, true);
    assert.deepEqual(overview.buckets.map((bucket) => [bucket.bucket, bucket.count]), [["notes", 2], ["pages", 1]]);
    assert.equal(overview.connections?.nodes, 3);
    assert.equal(overview.connections?.edgeCount, 2);
    assert.equal(overview.connections?.markdownLinks, 1);
    assert.equal(overview.connections?.wikiLinks, 1);
    assert.equal(overview.connections?.unresolvedLinks, 1);
    assert.equal(overview.connections?.orphans, 0);
    assert.deepEqual(overview.connections?.edges.map((edge) => [edge.source, edge.target, edge.kind]), [
      ["pages/alpha.md", "notes/beta.md", "wiki-link"],
      ["pages/alpha.md", "notes/gamma.md", "markdown-link"],
    ]);
    assert.equal(overview.connections?.topHubs[0].file, "pages/alpha.md");
    assert.doesNotMatch(JSON.stringify(overview), /secret body phrase|Alpha links to/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI tree --connections renders compact connection stats", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-overview-cli-"));
  try {
    await initializeMemoryRoot(root);
    await writeFixtureMemory(root);

    const result = spawnSync(process.execPath, [cliPath, "tree", "--root", root, "--connections"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.match(result.stdout, /all memory \(3 docs\)/);
    assert.match(result.stdout, /Connections: 3 nodes, 2 explicit Markdown\/wiki-link edges \(1 Markdown, 1 wiki\), 0 orphans/);
    assert.match(result.stdout, /Top hubs: pages\/alpha\.md \(2\)/);
    assert.doesNotMatch(result.stdout, /secret body phrase|Alpha links to/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeFixtureMemory(root) {
  await writeFile(path.join(root, "pages", "alpha.md"), [
    "---",
    'title: "Alpha"',
    'type: "page"',
    'tags: ["graph", "alpha"]',
    'created_at: "2026-07-04T00:00:00.000Z"',
    "---",
    "",
    "# Alpha",
    "",
    "Alpha links to [[Beta]] and [Gamma](../notes/gamma.md).",
    "A missing link [[Missing]] and an external [site](https://example.com) do not become resolved edges.",
  ].join("\n"));
  await writeFile(path.join(root, "notes", "beta.md"), [
    "---",
    'title: "Beta"',
    'type: "note"',
    'tags: ["graph"]',
    "---",
    "",
    "# Beta",
    "",
    "secret body phrase beta",
  ].join("\n"));
  await writeFile(path.join(root, "notes", "gamma.md"), [
    "---",
    'title: "Gamma"',
    'type: "note"',
    "---",
    "",
    "# Gamma",
    "",
    "secret body phrase gamma",
  ].join("\n"));
}
