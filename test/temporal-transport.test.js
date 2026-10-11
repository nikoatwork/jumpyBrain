import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { createRemoteMemoryTransport } from "../dist/adapters/http-client/index.js";
import { validBoundedPacket } from "../dist/adapters/http-client/bounded-response.js";
import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
import { compactSearchMemory, searchMemory, resolveTemporalQuery, readMarkdownDocuments } from "../dist/runtime/index.js";
import { packCompactRecall, serializeCompactRecall } from "../dist/core/retrieval-policy/compact.js";
import { parseArgs } from "../dist/cli/args.js";
import { manifestPath } from "../dist/adapters/qmd/qmd-driver.js";
import { installFakeQmd } from "./fake-qmd-helper.js";

const execute = promisify(execFile);
const cli = new URL("../dist/cli.js", import.meta.url).pathname;
const temporal = { from: "t-2d", to: "2025-01-03", referenceDate: "2025-01-03", order: "chronological" };
const interval = resolveTemporalQuery(temporal);
const coverage = { eligibleDocuments: 1, excludedUndated: 0, excludedInvalid: 0, backfillBudget: 10, backfilledDocuments: 0, unvisitedDocuments: 0 };
const envelope = { query: "calibration", depth: "normal", readiness: { freshness: "fresh", modes: ["lexical"], embedding: "disabled" }, retrieval: { status: "complete", warnings: [] } };
const passage = { filePath: "notes/evidence.md", pathBasis: "canonical_root", startLine: 1, endLine: 1, text: "Calibration is provisional, NOT production approved.", scope: "excerpt", partial: true,
  date: { basis: "written", value: "2026-01-01", field: "created_at" }, evidenceDate: { basis: "declared", value: "2025-01-02" },
  relationships: { conflicts_with: ["verbatim/id", "Old title"], supersedes: "Older title" }, expansion: { available: false, reason: "missing_id" } };

function packet(maxBytes = 8192) { return packCompactRecall({ ...envelope, temporal: { interval, coverage } }, [{ passages: [passage] }], { maxBytes }); }

test("compact temporal schema, scope binding, explicit declarations and whole-byte budget", () => {
  const request = { query: "calibration", temporal };
  for (const maxBytes of [1024, 1400, 8192]) {
    const value = packet(maxBytes);
    assert.ok(Buffer.byteLength(serializeCompactRecall(value)) <= maxBytes);
    assert.ok(validBoundedPacket(value, "recall", maxBytes, request));
    for (const p of value.passages) assert.deepEqual(p.relationships, passage.relationships);
  }
  const value = packet();
  assert.equal(value.passages[0].date.value, "2026-01-01");
  assert.equal(value.passages[0].evidenceDate.value, "2025-01-02");
  assert.equal(validBoundedPacket(value, "recall", 8192, { query: "calibration" }), false);
  for (const mutate of [p => delete p.temporal, p => p.temporal.interval.from = "2020-01-01T00:00:00.000Z",
    p => p.temporal.coverage.extra = 0, p => p.passages[0].evidenceDate.basis = ["declared"], p => p.passages[0].evidenceDate.value = "2024-01-01",
    p => p.passages[0].relationships.inferred = "yes", p => p.passages[0].relationships.supersedes = 3]) {
    const bad = structuredClone(value); mutate(bad);
    assert.equal(validBoundedPacket(bad, "recall", 8192, request), false);
  }
  const legacy = packCompactRecall(envelope, [{ passages: [passage] }]);
  assert.equal(legacy.temporal, undefined);
  assert.equal(legacy.passages[0].evidenceDate, undefined);
  assert.equal(legacy.passages[0].relationships, undefined);
  assert.ok(validBoundedPacket(legacy, "recall", 8192, { query: "calibration" }));
  const huge = { ...passage, relationships: { supersedes: "🐙".repeat(5000) } };
  const small = packCompactRecall({ ...envelope, temporal: { interval, coverage } }, [{ passages: [huge] }], { maxBytes: 1400 });
  assert.equal(small.passages.length, 0);
  assert.equal(small.omitted.passages, 1);
});

test("new rich and compact clients reject old or scope-mismatched servers without fallback", async () => {
  for (const compact of [false, true]) {
    let calls = 0;
    let response = compact ? packCompactRecall(envelope, []) : { query: "calibration", results: [] };
    const remote = createRemoteMemoryTransport({ url: "https://memory.invalid", apiKey: "secret", fetchImpl: async (_url, init) => {
      calls++;
      assert.deepEqual(JSON.parse(init.body).temporal, temporal);
      return Response.json(response);
    } });
    const invoke = options => compact ? remote.compactSearchMemory("calibration", 5, options) : remote.searchMemory("calibration", 5, options);
    await assert.rejects(invoke({ temporal: { from: "t-1d" } }), { code: "invalid_temporal" });
    assert.equal(calls, 0);
    await assert.rejects(invoke({ temporal }), /[Uu]pgrade the server/);
    response = compact ? packet() : { results: [], temporal: { interval, coverage } };
    await invoke({ temporal });
    response = structuredClone(response);
    response.temporal.interval.order = "relevance";
    await assert.rejects(invoke({ temporal }), /[Uu]pgrade the server/);
    assert.equal(calls, 3);
  }
});

