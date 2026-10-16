import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { abandonDreamBatch, completeDreamBatch, createDreamBatch, getDreamStatus } from "../dist/app/dream/index.js";

async function writeDreamDoc(root, relative, { id, title, body = "Dream body", type = "finding", mtimeMs }) {
  const absolute = path.join(root, relative);
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
}

test("local app dream uses local state paths, canonical filtering, caps, resume, complete, and abandon", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-app-local-dream-"));
  try {
    await initializeMemoryRoot(tempRoot);
    const base = Date.now() - 60 * 60 * 1000;
    await writeDreamDoc(tempRoot, "findings/a.md", { id: "mem_c1000000-0000-4000-8000-000000000001", title: "Local A", body: "Alpha context", mtimeMs: base + 1000 });
    await writeDreamDoc(tempRoot, "notes/b.md", { id: "mem_c1000000-0000-4000-8000-000000000002", title: "Local B", body: "Beta context", type: "note", mtimeMs: base + 2000 });
    await writeDreamDoc(tempRoot, "scratch/ignored.md", { id: "mem_c1000000-0000-4000-8000-000000000099", title: "Ignored", mtimeMs: base + 500 });
    await mkdir(path.join(tempRoot, ".jumpybrain", "notes"), { recursive: true });
    await writeDreamDoc(path.join(tempRoot, ".jumpybrain"), "notes/derived.md", { id: "mem_c1000000-0000-4000-8000-000000000098", title: "Derived", mtimeMs: base + 500 });

    const batch = await createDreamBatch({ root: tempRoot, request: { maxFiles: 1, bytesPerFile: 8, maxTotalBytes: 8 } });
    assert.equal(batch.target, "local");
    assert.equal(batch.root, await realpath(tempRoot));
    assert.deepEqual(batch.files.map((file) => file.file), ["findings/a.md"]);
    assert.equal(batch.files[0].truncated, true);
    assert.equal(batch.hasMore, true);
    assert.equal(JSON.stringify(batch).includes("scratch/ignored"), false);

    const state = JSON.parse(await readFile(path.join(tempRoot, ".jumpybrain", "dream", "state.json"), "utf8"));
    assert.equal(state.openBatch.batchId, batch.batchId);
    const stored = JSON.parse(await readFile(path.join(tempRoot, ".jumpybrain", "dream", "batches", `${batch.batchId}.json`), "utf8"));
    assert.equal(JSON.stringify(stored).includes("Alpha context"), false);

    const resumed = await createDreamBatch({ root: tempRoot, request: { maxFiles: 10 } });
    assert.equal(resumed.batchId, batch.batchId);
    assert.equal(resumed.resumed, true);

    await completeDreamBatch({ root: tempRoot, request: { batchId: batch.batchId, skippedDocumentIds: [batch.files[0].id] } });
    const next = await createDreamBatch({ root: tempRoot, request: { maxFiles: 10 } });
    assert.deepEqual(next.files.map((file) => file.file), ["notes/b.md"]);
    const forced = await createDreamBatch({ root: tempRoot, request: { maxFiles: 10, force: true } });
    assert.notEqual(forced.batchId, next.batchId);
    assert.deepEqual(forced.files.map((file) => file.file), ["notes/b.md"]);
    await abandonDreamBatch({ root: tempRoot, batchId: forced.batchId, summary: "later" });
    const status = await getDreamStatus({ root: tempRoot });
    assert.equal(status.openBatch, undefined);
    assert.equal(status.lastCompletedCursor.file, "findings/a.md");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("local app dream recovers corrupt state as empty and creates completed no-op batches", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-app-local-dream-empty-"));
  try {
    await initializeMemoryRoot(tempRoot);
    await mkdir(path.join(tempRoot, ".jumpybrain", "dream"), { recursive: true });
    await writeFile(path.join(tempRoot, ".jumpybrain", "dream", "state.json"), "{not json", "utf8");
    const status = await getDreamStatus({ root: tempRoot });
    assert.equal(status.available, true);
    assert.equal(status.openBatch, undefined);
    const empty = await createDreamBatch({ root: tempRoot });
    assert.equal(empty.status, "completed");
    assert.equal(empty.files.length, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
