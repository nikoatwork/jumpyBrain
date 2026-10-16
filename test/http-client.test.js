import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { repoRoot } from "./source-graph-helpers.js";

async function loadClientModule() {
  return import(pathToFileURL(path.join(repoRoot, "dist/adapters/http-client/index.js")).href);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("remote HTTP client reads documents with auth on the documented path", async () => {
  const { createRemoteMemoryTransport } = await loadClientModule();
  const calls = [];
  const readPayload = {
    root: "remote:all",
    target: "remote",
    memory: "all",
    id: "mem_93000000-0000-4000-8000-000000000001",
    file: "notes/readable.md",
    type: "note",
    title: "Remote readable",
    frontmatter: { id: "mem_93000000-0000-4000-8000-000000000001", type: "note", title: "Remote readable" },
    content: "---\nid: \"mem_93000000-0000-4000-8000-000000000001\"\n---\nbody\n",
    contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const transport = createRemoteMemoryTransport({
    url: "https://memory.example/",
    apiKey: "secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(readPayload);
    },
  });

  const result = await transport.readMemoryDocument("mem_93000000-0000-4000-8000-000000000001");

  assert.deepEqual(result, readPayload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://memory.example/memories/all/documents/mem_93000000-0000-4000-8000-000000000001");
  assert.equal(calls[0].init.method, undefined);
  assert.equal(calls[0].init.headers.get("Authorization"), "Bearer secret");
});

test("remote HTTP client updates documents with JSON content and If-Match", async () => {
  const { createRemoteMemoryTransport } = await loadClientModule();
  const calls = [];
  const updatePayload = {
    root: "remote:all",
    target: "remote",
    memory: "all",
    id: "mem_93000000-0000-4000-8000-000000000002",
    file: "findings/editable.md",
    oldContentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    newContentHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    updatedAt: "2026-07-04T12:00:00.000Z",
    indexed: false,
    index: { stale: true, indexed: false },
  };
  const transport = createRemoteMemoryTransport({
    url: "https://memory.example/",
    apiKey: "secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(updatePayload);
    },
  });

  const result = await transport.updateMemoryDocument(
    "mem_93000000-0000-4000-8000-000000000002",
    "# Revised remote document\n",
    { ifMatch: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
  );

  assert.deepEqual(result, updatePayload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://memory.example/memories/all/documents/mem_93000000-0000-4000-8000-000000000002");
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(calls[0].init.headers.get("Authorization"), "Bearer secret");
  assert.equal(calls[0].init.headers.get("Content-Type"), "application/json");
  assert.equal(calls[0].init.headers.get("If-Match"), "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.deepEqual(JSON.parse(calls[0].init.body), { content: "# Revised remote document\n" });
});

test("remote HTTP client maps document precondition errors", async () => {
  const { createRemoteMemoryTransport, RemoteMemoryError } = await loadClientModule();
  const transport = createRemoteMemoryTransport({
    url: "https://memory.example/",
    apiKey: "secret",
    fetchImpl: async () => jsonResponse({
      error: {
        code: "precondition_failed",
        message: "Document content hash is stale.",
        details: {
          id: "mem_93000000-0000-4000-8000-000000000003",
          file: "notes/editable.md",
          currentContentHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        },
      },
    }, 412),
  });

  await assert.rejects(
    () => transport.updateMemoryDocument(
      "mem_93000000-0000-4000-8000-000000000003",
      "# Revised\n",
      { ifMatch: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
    ),
    (error) => {
      assert.equal(error instanceof RemoteMemoryError, true);
      assert.equal(error.status, 412);
      assert.equal(error.code, "precondition_failed");
      assert.match(error.message, /stale/);
      return true;
    },
  );
});

test("remote HTTP client uses documented dream routes and JSON bodies", async () => {
  const { createRemoteMemoryTransport } = await loadClientModule();
  const calls = [];
  const transport = createRemoteMemoryTransport({
    url: "https://memory.example/",
    apiKey: "secret",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith("/dream/status")) return jsonResponse({ memory: "all", target: "remote", root: "remote:all", available: true, defaults: {}, caps: {}, warnings: [] });
      if (pathname.endsWith("/dream/batches") && init.method === "POST") return jsonResponse({ memory: "all", target: "remote", root: "remote:all", batchId: "dream_93000000-0000-4000-8000-000000000001", status: "open", createdAt: "now", expiresAt: "later", files: [], hasMore: false, instructions: [], limits: {}, warnings: [] });
      if (pathname.endsWith("/complete")) return jsonResponse({ memory: "all", target: "remote", root: "remote:all", batchId: "dream_93000000-0000-4000-8000-000000000001", status: "completed", lastCompletedAt: "now", updatedDocumentIds: [], skippedDocumentIds: [], warnings: [] });
      if (pathname.endsWith("/abandon")) return jsonResponse({ memory: "all", target: "remote", root: "remote:all", batchId: "dream_93000000-0000-4000-8000-000000000001", status: "abandoned", abandonedAt: "now", warnings: [] });
      return jsonResponse({ memory: "all", target: "remote", root: "remote:all", batchId: "dream_93000000-0000-4000-8000-000000000001", status: "open", createdAt: "now", expiresAt: "later", files: [], hasMore: false, instructions: [], limits: {}, warnings: [] });
    },
  });

  await transport.getDreamStatus();
  await transport.createDreamBatch({ maxFiles: 3, force: true });
  await transport.getDreamBatch("dream_93000000-0000-4000-8000-000000000001");
  await transport.completeDreamBatch({ batchId: "dream_93000000-0000-4000-8000-000000000001", summary: "done" });
  await transport.abandonDreamBatch("dream_93000000-0000-4000-8000-000000000001", "skip");

  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/memories/all/dream/status",
    "/memories/all/dream/batches",
    "/memories/all/dream/batches/dream_93000000-0000-4000-8000-000000000001",
    "/memories/all/dream/batches/dream_93000000-0000-4000-8000-000000000001/complete",
    "/memories/all/dream/batches/dream_93000000-0000-4000-8000-000000000001/abandon",
  ]);
  assert.equal(calls.every((call) => call.init.headers.get("Authorization") === "Bearer secret"), true);
  assert.deepEqual(JSON.parse(calls[1].init.body), { maxFiles: 3, force: true });
  assert.deepEqual(JSON.parse(calls[3].init.body), { batchId: "dream_93000000-0000-4000-8000-000000000001", summary: "done" });
  assert.deepEqual(JSON.parse(calls[4].init.body), { summary: "skip" });
});


test("HTTP client sends rebuild only and preserves readiness/retrieval across index, status and recall", async () => {
  const { createRemoteMemoryTransport } = await loadClientModule();
  const calls = [];
  const readiness = { freshness: "stale", modes: ["lexical"], embedding: "incomplete" };
  const retrieval = { status: "partial", warnings: ["semantic_unavailable"] };
  const transport = createRemoteMemoryTransport({ url: "https://memory.example", apiKey: "secret",
    fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return jsonResponse({ readiness, retrieval }); },
  });
  assert.deepEqual((await transport.indexMemory({ rebuild: true })).readiness, readiness);
  assert.deepEqual(JSON.parse(calls[0].init.body), { rebuild: true });
  await transport.indexMemory();
  assert.deepEqual(JSON.parse(calls[1].init.body), {});
  assert.deepEqual((await transport.memoryRootStatus()).readiness, readiness);
  const recall = await transport.searchMemory("query", 5, { mode: "recall" });
  assert.deepEqual(recall.readiness, readiness);
  assert.deepEqual(recall.retrieval, retrieval);
  assert.throws(() => transport.indexMemory({ indexing: { mode: "semantic", model: "/private/model" } }), /server-local/);
  assert.equal(calls.length, 4);
});

