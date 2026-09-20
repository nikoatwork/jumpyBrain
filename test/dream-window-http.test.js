import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRemoteMemoryTransport, RemoteMemoryError } from "../dist/adapters/http-client/index.js";
import { routeRequest } from "../dist/adapters/http-server/routes.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";

const headers = { Authorization: "Bearer synthetic-secret", "Content-Type": "application/json" };
const windowPath = "/memories/all/dream/window";
const logger = { info() {}, warn() {}, error() {}, log() {} };
const hash = (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`;

async function rootFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-window-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function document(root, file, metadata, body = "Synthetic evidence") {
  const absolute = path.join(root, file);
  await mkdir(path.dirname(absolute), { recursive: true });
  const content = ["---", ...Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`), "---", body, ""].join("\n");
  await writeFile(absolute, content);
  await utimes(absolute, new Date("2024-03-01T12:00:00Z"), new Date("2024-03-01T12:00:00Z"));
  return content;
}

async function snapshot(root) {
  return Promise.all((await readdir(root, { recursive: true })).sort().map(async (file) => {
    const absolute = path.join(root, file);
    const info = await stat(absolute);
    return { file, mtime: info.mtimeMs, ...(info.isFile() ? { content: await readFile(absolute, "utf8") } : {}) };
  }));
}

async function serve(t, root) {
  // Disable infrastructure writes so stateless route behavior is independently observable.
  // Production file logging/auto-indexing are deliberately not part of this invariant.
  const started = await startJumpyBrainHttpServer({ root, apiKeys: ["synthetic-secret"], port: 0, autoIndex: false, logger });
  t.after(() => started.close());
  return { ...started, remote: createRemoteMemoryTransport({ url: started.url, apiKey: "synthetic-secret" }) };
}

function assertRemoteSafe(packet, root) {
  assert.equal(packet.root, "remote:all");
  assert.equal(packet.target, "remote");
  assert.equal(packet.memory, "all");
  assert.equal(JSON.stringify(packet).includes(root), false);
}

test("authenticated dream windows round-trip all query options without state, IDs, or root leakage", async (t) => {
  const root = await rootFixture(t);
  const firstContent = await document(root, "notes/a.md", { date: "2024-02-28" }, "😀é日".repeat(100));
  await document(root, "pages/b.md", { date: "2024-02-29", type: "page", dream: false });
  await document(root, "pages/dream.md", { date: "2024-02-29", type: "page", dream: true });
  await document(root, "sessions/old.md", { date: "2020-01-01" });
  const before = await snapshot(root);
  const { url, remote } = await serve(t, root);
  for (const [auth, code] of [[undefined, "auth_required"], ["Bearer wrong", "invalid_api_key"]]) {
    const response = await fetch(`${url}${windowPath}`, { headers: auth ? { Authorization: auth } : {} });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, code);
  }
  const request = { from: "2024-02-29", days: 3, dateBasis: "evidence", offset: 0, maxFiles: 1, bytesPerFile: 80, maxTotalBytes: 100 };
  const first = await remote.getDreamWindow(request);
  assertRemoteSafe(first, root);
  assert.deepEqual(first.window, { from: "2024-02-27", to: "2024-02-29", timezone: "UTC", dateBasis: "evidence" });
  assert.deepEqual(first.limits, { maxFiles: 1, bytesPerFile: 80, maxTotalBytes: 100 });
  assert.equal(first.totalFiles, 2);
  assert.equal(first.offset, 0);
  assert.equal(first.files.length, 1);
  assert.equal(first.files[0].file, "notes/a.md");
  assert.equal(first.files[0].root, "remote:all");
  assert.equal(first.files[0].id, undefined);
  assert.equal(first.files[0].contentHash, hash(firstContent));
  assert.equal(first.files[0].truncated, true);
  assert.equal(first.files[0].returnedBytes, Buffer.byteLength(first.files[0].content));
  assert.ok(first.files[0].returnedBytes <= 80);
  assert.equal(first.files[0].content.includes("�"), false);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextOffset, 1);
  assert.equal("batchId" in first, false);
  assert.ok(first.warnings.some((warning) => /missing document ID/.test(warning)));
  assert.deepEqual(await remote.getDreamWindow(request), first);
  const second = await remote.getDreamWindow({ ...request, from: first.window.to, offset: first.nextOffset });
  assert.equal(second.files[0].file, "pages/b.md");
  assert.equal(second.hasMore, false);
  assert.equal(second.nextOffset, undefined);
  const modified = await remote.getDreamWindow({ from: "2024-03-01", days: 1, dateBasis: "modified" });
  assert.equal(modified.totalFiles, 3);
  assert.ok(modified.files.every((file) => file.dateBasis === "modified"));
  assert.deepEqual(await snapshot(root), before);
  assert.equal((await readdir(root)).includes(".jumpybrain"), false);
});

