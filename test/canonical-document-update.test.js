import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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


test("renames reject normalized duplicate titles in every canonical bucket, including files without IDs", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = "mem_62000000-0000-4000-8000-000000000001";
  const original = markdown({ id, title: "Original title" });
  const file = await writeMarkdown(root, "notes/editable.md", original);
  const before = await readCanonicalMemoryDocumentById(root, id);

  for (const [bucket] of BUCKET_CASES) {
    // No ID/type required: legacy canonical Markdown still owns its title.
    const conflictFile = `${bucket}/nested/conflicting.md`;
    const conflict = await writeMarkdown(root, conflictFile, '---\ntitle: " Café ＰＡＧＥ "\n---\nLegacy body.\n');
    const submitted = markdown({ id, title: "  CAFE\u0301 page  ", body: "Must not be saved." });
    await assert.rejects(replaceCanonicalMemoryDocumentById(root, id, submitted), (error) => {
      assert.equal(error.code, "duplicate_title");
      assert.equal(error.message, "Another memory document already uses this title. Choose a different title.");
      assert.deepEqual(error.details, { id, file: "notes/editable.md", files: [conflictFile] });
      return true;
    });
    assert.equal(await readFile(file, "utf8"), original);
    assert.equal((await readCanonicalMemoryDocumentById(root, id)).contentHash, before.contentHash);
    assert.equal((await readdir(path.dirname(file))).some((name) => name.endsWith(".tmp")), false);
    await rm(conflict);
  }
});

test("unchanged and equivalent legacy duplicate titles permit body edits and unique renames", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = "mem_62000000-0000-4000-8000-000000000002";
  await writeMarkdown(root, "notes/editable.md", markdown({ id, title: "Café page" }));
  await writeMarkdown(root, "pages/legacy.md", '---\ntitle: "CAFÉ PAGE"\n---\nLegacy.\n');

  for (const title of ["Café page", "  CAFE\u0301 ＰＡＧＥ  ", "A unique new title"]) {
    await replaceCanonicalMemoryDocumentById(root, id, markdown({ id, title, body: `Edited body ${title}` }));
    const after = await readCanonicalMemoryDocumentById(root, id);
    assert.equal(after.title, title);
    assert.match(after.content, /Edited body/);
  }
});

test("rename scan excludes the current file and noncanonical Markdown and reads fresh metadata", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = "mem_62000000-0000-4000-8000-000000000003";
  await writeMarkdown(root, "notes/editable.md", markdown({ id, title: "Original" }));
  const target = "Destination";
  for (const file of ["README.md", "tasks/todo/plan.md", ".jumpybrain/cached.md", "notes/node_modules/dependency.md", "pages/answer_session_ids.md"]) {
    await writeMarkdown(root, file, `---\ntitle: "${target}"\n---\nIgnored.\n`);
  }
  await replaceCanonicalMemoryDocumentById(root, id, markdown({ id, title: target }));
  await replaceCanonicalMemoryDocumentById(root, id, markdown({ id, title: target.toUpperCase(), body: "Self is not a conflict." }));

  const occupied = await writeMarkdown(root, "pages/occupied.md", '---\ntitle: "Occupied"\n---\n');
  const submitted = markdown({ id, title: "occupied" });
  await assert.rejects(replaceCanonicalMemoryDocumentById(root, id, submitted), { code: "duplicate_title" });
  // No reindex/restart: a direct canonical metadata edit immediately frees the title.
  await writeFile(occupied, '---\ntitle: "Now free"\n---\n', "utf8");
  await replaceCanonicalMemoryDocumentById(root, id, submitted);
  assert.equal((await readCanonicalMemoryDocumentById(root, id)).title, "occupied");
});

test("missing and empty titles do not become duplicate-title conflicts", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = "mem_62000000-0000-4000-8000-000000000004";
  await writeMarkdown(root, "notes/editable.md", markdown({ id, title: "Original" }));
  await writeMarkdown(root, "pages/untitled.md", "Body only.\n");
  await writeMarkdown(root, "pages/blank.md", '---\ntitle: " "\n---\n');
  await replaceCanonicalMemoryDocumentById(root, id, markdown({ id, title: "  " }));
  await replaceCanonicalMemoryDocumentById(root, id, "Body-only submission.\n");
  assert.equal((await readCanonicalMemoryDocumentById(root, id)).title, "");
});
