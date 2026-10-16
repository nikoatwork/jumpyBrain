#!/usr/bin/env node
/** Opt-in only; never imported by npm test. Build dist first (npx tsc).
 * JUMPYBRAIN_QMD_BIN=/absolute/path/qmd JUMPYBRAIN_SMOKE_MODEL=/absolute/local.gguf \
 *   node scripts/semantic-index-smoke.mjs
 * Optional: JUMPYBRAIN_SMOKE_SIGKILL=1 exercises a real worker interruption.
 * No install/download commands; all roots/guards are disposable. One JSON report.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const bin = process.env.JUMPYBRAIN_QMD_BIN;
const model = process.env.JUMPYBRAIN_SMOKE_MODEL;
assert.ok(bin && path.isAbsolute(bin) && model && path.isAbsolute(model),
  "Opt-in requires absolute JUMPYBRAIN_QMD_BIN and JUMPYBRAIN_SMOKE_MODEL; provision QMD 2.8.3 and GGUF first.");
assert.ok((await stat(model)).isFile(), "Model must already exist locally.");
const { resolveQmdSdk, databasePath } = await import("../dist/adapters/qmd/qmd-cli.js");
const sdkPath = resolveQmdSdk(); // Exact production package/version check.
const pkgRoot = path.resolve(sdkPath, "../..");
assert.equal(JSON.parse(await readFile(path.join(pkgRoot, "package.json"))).version, "2.8.3");
const digest = createHash("sha256");
for await (const chunk of createReadStream(model)) digest.update(chunk);
const modelHash = digest.digest("hex");
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-real-semantic-")));
const root = path.join(temporary, "memory");
const report = { qmd: "2.8.3", node: process.version, platform: `${process.platform}/${process.arch}`,
  model: path.basename(model), modelBytes: (await stat(model)).size, modelHash, steps: [] };
const started = performance.now();
const previousNodeOptions = process.env.NODE_OPTIONS;
const envKeys = ["NODE_OPTIONS", "JUMPYBRAIN_QMD_EMBED", "QMD_EMBED_MODEL", "GGML_METAL_NO_RESIDENCY", "QMD_SOURCE_MODE"];
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
let db;
let httpServer;
try {
  await mkdir(root);
  // Apply local-only model/native-runtime guards to the real CLI as well as the
  // production worker. This changes no queries/results; accidental downloads fail.
  const guard = path.join(temporary, "offline-guard.mjs");
  await writeFile(guard, `
    import http from "node:http";
    import https from "node:https";
    import { syncBuiltinESMExports } from "node:module";
    import { stat } from "node:fs/promises";
    import path from "node:path";
    const denied = () => { throw new Error("Smoke forbids network access"); };
    globalThis.fetch = denied;
    http.request = http.get = https.request = https.get = denied;
    syncBuiltinESMExports();
    const { LlamaCpp } = await import(${JSON.stringify(pathToFileURL(path.join(pkgRoot, "dist/llm.js")).href)});
    LlamaCpp.prototype.resolveModel = async function(uri) {
      if (!path.isAbsolute(uri) || !(await stat(uri)).isFile()) throw new Error("Smoke requires a provisioned local model");
      return uri;
    };
    const ensure = LlamaCpp.prototype.ensureLlama;
    LlamaCpp.prototype.ensureLlama = function() { return ensure.call(this, false); };
  `);
  process.env.NODE_OPTIONS = `${previousNodeOptions ?? ""} --import=${pathToFileURL(guard).href}`.trim();
  process.env.JUMPYBRAIN_QMD_EMBED = "";
  process.env.QMD_EMBED_MODEL = "";
  process.env.GGML_METAL_NO_RESIDENCY = "1";
  process.env.QMD_SOURCE_MODE = "0";
  const local = await import("../dist/app/local-memory/index.js");
  const server = await import("../dist/app/server-memory/index.js");
  const { searchWithQmdCli } = await import("../dist/adapters/qmd/qmd-query.js");
  const require = createRequire(sdkPath);
  const Database = require("better-sqlite3");
  const policy = { mode: "semantic", model, modelHash };
  const manifestFile = path.join(root, ".jumpybrain/index.json");
  const manifest = async () => JSON.parse(await readFile(manifestFile, "utf8"));
  const put = (file, body) => writeFile(path.join(root, file), body);
  const timed = async (name, operation) => {
    const start = performance.now();
    const result = await operation();
    report.steps.push({ name, ms: Math.round(performance.now() - start),
      ...(result?.work ? { work: result.work } : {}) });
    return result;
  };
  const index = async (name, expected, options = {}) => {
    const result = await timed(name, () => local.indexMemory(root, options));
    assert.deepEqual(result.work, { added: 0, updated: 0, unchanged: 0, removed: 0, embedded: 0, ...expected }, name);
    assert.equal(result.readiness.freshness, "fresh", name);
    return result;
  };
  const heart = "---\ntitle: Clinic note\n---\nThe cardiologist prescribed daily aerobic exercise to strengthen cardiac health and lower hypertension.\n";
  await put("heart.md", heart);
  await put("copper.md", "---\ntitle: Circuit note\n---\nCopper circuits transmit electrical signals through insulated wires.\n");
  await put("empty.md", "");
  await index("initial", { added: 3, embedded: 2 }, { indexing: policy });
  assert.equal((await manifest()).embedding.modelHash, modelHash);
  db = new Database(databasePath(root), { timeout: 0 });
  require("sqlite-vec").load(db);
  const state = () => ({
    documents: db.prepare("SELECT * FROM documents ORDER BY id").all(),
    content: db.prepare("SELECT * FROM content ORDER BY hash").all(),
    fts: db.prepare("SELECT rowid, * FROM documents_fts ORDER BY rowid").all(),
    metadata: db.prepare("SELECT * FROM content_vectors ORDER BY hash, seq").all(),
    vectors: db.prepare("SELECT hash_seq, embedding FROM vectors_vec ORDER BY hash_seq").all(),
    generation: db.prepare("SELECT * FROM jb_generation").all(),
  });
  await index("noop", { unchanged: 3 });
  // A genuine semantic-only paraphrase: all production lexical variants return
  // nothing, yet production app search (structured vec, no rerank) finds evidence.
  const query = "physician recommends workouts for high blood pressure";
  assert.deepEqual(await timed("paraphrase-lexical-control", () => searchWithQmdCli(root, query, 10, { semantic: false })), []);
  const semantic = await timed("paraphrase-local", () => local.searchMemory(root, query, 10));
  assert.equal(semantic.retrieval.status, "complete", JSON.stringify(semantic.retrieval));
  assert.ok(semantic.results.some(row => row.provenance.file === "heart.md"), "Semantic-only evidence missing");
  const hosted = await timed("paraphrase-server-app", () => server.searchServerMemory({ root, query, limit: 10 }));
  assert.deepEqual(hosted.results, semantic.results);
  assert.deepEqual(hosted.retrieval, semantic.retrieval);
  report.semanticOnlyFiles = semantic.results.map(row => row.provenance.file);
  const { startJumpyBrainHttpServer } = await import("../dist/adapters/http-server/index.js");
  httpServer = await startJumpyBrainHttpServer({ root, apiKeys: ["disposable-smoke-key"], port: 0, autoIndex: false });
  const remote = async (route, body) => {
    const response = await fetch(httpServer.url + "/memories/all/" + route, {
      method: "POST", headers: { authorization: "Bearer disposable-smoke-key", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    const packet = await response.json();
    assert.equal(JSON.stringify(packet).includes(root), false, "Remote response leaked host root");
    assert.equal(JSON.stringify(packet).includes(model), false, "Remote response leaked model path");
    return packet;
  };
  const httpResult = await timed("paraphrase-http", () => remote("search", { query, limit: 10 }));
  assert.deepEqual(httpResult.results, JSON.parse(JSON.stringify(semantic.results)));
  assert.deepEqual(httpResult.readiness, semantic.readiness);
  const httpIndex = await timed("noop-http-index", () => remote("index", {}));
  assert.equal(httpIndex.work.embedded, 0);
  assert.equal(httpIndex.readiness.freshness, "fresh");
  await put("heart.md", heart + "Follow-up is scheduled next month.\n");
  await index("edit", { updated: 1, unchanged: 2, embedded: 1 });
  await rename(path.join(root, "heart.md"), path.join(root, "renamed.md"));
  await index("rename", { added: 1, unchanged: 2, removed: 1 });
  await rm(path.join(root, "copper.md"));
  await index("delete", { unchanged: 2, removed: 1 });
  const edited = await readFile(path.join(root, "renamed.md"), "utf8");
  await put("renamed.md", edited.replace("title:", "dream: true\ntitle:"));
  await index("dream-on", { updated: 1, unchanged: 1, embedded: 1 });
  assert.equal(db.prepare("SELECT count(*) AS n FROM documents WHERE active=1 AND collection='jumpybrain-dreams'").get().n, 1);
  const dreamHash = db.prepare("SELECT hash FROM documents WHERE active=1 AND collection='jumpybrain-dreams'").get().hash;
  assert.equal(db.prepare("SELECT count(*) AS n FROM content_vectors WHERE hash=?").get(dreamHash).n, 1);
  await put("renamed.md", edited);
  await index("dream-off", { updated: 1, unchanged: 1 });
  assert.equal(db.prepare("SELECT count(*) AS n FROM documents WHERE active=1 AND collection='jumpybrain-dreams'").get().n, 0);
  const beforeFailure = state();
  const beforeManifest = await manifest();
  const badModel = path.join(temporary, "invalid.gguf");
  await writeFile(badModel, "GGUFnot a valid provisioned model");
  await timed("failed-model-rebuild-rollback", async () => {
    await assert.rejects(local.indexMemory(root, { rebuild: true, indexing: { mode: "semantic", model: badModel } }), /failed during embed/);
    assert.deepEqual(state(), beforeFailure, "Failed rebuild changed committed SQL state");
    assert.deepEqual(await manifest(), beforeManifest);
  });
  await index("failed-model-recovery", { unchanged: 2 }, { indexing: policy });
  // Remove only FTS rows, retaining unchanged canonical hashes. Routine indexing
  // deliberately does not integrity-scan them; full rebuild must restore them.
  db.exec("DELETE FROM documents_fts");
  assert.deepEqual(await searchWithQmdCli(root, "hypertension", 10, { semantic: false }), []);
  await index("missing-fts-rebuild", { added: 2, embedded: 1 }, { rebuild: true });
  const repaired = await searchWithQmdCli(root, "hypertension", 10, { semantic: false });
  assert.deepEqual(repaired.map(row => row.file), ["renamed.md"]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM documents").get().n, 2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM content").get().n, 2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM documents_fts").get().n, 2);
  if (process.env.JUMPYBRAIN_SMOKE_SIGKILL === "1") {
    await timed("sigkill-worker-rollback", async () => {
      const before = state();
      const committed = await manifest();
      const worker = spawn(process.execPath, [fileURLToPath(new URL("../dist/adapters/qmd/qmd-worker.js", import.meta.url))],
        { env: process.env, stdio: ["pipe", "ignore", "ignore"] });
      let exited = false;
      const finished = new Promise((resolve, reject) => {
        worker.on("error", reject);
        worker.on("exit", (code, signal) => { exited = true; resolve({ code, signal }); });
      });
      worker.stdin.on("error", () => {});
      worker.stdin.end(JSON.stringify({ sdkPath, root, sourceRoot: root, dbPath: databasePath(root),
        ownerPid: process.pid, policy, rebuild: true, manifest: { ...committed, generation: "must-not-commit" },
        documents: [{ relativePath: "killed.md", content: "Uncommitted replacement snapshot.", frontmatter: {} }] }));
      let locked = false;
      const deadline = Date.now() + 15000;
      try {
        while (!exited && Date.now() < deadline) {
          try { db.exec("BEGIN IMMEDIATE"); db.exec("ROLLBACK"); }
          catch (error) { if (error.code === "SQLITE_BUSY") { locked = true; break; } throw error; }
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      } finally { if (!exited) worker.kill("SIGKILL"); }
      assert.equal((await finished).signal, "SIGKILL");
      assert.ok(locked, "Did not observe worker write transaction before kill");
      assert.deepEqual(state(), before, "Killed worker changed committed SQL state");
    });
    await index("sigkill-recovery", { unchanged: 2 });
  } else report.sigkill = "not requested";
  await index("lexical-mode", { unchanged: 2 }, { indexing: { mode: "lexical" } });
  const lexical = await timed("lexical-local", () => local.searchMemory(root, "hypertension", 10));
  const remoteLexical = await timed("lexical-server-app", () => server.searchServerMemory({ root, query: "hypertension", limit: 10 }));
  assert.deepEqual(lexical.results, remoteLexical.results);
  assert.deepEqual(lexical.readiness.modes, ["lexical"]);
  assert.equal(lexical.results[0].provenance.file, "renamed.md");
  await index("semantic-restored", { unchanged: 2 }, { indexing: policy });
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await httpServer?.close();
  db?.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await rm(temporary, { recursive: true, force: true });
  report.totalMs = Math.round(performance.now() - started);
  report.scope = "Disposable tiny fixture; local/server app/HTTP parity, not a quality/scale benchmark. Network/model downloads blocked.";
  console.log(JSON.stringify(report, null, 2));
}