test("window HTTP validation rejects malformed, unknown, and duplicate parameters without writes", async (t) => {
  const root = await rootFixture(t);
  const { url, remote } = await serve(t, root);
  const empty = await remote.getDreamWindow({ from: "2024-02-29", days: 1 });
  assert.deepEqual(empty.files, []);
  assert.equal(empty.hasMore, false);
  for (const query of [
    "from=2023-02-29", "from=yesterday", "from=", "days=0", "days=366", "days=1.5", "days=NaN",
    "dateBasis=created", "offset=-1", "offset=0.5", "offset=9007199254740992",
    "maxFiles=0", "bytesPerFile=-1", "maxTotalBytes=Infinity", "maxTotalBytes=", "force=true", "unknown=1",
    ...["from=2024-02-29", "days=1", "dateBasis=evidence", "offset=0", "maxFiles=1", "bytesPerFile=80", "maxTotalBytes=100"].map((param) => `${param}&${param}`),
  ]) {
    const response = await fetch(`${url}${windowPath}?${query}`, { headers });
    const packet = await response.json();
    assert.equal(response.status, 400, query);
    assert.equal(packet.error.code, "validation_failed", query);
    assert.equal(JSON.stringify(packet).includes(root), false);
  }
  for (const method of ["POST", "PUT", "DELETE"]) {
    const response = await fetch(`${url}${windowPath}`, { method, headers });
    assert.equal(response.status, 405, method);
    assert.equal((await response.json()).error.code, "method_not_allowed");
  }
  assert.deepEqual(await readdir(root), []);
});

