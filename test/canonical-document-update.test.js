import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseFrontmatter, readCanonicalMemoryDocumentById, replaceCanonicalMemoryDocumentById } from "../dist/core/canonical/index.js";
import { mergeMemoryDocumentUpdate } from "../dist/core/writing/index.js";

const BUCKET_CASES = [
  ["notes", "note", "mem_61000000-0000-4000-8000-000000000001"],
  ["findings", "finding", "mem_61000000-0000-4000-8000-000000000002"],
  ["decisions", "decision", "mem_61000000-0000-4000-8000-000000000003"],
  ["preferences", "preference", "mem_61000000-0000-4000-8000-000000000004"],
  ["sessions", "session", "mem_61000000-0000-4000-8000-000000000005"],
  ["pages", "page", "mem_61000000-0000-4000-8000-000000000006"],
];

async function tempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "jumpybrain-doc-update-"));
}

async function writeMarkdown(root, relativePath, content) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return file;
}

function markdown({
  id,
  type = "note",
  title = "Editable memory",
  tags = ["old-tag"],
  source = "jumpybrain-remember",
  createdAt = "2026-01-01T00:00:00.000Z",
  updatedAt = "2026-01-02T00:00:00.000Z",
  extra = "",
  body = "# Editable memory\n\nold-body-token",
}) {
  return [
    "---",
    `id: ${JSON.stringify(id)}`,
    `type: ${JSON.stringify(type)}`,
    `title: ${JSON.stringify(title)}`,
    `source: ${JSON.stringify(source)}`,
    `created_at: ${JSON.stringify(createdAt)}`,
    `updated_at: ${JSON.stringify(updatedAt)}`,
    'confidence: "user-reviewed"',
    `tags: ${JSON.stringify(tags)}`,
    extra.trimEnd(),
    "---",
    body,
    "",
  ].filter((line) => line !== "").join("\n");
}

test("document update merge preserves protected metadata while accepting title tags and body", () => {
  const existing = markdown({
    id: "mem_60000000-0000-4000-8000-000000000001",
    type: "finding",
    title: "Old title",
    tags: ["old"],
    source: "jumpybrain-remote",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    extra: ['session_id: "session-original"', 'topic: "original-topic"'].join("\n"),
    body: "# Old title\n\nold-body-token",
  });
  const submitted = markdown({
    id: "mem_60000000-0000-4000-8000-000000000999",
    type: "decision",
    title: "New title",
    tags: ["new", "edited"],
    source: "malicious-source-change",
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-02T00:00:00.000Z",
    extra: ['session_id: "session-submitted"', 'topic: "submitted-topic"'].join("\n"),
    body: "# New title\n\nnew-body-token",
  });

  const result = mergeMemoryDocumentUpdate(existing, submitted, { updatedAt: "2026-02-03T04:05:06.000Z" });
  const parsed = parseFrontmatter(result.content);

  assert.equal(parsed.frontmatter.id, "mem_60000000-0000-4000-8000-000000000001");
  assert.equal(parsed.frontmatter.type, "finding");
  assert.equal(parsed.frontmatter.source, "jumpybrain-remote");
  assert.equal(parsed.frontmatter.created_at, "2026-01-01T00:00:00.000Z");
  assert.equal(parsed.frontmatter.confidence, "user-reviewed");
  assert.equal(parsed.frontmatter.session_id, "session-original");
  assert.equal(parsed.frontmatter.topic, "original-topic");
  assert.equal(parsed.frontmatter.updated_at, "2026-02-03T04:05:06.000Z");
  assert.equal(parsed.frontmatter.title, "New title");
  assert.deepEqual(parsed.frontmatter.tags, ["new", "edited"]);
  assert.match(parsed.body, /new-body-token/);
  assert.doesNotMatch(parsed.body, /old-body-token/);
});

test("document replacement atomically updates every canonical memory type without changing file paths", async () => {
  const root = await tempRoot();

  for (const [bucket, type, id] of BUCKET_CASES) {
    const relativePath = `${bucket}/stable-name.md`;
    const absolutePath = await writeMarkdown(root, relativePath, markdown({
      id,
      type,
      title: `Old ${type}`,
      body: `# Old ${type}\n\nold-token-${type}`,
    }));
    const before = await readCanonicalMemoryDocumentById(root, id);
    const submitted = markdown({
      id: "mem_69999999-0000-4000-8000-000000000999",
      type: type === "decision" ? "finding" : "decision",
      title: `New ${type}`,
      tags: ["changed", type],
      source: "submitted-source",
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-02T00:00:00.000Z",
      body: `# New ${type}\n\nnew-token-${type}`,
    });

    const update = await replaceCanonicalMemoryDocumentById(root, id, submitted, { updatedAt: "2026-02-03T04:05:06.000Z" });
    const after = await readCanonicalMemoryDocumentById(root, id);
    const stored = await readFile(absolutePath, "utf8");

    assert.equal(update.file, relativePath);
    assert.equal(after.file, relativePath);
    assert.equal(after.type, type);
    assert.equal(after.title, `New ${type}`);
    assert.equal(after.frontmatter.id, id);
    assert.equal(after.frontmatter.type, type);
    assert.equal(after.frontmatter.source, "jumpybrain-remember");
    assert.equal(after.frontmatter.created_at, "2026-01-01T00:00:00.000Z");
    assert.equal(after.frontmatter.updated_at, "2026-02-03T04:05:06.000Z");
    assert.deepEqual(after.frontmatter.tags, ["changed", type]);
    assert.match(stored, new RegExp(`new-token-${type}`));
    assert.doesNotMatch(stored, new RegExp(`old-token-${type}`));
    assert.notEqual(update.oldContentHash, update.newContentHash);
    assert.equal(update.oldContentHash, before.contentHash);
    assert.equal(update.newContentHash, after.contentHash);
    assert.match(update.newContentHash, /^sha256:[0-9a-f]{64}$/);
  }
});
