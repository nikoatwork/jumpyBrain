import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { repoRoot } from "./source-graph-helpers.js";

async function loadServerModule() {
  return import(pathToFileURL(path.join(repoRoot, "dist/server/index.js")).href);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("remote auto-index tick indexes stale state and skips fresh state", async () => {
  const serverModule = await loadServerModule();
  const events = [];
  let indexCalls = 0;
  const runner = serverModule.createRemoteIndexRunner({
    root: "/tmp/memory",
    logger: (level, event, details) => events.push({ level, event, details }),
    indexMemory: async (root) => {
      indexCalls += 1;
      return { root, documents: 3, qmdCollection: "jumpybrain" };
    },
    markFresh: async (_root, result) => ({ version: 1, stale: false, documents: result.documents, qmdCollection: result.qmdCollection }),
  });
  const states = [{ version: 1, stale: false }, { version: 1, stale: true }];
  const autoIndex = serverModule.startRemoteAutoIndexer({
    root: "/tmp/memory",
    indexRunner: runner,
    startTimer: false,
    readState: async () => states.shift(),
    logger: (level, event, details) => events.push({ level, event, details }),
  });

  assert.equal(await autoIndex.tick(), "skipped-not-stale");
  assert.equal(indexCalls, 0);

  assert.equal(await autoIndex.tick(), "indexed");
  assert.equal(indexCalls, 1);
  assert.ok(events.some((entry) => entry.event === "skipped-not-stale"));
  assert.ok(events.some((entry) => entry.event === "success" && entry.details.documents === 3));
  autoIndex.stop();
});

test("remote auto-index failures are swallowed and later ticks can retry", async () => {
  const serverModule = await loadServerModule();
  let indexCalls = 0;
  const runner = serverModule.createRemoteIndexRunner({
    root: "/tmp/memory",
    logger: () => {},
    indexMemory: async (root) => {
      indexCalls += 1;
      if (indexCalls === 1) throw new Error("qmd unavailable");
      return { root, documents: 1, qmdCollection: "jumpybrain" };
    },
    markFresh: async (_root, result) => ({ version: 1, stale: false, documents: result.documents, qmdCollection: result.qmdCollection }),
  });
  const autoIndex = serverModule.startRemoteAutoIndexer({
    root: "/tmp/memory",
    indexRunner: runner,
    startTimer: false,
    readState: async () => ({ version: 1, stale: true }),
    logger: () => {},
  });

  assert.equal(await autoIndex.tick(), "failed");
  assert.equal(await autoIndex.tick(), "indexed");
  assert.equal(indexCalls, 2);
  autoIndex.stop();
});

test("remote index runner keeps state stale when a write races with indexing", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-auto-index-race-"));
  try {
    const runner = serverModule.createRemoteIndexRunner({
      root: tempRoot,
      logger: () => {},
      indexMemory: async (root) => {
        await serverModule.writeRemoteIndexState(root, { version: 1, stale: true, lastWriteAt: new Date(Date.now() + 1000).toISOString() });
        return { root, documents: 2, qmdCollection: "jumpybrain" };
      },
    });

    const run = await runner.indexNow("auto");
    assert.equal(run.index.stale, true);
    assert.equal(run.index.documents, 2);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("remote index runner does not run overlapping index jobs", async () => {
  const serverModule = await loadServerModule();
  let indexCalls = 0;
  const gate = deferred();
  const runner = serverModule.createRemoteIndexRunner({
    root: "/tmp/memory",
    logger: () => {},
    indexMemory: async (root) => {
      indexCalls += 1;
      await gate.promise;
      return { root, documents: 5, qmdCollection: "jumpybrain" };
    },
    markFresh: async (_root, result) => ({ version: 1, stale: false, documents: result.documents, qmdCollection: result.qmdCollection }),
  });

  const first = runner.indexNow("manual");
  const second = runner.indexNow("auto");
  assert.equal(indexCalls, 1);
  gate.resolve();

  assert.equal((await first).result.documents, 5);
  assert.equal((await second).result.documents, 5);
  assert.equal(indexCalls, 1);
});

test("server auto-index tick can refresh stale state after a remote write", async () => {
  const serverModule = await loadServerModule();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-auto-index-"));
  const memory = serverModule.createServerMemoryRuntime({ root: tempRoot });
  await memory.initializeMemoryRoot();
  const started = await serverModule.startJumpyBrainHttpServer({ root: tempRoot, apiKeys: ["secret"], port: 0, autoIndex: { startTimer: false } });
  try {
    const headers = { Authorization: "Bearer secret", "Content-Type": "application/json", "Idempotency-Key": "auto-index-write" };
    const created = await fetch(`${started.url}/memories/all/notes`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "finding", title: "Auto index smoke", body: "Auto index should pick up this remote write." }),
    });
    assert.equal(created.status, 200);
    assert.equal((await created.json()).index.stale, true);

    assert.equal(await started.autoIndex.tick(), "indexed");

    const status = await fetch(`${started.url}/memories/all/status`, { headers: { Authorization: "Bearer secret" } });
    const statusPayload = await status.json();
    assert.equal(status.status, 200);
    assert.equal(statusPayload.index.stale, false);
    assert.equal(statusPayload.index.documents, 1);
  } finally {
    await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