test("window route never enters the write queue or consults corrupt legacy state", async (t) => {
  const root = await rootFixture(t);
  await document(root, "notes/source.md", { date: "2024-02-29" });
  await mkdir(path.join(root, ".jumpybrain/remote"), { recursive: true });
  await writeFile(path.join(root, ".jumpybrain/remote/dream-state.json"), "not JSON");
  const before = await snapshot(root);
  let writes = 0;
  const server = createServer((request, response) => {
    routeRequest({ request, response, root, apiKeys: ["synthetic-secret"], logger,
      enqueueWrite: async () => { writes += 1; throw new Error("Read-only window entered write queue"); },
      indexRunner: {},
    }).catch((error) => { response.statusCode = 500; response.end(error.message); });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}${windowPath}?from=2024-02-29&days=1`, { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).files.length, 1);
  assert.equal(writes, 0);
  assert.deepEqual(await snapshot(root), before);
});

test("legacy remote batch create/read/abandon remains available alongside stateless windows", async (t) => {
  const root = await rootFixture(t);
  const { remote } = await serve(t, root);
  await document(root, "notes/legacy.md", { id: "mem_70000000-0000-4000-8000-000000000001", date: "2020-01-01" });
  await utimes(path.join(root, "notes/legacy.md"), new Date(), new Date());
  const batch = await remote.createDreamBatch({ maxFiles: 1 });
  assertRemoteSafe(batch, root);
  assert.match(batch.batchId, /^dream_/);
  const read = await remote.getDreamBatch(batch.batchId);
  assert.equal(read.batchId, batch.batchId);
  const before = await snapshot(root);
  assert.deepEqual((await remote.getDreamWindow({ from: "2024-02-29", days: 1 })).files, []);
  assert.deepEqual(await snapshot(root), before);
  const status = await remote.getDreamStatus();
  assert.equal(status.openBatch.batchId, batch.batchId);
  const abandoned = await remote.abandonDreamBatch(batch.batchId, "Synthetic compatibility check");
  assert.equal(abandoned.batchId, batch.batchId);
  assert.equal((await remote.getDreamStatus()).openBatch, undefined);
});

for (const status of [404, 405]) {
  test(`remote window HTTP ${status} asks for an upgrade with no legacy POST fallback`, async () => {
    const calls = [];
    const remote = createRemoteMemoryTransport({ url: "https://synthetic.invalid", apiKey: "synthetic-secret", fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(status === 404 ? "Old server HTML" : JSON.stringify({ error: { code: "method_not_allowed", message: "Use POST" } }), { status });
    } });
    await assert.rejects(remote.getDreamWindow({ from: "2024-02-29", days: 3, offset: 0 }), (error) => {
      assert.match(error.message, /upgrade.*server/i);
      assert.match(error.message, /no legacy batch was created/i);
      assert.equal(error.cause.status, status);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, windowPath);
    assert.equal(calls[0].url.searchParams.get("offset"), "0");
    assert.equal(calls[0].init.method ?? "GET", "GET");
    assert.equal(calls[0].init.body, undefined);
    assert.equal(calls[0].init.headers.get("Authorization"), "Bearer synthetic-secret");
  });
}

test("remote window rejects unsupported packets and preserves non-upgrade HTTP errors", async () => {
  for (const packet of [{}, { batchId: "legacy", files: [], instructions: [] }, { window: {}, files: "invalid", instructions: [] }, { window: {}, files: [], instructions: "invalid" }]) {
    let calls = 0;
    const remote = createRemoteMemoryTransport({ url: "https://synthetic.invalid", apiKey: "secret", fetchImpl: async () => {
      calls += 1;
      return Response.json(packet);
    } });
    await assert.rejects(remote.getDreamWindow(), /unsupported dream window response.*upgrade/i);
    assert.equal(calls, 1);
  }
  for (const status of [400, 401, 500]) {
    const remote = createRemoteMemoryTransport({ url: "https://synthetic.invalid", apiKey: "secret", fetchImpl: async () => Response.json({ error: { code: "synthetic_error", message: "Original diagnostic" } }, { status }) });
    await assert.rejects(remote.getDreamWindow(), (error) => {
      assert.ok(error instanceof RemoteMemoryError);
      assert.equal(error.status, status);
      assert.equal(error.code, "synthetic_error");
      assert.equal(error.message, "Original diagnostic");
      return true;
    });
  }
});

test("remote page creation/update preserves dream booleans and identity, checks hashes, and reindexes metadata", async (t) => {
  const root = await rootFixture(t);
  // Exercise real app indexing without user QMD configuration, models, or provider calls.
  const qmd = path.join(root, "synthetic-qmd");
  await writeFile(qmd, '#!/bin/sh\ncase "$1" in\n  collection|update) exit 0 ;;\n  *) echo "unexpected QMD call: $1" >&2; exit 1 ;;\nesac\n');
  await chmod(qmd, 0o755);
  for (const [key, value] of Object.entries({ HOME: root, JUMPYBRAIN_QMD_BIN: qmd, JUMPYBRAIN_QMD_EMBED: "false" })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const { remote } = await serve(t, root);
  const created = await remote.rememberMemory({ type: "page", title: "Synthetic dream map", body: "First synthetic evidence.", dream: true });
  assert.equal(JSON.stringify(created).includes(root), false);
  assert.match(created.file, /^pages\/.+\.md$/);
  const shown = await remote.readMemoryDocument(created.id);
  assert.equal(shown.frontmatter.dream, true);
  assert.equal(shown.frontmatter.type, "page");
  assert.equal(shown.contentHash, hash(await readFile(path.join(root, created.file))));
  const initialIndex = await remote.indexMemory();
  assert.equal(initialIndex.index.stale, false);
  const manifest = async () => JSON.parse(await readFile(path.join(root, ".jumpybrain/index.json"), "utf8"));
  const indexedBefore = (await manifest()).documents.find((entry) => entry.relativePath === created.file);
  assert.equal(indexedBefore.frontmatter.dream, true);
  // Body-only updates must not discard dream classification or protected identity.
  const updated = await remote.updateMemoryDocument(created.id, "Expanded synthetic evidence.", { ifMatch: shown.contentHash });
  assert.equal(updated.id, created.id);
  assert.equal(updated.file, created.file);
  assert.equal(updated.index.stale, true);
  await assert.rejects(remote.updateMemoryDocument(created.id, "Stale overwrite", { ifMatch: shown.contentHash }), (error) => error.status === 412 && error.code === "precondition_failed");
  const after = await remote.readMemoryDocument(created.id);
  assertRemoteSafe(after, root);
  assert.equal(after.contentHash, updated.newContentHash);
  assert.notEqual(after.contentHash, shown.contentHash);
  assert.equal(after.contentHash, hash(after.content));
  assert.equal(after.frontmatter.id, created.id);
  assert.equal(after.frontmatter.type, "page");
  assert.equal(after.frontmatter.dream, true);
  assert.equal(after.frontmatter.created_at, shown.frontmatter.created_at);
  assert.match(after.content, /Expanded synthetic evidence/);
  assert.equal((await manifest()).documents.find((entry) => entry.relativePath === created.file).frontmatter.updated_at, indexedBefore.frontmatter.updated_at);
  await remote.indexMemory();
  const indexedAfter = (await manifest()).documents.find((entry) => entry.relativePath === created.file);
  assert.equal(indexedAfter.frontmatter.dream, true);
  assert.equal(indexedAfter.frontmatter.updated_at, after.frontmatter.updated_at);
  const ordinary = await remote.rememberMemory({ type: "page", title: "Synthetic ordinary page", body: "Human-authored evidence.", dream: false });
  assert.equal((await remote.readMemoryDocument(ordinary.id)).frontmatter.dream, false);
  const beforeInvalid = await snapshot(root);
  for (const dream of ["true", "false", "false-ish", 1, null]) {
    await assert.rejects(remote.rememberMemory({ type: "page", title: "Rejected marker", body: "Not written", dream }), /dream must be a boolean/);
  }
  assert.deepEqual(await snapshot(root), beforeInvalid);
  const window = await remote.getDreamWindow();
  assert.ok(window.files.some((file) => file.id === ordinary.id));
  assert.equal(window.files.some((file) => file.id === created.id), false);
});