// A controlled clock proves operation ownership without waiting for real deadlines.
function deadlineClock(t) {
  let now = 0;
  const active = new Map();
  const delays = [];
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    const handle = {};
    delays.push(delay);
    active.set(handle, { callback, at: now + delay });
    return handle;
  });
  t.mock.method(globalThis, "clearTimeout", handle => active.delete(handle));
  return { delays, active, advance(ms) {
    now += ms;
    for (const [handle, timer] of [...active]) if (timer.at <= now) {
      active.delete(handle);
      timer.callback();
    }
  } };
}

for (const readOnly of [false, true]) test(`rich retrieval owns one custom deadline including preflight=${readOnly}`, async t => {
  const { createRemoteMemoryTransport } = await loadClientModule();
  const clock = deadlineClock(t);
  const signals = [];
  const transport = createRemoteMemoryTransport({ url: "https://memory.example", apiKey: "secret",
    fetchImpl: async (url, { signal }) => {
      signals.push(signal);
      clock.advance(readOnly && signals.length === 1 ? 60_000 : 75_000);
      if (String(url).endsWith("/status")) return jsonResponse({ readOnlyRetrieval: "lexical-immutable-v1" });
      assert.equal(signal.aborted, false, "the nested default must not cap the caller deadline");
      return jsonResponse({ results: [], retrieval: { warnings: ["read_only_index"] } });
    },
  });
  await transport.searchMemory("query", 5, { timeoutMs: 180_000, readOnly });
  assert.deepEqual(clock.delays, [180_000]);
  assert.equal(new Set(signals).size, 1);
  assert.equal(clock.active.size, 0);
});

