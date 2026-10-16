import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { rememberMemory } from "../dist/app/writing/local-writer.js";
import { writeRemoteMemoryNote, writeRemoteSessionWrapup } from "../dist/app/writing/remote-writer.js";
import { parseFrontmatter } from "../dist/core/frontmatter.js";
import { isValidMemoryDocumentId } from "../dist/core/document-id.js";

async function disposableRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-remote-blank-note-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

for (const body of ["", " \n\t "]) {
  test(`remote note accepts ${body ? "whitespace-only" : "empty"} body with heading and metadata`, async (t) => {
    const root = await disposableRoot(t);
    const title = "2026-07-16 14:35";
    const before = Date.now();
    const result = await writeRemoteMemoryNote(root, { type: "note", title, body });
    const after = Date.now();
    const parsed = parseFrontmatter(await readFile(path.join(root, result.file), "utf8"));

    assert.equal(result.type, "note");
    assert.equal(result.title, title);
    assert.match(result.file, /^notes\/.+\.md$/);
    assert.equal(isValidMemoryDocumentId(result.id), true);
    assert.equal(parsed.body.trim(), `# ${title}`);
    assert.deepEqual(parsed.frontmatter, {
      id: result.id,
      type: "note",
      title,
      source: "jumpybrain-remote",
      created_at: parsed.frontmatter.created_at,
      updated_at: parsed.frontmatter.created_at,
      confidence: "user-reviewed",
      tags: [],
    });
    const createdAt = Date.parse(parsed.frontmatter.created_at);
    assert.ok(createdAt >= before && createdAt <= after);
    assert.equal(new Date(createdAt).toISOString(), parsed.frontmatter.created_at);
  });
}

test("repeated blank remote notes with the same title create distinct documents", async (t) => {
  const root = await disposableRoot(t);
  const draft = { type: "note", title: "2026-07-16 14:35", body: "" };
  const results = await Promise.all(Array.from({ length: 3 }, () => writeRemoteMemoryNote(root, draft)));

  assert.equal(new Set(results.map((result) => result.id)).size, 3);
  assert.equal(new Set(results.map((result) => result.file)).size, 3);
  assert.equal((await readdir(path.join(root, "notes"))).length, 3);
  for (const result of results) {
    const parsed = parseFrontmatter(await readFile(path.join(root, result.file), "utf8"));
    assert.equal(isValidMemoryDocumentId(result.id), true);
    assert.equal(parsed.frontmatter.id, result.id);
    assert.equal(parsed.body.trim(), `# ${draft.title}`);
  }
});

test("blank remote findings, decisions, preferences, pages and wrapups remain invalid", async (t) => {
  const root = await disposableRoot(t);
  for (const body of ["", " \n\t "]) {
    for (const type of ["finding", "decision", "preference", "page"]) {
      await assert.rejects(writeRemoteMemoryNote(root, { type, title: "Empty", body }), {
        message: "Memory body is empty.",
      });
    }
    await assert.rejects(writeRemoteSessionWrapup(root, { title: "Empty wrapup", body }), {
      message: "Invalid wrapup Markdown.",
    });
    for (const type of ["session", "unknown"]) {
      await assert.rejects(writeRemoteMemoryNote(root, { type, title: "Empty", body }), /Invalid remote memory type/);
    }
  }
  assert.deepEqual(await readdir(root), []);
});

test("local note writing retains empty-body validation", async (t) => {
  const root = await disposableRoot(t);
  for (const body of ["", " \n\t "]) {
    await assert.rejects(rememberMemory(root, { type: "note", title: "Empty", body }), {
      message: "Memory body is empty. Pipe Markdown content on stdin.",
    });
  }
  assert.deepEqual(await readdir(root), []);
});
