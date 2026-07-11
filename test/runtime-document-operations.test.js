import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { repoRoot } from "./source-graph-helpers.js";

async function importRuntime() {
  return import(pathToFileURL(path.join(repoRoot, "dist/runtime/index.js")).href);
}

async function writeMarkdown(root, relativePath, content) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return file;
}

function editableMarkdown({
  id = "mem_70000000-0000-4000-8000-000000000001",
  type = "note",
  title = "Runtime document",
  body = "# Runtime document\n\nold-runtime-token",
} = {}) {
  return [
    "---",
    `id: ${JSON.stringify(id)}`,
    `type: ${JSON.stringify(type)}`,
    `title: ${JSON.stringify(title)}`,
    'source: "jumpybrain-remember"',
    'created_at: "2026-01-01T00:00:00.000Z"',
    'updated_at: "2026-01-02T00:00:00.000Z"',
    'tags: ["runtime"]',
    "---",
    body,
    "",
  ].join("\n");
}

async function assertRejectsWithCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test("runtime exposes local document read/update and ID-stamping operations", async () => {
  const runtime = await importRuntime();
  assert.equal(typeof runtime.readMemoryDocument, "function");
  assert.equal(typeof runtime.updateMemoryDocument, "function");
  assert.equal(typeof runtime.ensureMemoryDocumentIds, "function");
});

test("local runtime reads and updates documents with content-hash preconditions and stale index state", async () => {
  const runtime = await importRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-runtime-doc-"));
  const id = "mem_70000000-0000-4000-8000-000000000001";
  try {
    await runtime.initializeMemoryRoot(root);
    const file = await writeMarkdown(root, "notes/runtime.md", editableMarkdown({ id }));

    const before = await runtime.readMemoryDocument(root, id);
    assert.equal(before.file, "notes/runtime.md");
    assert.match(before.contentHash, /^sha256:[0-9a-f]{64}$/);

    const revised = editableMarkdown({
      id: "mem_79999999-0000-4000-8000-000000000999",
      type: "decision",
      title: "Runtime document revised",
      body: "# Runtime document revised\n\nnew-runtime-token",
    });

    await assertRejectsWithCode(runtime.updateMemoryDocument(root, id, revised), "precondition_required");
    await assertRejectsWithCode(runtime.updateMemoryDocument(root, id, revised, { ifMatch: "sha256:0000000000000000000000000000000000000000000000000000000000000000" }), "precondition_failed");

    const updated = await runtime.updateMemoryDocument(root, id, revised, {
      ifMatch: before.contentHash,
      updatedAt: "2026-02-03T04:05:06.000Z",
    });
    const after = await runtime.readMemoryDocument(root, id);
    const stored = await readFile(file, "utf8");

    assert.equal(updated.file, "notes/runtime.md");
    assert.equal(updated.oldContentHash, before.contentHash);
    assert.equal(updated.newContentHash, after.contentHash);
    assert.notEqual(updated.oldContentHash, updated.newContentHash);
    assert.equal(updated.indexed, false);
    assert.deepEqual(updated.index, { stale: true, indexed: false });
    assert.equal(after.frontmatter.id, id);
    assert.equal(after.frontmatter.type, "note");
    assert.equal(after.frontmatter.source, "jumpybrain-remember");
    assert.equal(after.frontmatter.created_at, "2026-01-01T00:00:00.000Z");
    assert.equal(after.frontmatter.updated_at, "2026-02-03T04:05:06.000Z");
    assert.match(stored, /new-runtime-token/);
    assert.doesNotMatch(stored, /old-runtime-token/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime ID-stamping delegates to the local maintenance operation", async () => {
  const runtime = await importRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-runtime-stamp-"));
  try {
    await runtime.initializeMemoryRoot(root);
    await writeMarkdown(root, "notes/missing-id.md", "---\ntype: \"note\"\ntitle: \"Missing ID\"\nupdated_at: \"2026-01-01T00:00:00.000Z\"\n---\nNeeds an ID.\n");

    const result = await runtime.ensureMemoryDocumentIds(root);
    const stamped = await readFile(path.join(root, "notes/missing-id.md"), "utf8");

    assert.equal(result.mode, "ensure-ids");
    assert.equal(result.applied, true);
    assert.equal(result.modifiedCount, 1);
    assert.deepEqual(result.files, ["notes/missing-id.md"]);
    assert.match(stamped, /^id: "mem_[0-9a-f-]{36}"/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