for (const abort of [false, true]) test(`retrieval keeps deadline and caller cancellation through response body: abort=${abort}`, async t => {
  const { createRemoteMemoryTransport } = await loadClientModule();
  const clock = deadlineClock(t);
  const caller = new AbortController();
  const added = t.mock.method(caller.signal, "addEventListener");
  const removed = t.mock.method(caller.signal, "removeEventListener");
  const transport = createRemoteMemoryTransport({ url: "https://memory.example", apiKey: "secret",
    fetchImpl: async (_url, { signal }) => ({ ok: true, json: async () => {
      assert.equal(signal.aborted, false);
      if (abort) caller.abort(new Error("private caller reason"));
      else clock.advance(120_000);
      assert.equal(signal.aborted, true);
      throw signal.reason;
    } }),
  });
  await assert.rejects(transport.searchMemory("query", 5, { timeoutMs: 120_000, signal: caller.signal }),
    error => error.code === (abort ? "execution_aborted" : "execution_timeout") && !error.message.includes("private"));
  assert.deepEqual(clock.delays, [120_000]);
  assert.equal(clock.active.size, 0);
  assert.equal(added.mock.callCount(), 1);
  assert.equal(removed.mock.callCount(), 1);
});

test("compact read-only preflight shares the retrieval deadline and signal", async t => {
  const { createRemoteMemoryTransport } = await loadClientModule();
  const clock = deadlineClock(t);
  const signals = [];
  const transport = createRemoteMemoryTransport({ url: "https://memory.example", apiKey: "secret",
    fetchImpl: async (url, { signal }) => {
      signals.push(signal);
      if (String(url).endsWith("/status")) {
        clock.advance(75_000);
        return jsonResponse({ readOnlyRetrieval: "lexical-immutable-v1" });
      }
      clock.advance(45_000);
      throw signal.reason;
    },
  });
  await assert.rejects(transport.compactSearchMemory("query", 5, { timeoutMs: 120_000, readOnly: true }), error => error.code === "execution_timeout");
  assert.equal(signals.length, 2);
  assert.equal(new Set(signals).size, 1);
  assert.deepEqual(clock.delays, [120_000]);
  assert.equal(clock.active.size, 0);
});

test("index and legacy reads retain their single default deadlines", async t => {
  const { createRemoteMemoryTransport } = await loadClientModule();
  const clock = deadlineClock(t);
  const transport = createRemoteMemoryTransport({ url: "https://memory.example", apiKey: "secret", fetchImpl: async () => jsonResponse({}) });
  await transport.indexMemory();
  await transport.memoryRootStatus();
  assert.deepEqual(clock.delays, [610_000, 70_000]);
  assert.equal(clock.active.size, 0);
});
