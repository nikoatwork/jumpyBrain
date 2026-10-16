import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { initializeMemoryRoot, readMarkdownDocuments, rememberMemory, parseFrontmatter, indexMemory, searchMemory, writeSessionWrapup, isValidMemoryDocumentId } from "../dist/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(testDir, "fixtures", "canonical-memory");

const validWrapup = [
  "## Findings",
  "- IDs should be present on newly written session memories.",
  "",
  "## Decisions",
  "- Keep canonical Markdown as the source of truth.",
  "",
  "## Conflicts / Corrections",
  "- None captured.",
  "",
  "## Open Questions",
  "- None captured.",
].join("\n");

async function fixtureMemoryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-canonical-"));
  await initializeMemoryRoot(root);
  await cp(fixtureRoot, root, { recursive: true });
  return realpath(root);
}

test("canonical Markdown fixtures parse with stable metadata and body locations", async () => {
  const root = await fixtureMemoryRoot();
  try {
    const documents = await readMarkdownDocuments(root);
    const byPath = new Map(documents.map((document) => [document.relativePath, document]));

    assert.deepEqual([...byPath.keys()].sort(), [
      "decisions/2024-01-02-old-decision.md",
      "notes/odd-frontmatter.md",
      "pages/current-state.md",
      "sessions/manual-wrapup.md",
    ]);
    assert.equal(byPath.get("decisions/2024-01-02-old-decision.md")?.frontmatter.type, "decision");
    assert.deepEqual(byPath.get("notes/odd-frontmatter.md")?.frontmatter.tags, ["alpha", "beta"]);
    assert.equal(byPath.get("notes/odd-frontmatter.md")?.frontmatter.count, 3);
    assert.equal(byPath.get("notes/odd-frontmatter.md")?.frontmatter.published, true);
    assert.equal(byPath.get("sessions/manual-wrapup.md")?.bodyStartLine, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writer output remains parseable canonical Markdown", async () => {
  const root = await fixtureMemoryRoot();
  try {
    const result = await rememberMemory(root, {
      type: "finding",
      title: "Written compatibility finding",
      body: "Writer output should round-trip through parseFrontmatter.",
      tags: ["compat", "writer"],
    });
    const parsed = parseFrontmatter(await readFile(path.join(root, result.file), "utf8"));

    assert.equal(parsed.frontmatter.type, "finding");
    assert.equal(parsed.frontmatter.title, "Written compatibility finding");
    assert.deepEqual(parsed.frontmatter.tags, ["compat", "writer"]);
    assert.match(parsed.body, /Writer output should round-trip/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local remember writes IDs for every editable note type", async () => {
  const root = await fixtureMemoryRoot();
  try {
    for (const type of ["note", "finding", "decision", "preference"]) {
      const result = await rememberMemory(root, {
        type,
        title: `ID compatibility ${type}`,
        body: `Writer output for ${type} should include a document ID.`,
      });
      const parsed = parseFrontmatter(await readFile(path.join(root, result.file), "utf8"));

      assert.equal(isValidMemoryDocumentId(result.id), true);
      assert.equal(parsed.frontmatter.id, result.id);
      assert.equal(isValidMemoryDocumentId(parsed.frontmatter.id), true);
      assert.equal(parsed.frontmatter.type, type);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local wrapup writes an editable session ID", async () => {
  const root = await fixtureMemoryRoot();
  try {
    const result = await writeSessionWrapup(root, {
      title: "ID compatibility wrapup",
      body: validWrapup,
    });
    const parsed = parseFrontmatter(await readFile(path.join(root, result.file), "utf8"));

    assert.equal(isValidMemoryDocumentId(result.id), true);
    assert.equal(parsed.frontmatter.id, result.id);
    assert.equal(isValidMemoryDocumentId(parsed.frontmatter.id), true);
    assert.equal(parsed.frontmatter.type, "session");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canonical fixtures can be indexed and recalled with provenance", async () => {
  const root = await fixtureMemoryRoot();
  try {
    const indexed = await indexMemory(root);
    assert.equal(indexed.documents, 4);

    const recall = await searchMemory(root, "blue narwhal canonical", 5, { depth: "normal" });
    assert.equal(recall.root, root);
    assert.ok(recall.results.length > 0, "expected at least one recall result");
    assert.equal(recall.results[0].provenance.file, "decisions/2024-01-02-old-decision.md");
    assert.match(recall.results[0].snippet, /blue-narwhal-canonical/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
