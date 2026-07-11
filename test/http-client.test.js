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
