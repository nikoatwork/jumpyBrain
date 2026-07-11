import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readCanonicalMemoryDocumentById } from "../dist/core/canonical/index.js";

const BUCKET_CASES = [
  ["notes", "note", "mem_10000000-0000-4000-8000-000000000001"],
  ["findings", "finding", "mem_10000000-0000-4000-8000-000000000002"],
  ["decisions", "decision", "mem_10000000-0000-4000-8000-000000000003"],
  ["preferences", "preference", "mem_10000000-0000-4000-8000-000000000004"],
  ["sessions", "session", "mem_10000000-0000-4000-8000-000000000005"],
  ["pages", "page", "mem_10000000-0000-4000-8000-000000000006"],
];

async function tempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "jumpybrain-doc-read-"));
}

async function writeMarkdown(root, relativePath, content) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

function markdown({ id, type = "note", title = "Editable memory", body = "# Editable memory\n\nBody." }) {
  return `---\nid: "${id}"\ntype: "${type}"\ntitle: "${title}"\ntags: ["edit-flow"]\n---\n${body}\n`;
}

async function assertRejectsWithCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test("canonical document read finds IDs only in allowed memory buckets", async () => {
  const root = await tempRoot();

  for (const [bucket, type, id] of BUCKET_CASES) {
    await writeMarkdown(root, `${bucket}/nested/${type}.md`, markdown({ id, type, title: `Title ${type}` }));
    const result = await readCanonicalMemoryDocumentById(root, id);

    assert.equal(result.id, id);
    assert.equal(result.file, `${bucket}/nested/${type}.md`);
    assert.equal(path.isAbsolute(result.file), false);
    assert.equal(result.type, type);
    assert.equal(result.title, `Title ${type}`);
    assert.equal(result.frontmatter.id, id);
    assert.equal(result.target, "local");
    assert.match(result.contentHash, /^sha256:[0-9a-f]{64}$/);
  }
});

test("canonical document lookup ignores derived, log, report, build, and arbitrary Markdown files", async () => {
  const root = await tempRoot();
  const ignoredId = "mem_20000000-0000-4000-8000-000000000001";
  const ignoredContent = markdown({ id: ignoredId });

  for (const relativePath of [
    "workspace.md",
    ".jumpybrain/report.md",
    "logs/log.md",
    "reports/report.md",
    "dist/output.md",
    "build/output.md",
    "node_modules/package/readme.md",
    "notes/logs/inside-canonical-log.md",
    "pages/reports/inside-canonical-report.md",
  ]) {
    await writeMarkdown(root, relativePath, ignoredContent);
  }

  await assertRejectsWithCode(readCanonicalMemoryDocumentById(root, ignoredId), "missing_id");
});

test("canonical document lookup reports invalid, missing, and duplicate IDs clearly", async () => {
  const root = await tempRoot();
  const duplicateId = "mem_30000000-0000-4000-8000-000000000001";

  await assertRejectsWithCode(readCanonicalMemoryDocumentById(root, "not-a-memory-id"), "invalid_id");
  await assertRejectsWithCode(readCanonicalMemoryDocumentById(root, "mem_30000000-0000-4000-8000-000000000099"), "missing_id");

  await writeMarkdown(root, "notes/a.md", markdown({ id: duplicateId, title: "A" }));
  await writeMarkdown(root, "findings/b.md", markdown({ id: duplicateId, type: "finding", title: "B" }));

  await assert.rejects(readCanonicalMemoryDocumentById(root, duplicateId), (error) => {
    assert.equal(error.code, "duplicate_id");
    assert.deepEqual(error.details.files, ["notes/a.md", "findings/b.md"]);
    return true;
  });
});

test("canonical document read returns exact content and stable sha256 hash over file bytes", async () => {
  const root = await tempRoot();
  const id = "mem_40000000-0000-4000-8000-000000000001";
  const content = markdown({
    id,
    title: "Hash stable",
    body: "# Hash stable\n\nExact bytes are the concurrency token.\n",
  });
  await writeMarkdown(root, "notes/hash.md", content);

  const expectedHash = `sha256:${createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex")}`;
  const first = await readCanonicalMemoryDocumentById(root, id);
  const second = await readCanonicalMemoryDocumentById(root, id);

  assert.equal(first.file, "notes/hash.md");
  assert.equal(first.content, content);
  assert.equal(first.contentHash, expectedHash);
  assert.equal(second.contentHash, expectedHash);
  assert.deepEqual(first.frontmatter.tags, ["edit-flow"]);
});
