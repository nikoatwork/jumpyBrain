import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { doctorReport, formatDoctorReport } from "../dist/cli/doctor.js";
import { createRemoteMemoryTransport } from "../dist/adapters/http-client/index.js";
import { createRemoteIndexRunner } from "../dist/app/server-memory/auto-index.js";
import { markRemoteIndexFresh, markRemoteIndexStale, readRemoteIndexState } from "../dist/app/server-memory/state.js";

const readiness = { freshness: "stale", modes: ["lexical"], embedding: "incomplete" };
const retrieval = { status: "partial", warnings: ["semantic_unavailable"] };
const result = { root: "/private/root", documents: 2, qmdCollection: "memory", readiness, work: { added: 2, updated: 0, unchanged: 0, removed: 0, embedded: 0 } };
async function capture(operation) {
  const lines = [];
  const previous = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try { await operation(); } finally { console.log = previous; }
  return lines.join("\n");
}
async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-seams-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("CLI index forwards explicit policy/rebuild and emits real additive JSON", async () => {
  const { runMemoryCommand } = await import("../dist/cli/memory-commands.js");
  const calls = [];
  const local = { indexMemory: async (...args) => { calls.push(args); return result; } };
  const output = await capture(() => runMemoryCommand("index", { _: [], root: "/private/root", rebuild: true, "semantic-model": "/models/local.gguf", json: true }, local));
  assert.deepEqual(JSON.parse(output), result);
  assert.deepEqual(calls[0], ["/private/root", { rebuild: true, indexing: { mode: "semantic", model: "/models/local.gguf" } }]);
  const plain = await capture(() => runMemoryCommand("index", { _: [], root: "/private/root", lexical: true }, local));
  assert.match(plain, /Indexed 2 Markdown documents/);
  assert.match(plain, /Readiness: stale/);
  assert.deepEqual(calls[1][1], { indexing: { mode: "lexical" } });
  for (const args of [{ lexical: true, "semantic-model": "/model" }, { "semantic-model": "relative.gguf" }, { rebuild: "false" }]) {
    await assert.rejects(runMemoryCommand("index", { _: [], root: "/private/root", ...args }, local));
  }
});

test("CLI rejects remote policy before credentials/transport and warns before empty search/recall", async () => {
  const { runMemoryCommand } = await import("../dist/cli/memory-commands.js");
  await assert.rejects(runMemoryCommand("index", { _: [], "target-url": "https://example.test", lexical: true }, {}), /server-local policy/);
  for (const command of ["search", "recall"]) {
    const packet = { root: "/private/root", query: "missing", results: [], readiness, retrieval };
    const local = { searchMemory: async () => packet };
    const args = { _: [], root: "/private/root", query: "missing" };
    const plain = await capture(() => runMemoryCommand(command, args, local));
    assert.match(plain, /Warning: semantic_unavailable/);
    assert.ok(plain.indexOf("Warning:") < plain.indexOf("No "));
    const json = JSON.parse(await capture(() => runMemoryCommand(command, { ...args, json: true }, local)));
    assert.deepEqual(json.readiness, readiness);
    assert.deepEqual(json.retrieval, retrieval);
  }
});

