import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { repoRoot } from "./source-graph-helpers.js";

async function loadServerMemoryApp() {
  return import(pathToFileURL(path.join(repoRoot, "dist/app/server-memory/index.js")).href);
}

async function loadServerMemoryState() {
  return import(pathToFileURL(path.join(repoRoot, "dist/app/server-memory/state.js")).href);
}

async function loadServerMemoryAutoIndex() {
  return import(pathToFileURL(path.join(repoRoot, "dist/app/server-memory/auto-index.js")).href);
}

async function assertRejectsWithCode(operation, expectedCode) {
  try {
    await operation();
    assert.fail(`Expected ${expectedCode} error`);
  } catch (error) {
    assert.equal(error.code, expectedCode);
  }
}

test("server-memory app handles status, write idempotency, index, and recall without HTTP", async () => {
  const app = await loadServerMemoryApp();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-server-memory-app-"));
  try {
    const memory = app.createServerMemoryRuntime({ root: tempRoot });
    await memory.initializeMemoryRoot();

    const initialStatus = await app.serverMemoryStatus(tempRoot);
    assert.equal(initialStatus.memory, "all");
    assert.equal(initialStatus.initialized, true);
    assert.equal(initialStatus.index.stale, true);
    assert.equal(Object.hasOwn(initialStatus, "root"), false);

    const body = { type: "finding", title: "Direct server-memory seam", body: "Direct app recall should find this server-memory note." };
    const missingKey = await app.writeServerMemoryWithIdempotency({
      root: tempRoot,
      method: "POST",
      path: "/memories/all/notes",
      body,
      write: { kind: "note", draft: body },
    });
    assert.equal(missingKey.kind, "missing-key");

    const created = await app.writeServerMemoryWithIdempotency({
      root: tempRoot,
      key: "server-memory-key",
      method: "POST",
      path: "/memories/all/notes",
      body,
      write: { kind: "note", draft: body },
    });
    assert.equal(created.kind, "created");
    assert.equal(created.result.root, undefined);
    assert.equal(created.result.memory, "all");
    assert.equal(created.result.target, "remote");
    assert.equal(created.result.index.stale, true);

    const replay = await app.writeServerMemoryWithIdempotency({
      root: tempRoot,
      key: "server-memory-key",
      method: "POST",
      path: "/memories/all/notes",
      body,
      write: { kind: "note", draft: body },
    });
    assert.equal(replay.kind, "replayed");
    assert.deepEqual(replay.result, created.result);

    const read = await app.readServerMemoryDocument({ root: tempRoot, id: created.result.id });
    assert.equal(read.memory, "all");
    assert.equal(read.target, "remote");
    assert.equal(read.root, "remote:all");
    assert.equal(read.id, created.result.id);
    assert.equal(read.file, created.result.file);
    assert.match(read.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(read).includes(tempRoot), false);

    const runtimeRead = await memory.readMemoryDocument(created.result.id);
    assert.equal(runtimeRead.root, "remote:all");
    assert.equal(runtimeRead.file, created.result.file);

    const autoIndex = await loadServerMemoryAutoIndex();
    const indexRunner = autoIndex.createRemoteIndexRunner({ root: tempRoot, logger: () => {} });
    const indexed = await app.indexServerMemory({ root: tempRoot, indexRunner, reason: "manual" });
    assert.equal(indexed.root, "remote:all");
    assert.equal(indexed.documents, 1);
    assert.equal(indexed.index.stale, false);

    const recall = await app.searchServerMemory({ root: tempRoot, query: "server-memory note", limit: 5, recall: true });
    assert.equal(recall.root, "remote:all");
    assert.equal(recall.mode, "recall");
    assert.equal(recall.index.stale, false);
    assert.equal(recall.results[0].provenance.file, created.result.file);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("server-memory app updates documents with remote-safe stale index state", async () => {
  const app = await loadServerMemoryApp();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-server-memory-update-"));
  try {
    const memory = app.createServerMemoryRuntime({ root: tempRoot });
    await memory.initializeMemoryRoot();

    const id = "mem_91000000-0000-4000-8000-000000000001";
    const original = [
      "---",
      `id: ${JSON.stringify(id)}`,
      'type: "finding"',
      'title: "Server update original"',
      'source: "jumpybrain-remote"',
      'created_at: "2026-07-04T10:00:00.000Z"',
      'updated_at: "2026-07-04T10:00:00.000Z"',
      "---",
      "# Server update original",
      "",
      "Original body.",
      "",
    ].join("\n");
    await mkdir(path.join(tempRoot, "findings"), { recursive: true });
    await writeFile(path.join(tempRoot, "findings", "update.md"), original, "utf8");
    const state = await loadServerMemoryState();
    await state.markRemoteIndexFresh(tempRoot, { root: tempRoot, documents: 1, qmdCollection: "jumpybrain" }, "2026-07-04T10:01:00.000Z");

    const read = await app.readServerMemoryDocument({ root: tempRoot, id });
    await assertRejectsWithCode(() => app.updateServerMemoryDocument({ root: tempRoot, id, content: read.content }), "precondition_required");

    const revised = read.content
      .replace('title: "Server update original"', 'title: "Server update revised"')
      .replace("# Server update original", "# Server update revised")
      .replace("Original body.", "Revised body.");
    const updated = await app.updateServerMemoryDocument({
      root: tempRoot,
      id,
      content: revised,
      ifMatch: read.contentHash,
      updatedAt: "2026-07-04T10:02:00.000Z",
    });

    assert.equal(updated.memory, "all");
    assert.equal(updated.target, "remote");
    assert.equal(updated.root, "remote:all");
    assert.equal(updated.file, "findings/update.md");
    assert.equal(updated.oldContentHash, read.contentHash);
    assert.match(updated.newContentHash, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(updated.newContentHash, read.contentHash);
    assert.equal(updated.updatedAt, "2026-07-04T10:02:00.000Z");
    assert.equal(updated.indexed, false);
    assert.equal(updated.index.stale, true);
    assert.equal(typeof updated.index.lastWriteAt, "string");
    assert.equal(JSON.stringify(updated).includes(tempRoot), false);

    const markdown = await readFile(path.join(tempRoot, "findings", "update.md"), "utf8");
    assert.match(markdown, new RegExp(`id: ${JSON.stringify(id)}`));
    assert.match(markdown, /type: "finding"/);
    assert.match(markdown, /source: "jumpybrain-remote"/);
    assert.match(markdown, /created_at: "2026-07-04T10:00:00.000Z"/);
    assert.match(markdown, /updated_at: "2026-07-04T10:02:00.000Z"/);
    assert.match(markdown, /Server update revised/);
    assert.match(markdown, /Revised body/);
    await assertRejectsWithCode(() => app.updateServerMemoryDocument({ root: tempRoot, id, content: revised, ifMatch: read.contentHash }), "precondition_failed");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function writeDreamDoc(root, relativePath, { id, title = id, body = "Dream body.", type = "finding", mtimeMs }) {
  const absolute = path.join(root, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, [
    "---",
    `id: ${JSON.stringify(id)}`,
    `type: ${JSON.stringify(type)}`,
    `title: ${JSON.stringify(title)}`,
    'updated_at: "2026-07-04T12:00:00.000Z"',
    "---",
    `# ${title}`,
    "",
    body,
    "",
  ].join("\n"), "utf8");
  if (mtimeMs) {
    const date = new Date(mtimeMs);
    await utimes(absolute, date, date);
  }
  return absolute;
}

test("server-memory dream selection is canonical, overflow-safe, resumable, and completion advances cursor", async () => {
  const app = await loadServerMemoryApp();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-server-dream-"));
  try {
    const memory = app.createServerMemoryRuntime({ root: tempRoot });
    await memory.initializeMemoryRoot();

    const base = Date.now() - 60 * 60 * 1000;
    await writeDreamDoc(tempRoot, "findings/a.md", { id: "mem_a1000000-0000-4000-8000-000000000001", title: "Dream A", body: "Alpha dream context.", mtimeMs: base + 1000 });
    await writeDreamDoc(tempRoot, "notes/b.md", { id: "mem_a1000000-0000-4000-8000-000000000002", title: "Dream B", body: "Beta dream context.", type: "note", mtimeMs: base + 2000 });
    await writeDreamDoc(tempRoot, "pages/c.md", { id: "mem_a1000000-0000-4000-8000-000000000003", title: "Dream C", body: "Gamma dream context.", type: "page", mtimeMs: base + 3000 });
    await writeDreamDoc(tempRoot, "scratch/not-canonical.md", { id: "mem_a1000000-0000-4000-8000-000000000099", title: "Not canonical", mtimeMs: base + 500 });

    const batch = await app.createDreamBatch({ root: tempRoot, request: { maxFiles: 2, bytesPerFile: 8, maxTotalBytes: 20 } });
    assert.equal(batch.memory, "all");
    assert.equal(batch.target, "remote");
    assert.equal(batch.root, "remote:all");
    assert.equal(batch.status, "open");
    assert.equal(batch.files.length, 2);
    assert.deepEqual(batch.files.map((file) => file.file), ["findings/a.md", "notes/b.md"]);
    assert.equal(batch.hasMore, true);
    assert.equal(batch.toCursor.file, "notes/b.md");
    assert.equal(batch.files[0].content, "---\nid: ");
    assert.equal(batch.files[0].truncated, true);
    assert.equal(JSON.stringify(batch).includes(tempRoot), false);

    const stateAfterCreate = JSON.parse(await readFile(path.join(tempRoot, ".jumpybrain", "remote", "dream-state.json"), "utf8"));
    assert.equal(stateAfterCreate.lastCompletedCursor, undefined);
    const storedBatch = JSON.parse(await readFile(path.join(tempRoot, ".jumpybrain", "remote", "dream-batches", `${batch.batchId}.json`), "utf8"));
    assert.equal(JSON.stringify(storedBatch).includes("Alpha dream context"), false);

    const resumed = await app.createDreamBatch({ root: tempRoot, request: { maxFiles: 2 } });
    assert.equal(resumed.batchId, batch.batchId);
    assert.equal(resumed.resumed, true);

    const completed = await app.completeDreamBatch({ root: tempRoot, request: { batchId: batch.batchId, summary: "reviewed", updatedDocumentIds: [batch.files[0].id], skippedDocumentIds: [batch.files[1].id] } });
    assert.equal(completed.status, "completed");
    assert.equal(completed.advancedCursor.file, "notes/b.md");

    const next = await app.createDreamBatch({ root: tempRoot, request: { maxFiles: 10 } });
    assert.equal(next.status, "open");
    assert.deepEqual(next.files.map((file) => file.file), ["pages/c.md"]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("server-memory dream empty batches do not leave an open batch and abandon does not advance cursor", async () => {
  const app = await loadServerMemoryApp();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-server-dream-empty-"));
  try {
    const memory = app.createServerMemoryRuntime({ root: tempRoot });
    await memory.initializeMemoryRoot();

    await mkdir(path.join(tempRoot, ".jumpybrain", "remote"), { recursive: true });
    await writeFile(path.join(tempRoot, ".jumpybrain", "remote", "dream-state.json"), "{not json", "utf8");
    let status = await app.getDreamStatus({ root: tempRoot });
    assert.equal(status.available, true);
    assert.equal(status.openBatch, undefined);

    const empty = await app.createDreamBatch({ root: tempRoot, request: { maxFiles: 5 } });
    assert.equal(empty.status, "completed");
    assert.equal(empty.files.length, 0);
    status = await app.getDreamStatus({ root: tempRoot });
    assert.equal(status.openBatch, undefined);

    await writeDreamDoc(tempRoot, "findings/new.md", { id: "mem_b1000000-0000-4000-8000-000000000001", title: "New dream", mtimeMs: Date.now() });
    const batch = await app.createDreamBatch({ root: tempRoot, request: { maxFiles: 5 } });
    assert.equal(batch.status, "open");
    assert.equal(batch.files.length, 1);
    await app.abandonDreamBatch({ root: tempRoot, batchId: batch.batchId, summary: "skip" });
    status = await app.getDreamStatus({ root: tempRoot });
    assert.equal(status.openBatch, undefined);
    assert.equal(status.lastCompletedCursor, undefined);

    const again = await app.createDreamBatch({ root: tempRoot, request: { maxFiles: 5 } });
    assert.equal(again.files[0].file, "findings/new.md");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote dreaming source does not add provider env config or scheduler hooks", async () => {
  const files = [
    "src/app/server-memory/dream.ts",
    "src/adapters/http-server/routes.ts",
    "src/cli/dream.ts",
    "src/cli/commands.ts",
  ];
  const source = (await Promise.all(files.map((file) => readFile(path.join(repoRoot, file), "utf8")))).join("\n");
  assert.doesNotMatch(source, /OPENAI|OPENROUTER|ANTHROPIC|MODEL_PROVIDER|PROVIDER_API_KEY/);
  assert.doesNotMatch(source, /setInterval\s*\([^)]*dream|cron|scheduler/i);
});