test("temporal CLI strictly rejects malformed, repeated and unknown flags before credentials", async () => {
  for (const flags of [["--from"], ["--from=2025-02-30"], ["--from", "t-1d"], ["--order", "latest"],
    ["--from", "2025-01-01", "--from=2025-01-02"], ["--from", "2025-01-01", "--typo", "x"],
    ["--order", "chronological", "--json=false"], ["--to", "2025-01-01T12:00:00"], ["--order", "chronological", "--limit=NaN"]]) {
    for (const command of [["search"], ["run", "memory:recall"]]) {
      await assert.rejects(execute(process.execPath, [cli, ...command, "--query", "calibration", "--target-url", "https://memory.invalid", ...flags],
        { env: { ...process.env, JUMPYBRAIN_API_KEY: "", JUMPYBRAIN_CLI_CONFIG: "/tmp/nonexistent-temporal-policy" } }), error => {
          assert.equal(error.stdout, "");
          assert.doesNotMatch(error.stderr, /API_KEY is required|fetch failed/);
          return true;
        });
    }
  }
  assert.equal(parseArgs(["search", "--order=chronological"]).order, "chronological");
});

test("temporal local/HTTP/CLI parity, safe invalid_temporal errors, and changed-source omission", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-temporal-wire-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "notes"));
  const file = path.join(root, "notes/evidence.md");
  const content = "---\nid: mem_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\ntype: note\ndate: 2025-01-02\ncreated_at: 2026-01-01\nconflicts_with: [Old claim, Other claim]\nsupersedes: Previous claim\n---\nCalibration is provisional, NOT production approved.\n";
  await writeFile(file, content);
  const { bin } = await installFakeQmd(root);
  await writeFile(bin, `#!${process.execPath}\nconsole.log(JSON.stringify([{file:'qmd://jumpybrain/notes/evidence.md',score:0.9,line:9,snippet:'Calibration is provisional, NOT production approved.'}]));\n`);
  await chmod(bin, 0o755);
  const old = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = bin;
  t.after(() => { if (old === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = old; });
  await mkdir(path.dirname(manifestPath(root)), { recursive: true });
  await writeFile(manifestPath(root), JSON.stringify({ version: 1, root, qmdCollection: "jumpybrain", generatedAt: new Date(0).toISOString(), documents: await readMarkdownDocuments(root) }));
  const server = await startJumpyBrainHttpServer({ root, port: 0, apiKeys: ["secret"], autoIndex: false, logger: { info() {}, warn() {}, error() {}, log() {} } });
  t.after(() => server.close());
  const remote = createRemoteMemoryTransport({ url: server.url, apiKey: "secret" });
  for (const maxBytes of [1024, 2048, 8192]) {
    const local = await compactSearchMemory(root, "calibration", 5, { temporal, maxBytes });
    assert.deepEqual(await remote.compactSearchMemory("calibration", 5, { temporal, maxBytes }), local);
    assert.ok(Buffer.byteLength(serializeCompactRecall(local)) <= maxBytes);
    if (maxBytes > 1024) {
      assert.ok(local.passages.length);
      assert.deepEqual(local.passages[0].relationships, { conflicts_with: ["Old claim", "Other claim"], supersedes: "Previous claim" });
    }
  }
  const local = await searchMemory(root, "calibration", 5, { temporal });
  const rich = await remote.searchMemory("calibration", 5, { temporal });
  assert.deepEqual(rich.temporal, local.temporal);
  assert.deepEqual(rich.results, JSON.parse(JSON.stringify(local.results)));
  for (const route of ["search", "recall", "recall/compact"]) {
    for (const invalid of [null, [], { from: "t-1d" }, { from: "2025-02-30" }, { order: "latest" }, { from: "2025-01-01", order: null }, { from: "2025-01-01", secret: root }]) {
      const response = await fetch(`${server.url}/memories/all/${route}`, { method: "POST", headers: { Authorization: "Bearer secret", "Content-Type": "application/json" }, body: JSON.stringify({ query: "calibration", temporal: invalid }) });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error.code, "invalid_temporal");
      assert.equal(JSON.stringify(body).includes(root), false);
    }
  }
  for (const target of [["--root", root], ["--target-url", server.url]]) {
    const flags = ["--query", "calibration", "--from=t-2d", "--to=2025-01-03", "--reference-date=2025-01-03", "--order=chronological"];
    const env = { ...process.env, JUMPYBRAIN_API_KEY: "secret", JUMPYBRAIN_CLI_CONFIG: path.join(root, "absent-policy") };
    const human = await execute(process.execPath, [cli, "recall", ...target, ...flags], { env });
    assert.match(human.stdout, /Evidence interval \(UTC\)/);
    assert.match(human.stdout, /Evidence date: 2025-01-02 \(declared\)/);
    assert.match(human.stdout, /Declared conflicts_with/);
    assert.match(human.stdout, /Warning:/);
    const bounded = await execute(process.execPath, [cli, "run", "memory:search", ...target, ...flags, "--limit=5", "--compact"], { env });
    assert.equal(bounded.stdout, serializeCompactRecall(await compactSearchMemory(root, "calibration", 5, { temporal })));
  }
  await writeFile(file, content.replace("date: 2025-01-02", "date: 2024-01-02"));
  const refreshed = await compactSearchMemory(root, "calibration", 5, { temporal });
  assert.equal(refreshed.passages.length, 0);
  assert.ok(refreshed.retrieval.warnings.includes("source_changed"));
  assert.equal(refreshed.retrieval.status, "partial");
  assert.equal(refreshed.omitted.passages, 0, "changed evidence was excluded before compact candidate packing");
});