test("HTTP index accepts only rebuild and preserves safe readiness/work; client preserves retrieval", async (t) => {
  const { routeRequest } = await import("../dist/adapters/http-server/routes.js");
  const calls = [];
  const server = createServer((request, response) => {
    routeRequest({ request, response, root: "/private/root", apiKeys: ["secret"],
      enqueueWrite: (operation) => operation(), logger: { info() {}, warn() {}, error() {} },
      indexRunner: { indexNow: async (...args) => { calls.push(args); return { result, index: { version: 1, stale: true } }; } },
    }).catch(() => { response.writeHead(599); response.end(); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const remote = createRemoteMemoryTransport({ url, apiKey: "secret" });
  const packet = await remote.indexMemory({ rebuild: true });
  assert.deepEqual(calls, [["manual", { rebuild: true }]]);
  assert.deepEqual(packet.readiness, readiness);
  assert.deepEqual(packet.work, result.work);
  assert.equal(packet.root, "remote:all");
  assert.ok(!JSON.stringify(packet).includes("/private/root"));
  for (const body of [{ indexing: { mode: "semantic", model: "/private/model" } }, { lexical: true }, { rebuild: "true" }]) {
    const response = await fetch(`${url}/memories/all/index`, { method: "POST", headers: { Authorization: "Bearer secret", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
    assert.ok(!JSON.stringify(await response.json()).includes("/private/model"));
  }
  assert.equal(calls.length, 1);
  assert.throws(() => remote.indexMemory({ indexing: { mode: "lexical" } }), /server-local/);
  const client = createRemoteMemoryTransport({ url, apiKey: "secret", fetchImpl: async () => new Response(JSON.stringify({ readiness, retrieval, results: [] })) });
  const search = await client.searchMemory("query", 5);
  assert.deepEqual(search.readiness, readiness);
  assert.deepEqual(search.retrieval, retrieval);
});

test("state mutators serialize read-modify-write and retain concurrent writes and stale readiness", async (t) => {
  const root = await temporary(t);
  const localResult = { ...result, root, readiness: { ...readiness, freshness: "fresh" } };
  const startedAt = "2026-01-01T00:00:00.000Z";
  await Promise.all([
    markRemoteIndexStale(root, "2026-01-01T00:00:01.000Z"),
    markRemoteIndexFresh(root, localResult, "2026-01-01T00:00:02.000Z", startedAt),
    markRemoteIndexStale(root, "2026-01-01T00:00:03.000Z"),
  ]);
  const state = await readRemoteIndexState(root);
  assert.equal(state.stale, true);
  assert.equal(state.lastWriteAt, "2026-01-01T00:00:03.000Z");
  assert.equal(state.lastIndexedAt, "2026-01-01T00:00:02.000Z");
  assert.equal(state.documents, 2);
  const run = await createRemoteIndexRunner({ root, indexMemory: async () => ({ ...result, root }) }).indexNow();
  assert.equal(run.index.stale, true, "canonical snapshot staleness must survive remote state marking");
});

test("overlapping rebuild is queued rather than silently joining an incremental index", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const runner = createRemoteIndexRunner({ root: "/private/root", indexMemory: async (_root, options) => {
    calls.push(options);
    await gate;
    return result;
  }, markFresh: async () => ({ version: 1, stale: true }) });
  const first = runner.indexNow("auto");
  const rebuild = runner.indexNow("manual", { rebuild: true });
  assert.equal(calls.length, 1);
  release();
  await Promise.all([first, rebuild]);
  assert.deepEqual(calls, [{}, { rebuild: true }]);
});

test("doctor requires QMD 2.8.3 and status readiness without model work or raw diagnostics", async (t) => {
  const root = await temporary(t);
  const binary = path.join(root, "qmd");
  const old = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = binary;
  t.after(() => { if (old === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = old; });
  const local = { memoryRootStatus: async () => ({ root, initialized: true, compatible: true, readiness }) };
  for (const [version, expected] of [["qmd 2.8.3 (facd35e)", true], ["qmd 2.8.3", true], ["qmd 2.8.2", false], ["private /secret/model diagnostic", false]]) {
    await writeFile(binary, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`, { mode: 0o700 });
    const report = await doctorReport({ _: [], root }, local);
    assert.equal(report.qmd.ok, expected);
    assert.deepEqual(report.memoryRoot.readiness, readiness);
    assert.ok(!report.qmd.message.includes(binary));
    assert.ok(!report.qmd.message.includes("/secret"));
    assert.match(formatDoctorReport(report), /Readiness: stale/);
  }
  const report = await doctorReport({ _: [], root }, { memoryRootStatus: async () => { throw new Error("private /secret/model"); } });
  assert.ok(!report.memoryRoot.message.includes("/secret"));
});
