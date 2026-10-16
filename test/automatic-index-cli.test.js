import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installFakeQmd } from "./fake-qmd-helper.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { ensureMemoryIndexed } from "../dist/runtime/index.js";
import { buildQmdIndex, withQmdOperation } from "../dist/adapters/qmd/index.js";

const execute = promisify(execFile);
const cli = new URL("../dist/cli.js", import.meta.url).pathname;
const id = "mem_80000000-0000-4000-8000-000000000001";
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jb-auto-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { bin } = await installFakeQmd(root);
  await writeFile(bin, `#!${process.execPath}
const fs = require('node:fs');
const db = JSON.parse(fs.readFileSync(process.env.INDEX_PATH, 'utf8'));
console.log(JSON.stringify(db.documents.filter(d => d.active === 1 && d.collection === 'jumpybrain').map(d => ({file:'qmd://jumpybrain/'+d.file,score:0.8,line:1,snippet:db.content[d.hash]}))));
`);
  await chmod(bin, 0o755);
  const env = { ...process.env, JUMPYBRAIN_QMD_BIN: bin, JUMPYBRAIN_QMD_EMBED: "1", QMD_EMBED_MODEL: "/missing.gguf" };
  const run = args => execute(process.execPath, [cli, ...args], { env });
  await mkdir(path.join(root, "notes"));
  const put = suffix => writeFile(path.join(root, "notes/a.md"), `---\nid: ${id}\ntitle: Quartz dispatch\n---\nQuartz dispatch remains provisional, NOT production approved. ${suffix}\n`);
  const generation = async () => JSON.parse(await readFile(path.join(root, ".jumpybrain/index.json"), "utf8")).generation;
  return { root, run, put, generation, env };
}

test("CLI/recipes repair by default and forward no-refresh for rich and compact reads", async t => {
  const f = await fixture(t);
  await f.put("initial");
  const status = JSON.parse((await f.run(["status", "--root", f.root, "--json"])).stdout);
  assert.equal(status.readiness.freshness, "missing");
  await f.run(["show", "--root", f.root, "--id", id, "--json"]);
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/index.json")), false);
  await assert.rejects(f.run(["recall", "--root", f.root, "--query", "quartz", "--no-refresh"]), /Memory index not found/);
  const initial = JSON.parse((await f.run(["recall", "--root", f.root, "--query", "quartz", "--json"])).stdout);
  assert.equal(initial.readiness.freshness, "fresh");
  let sequence = 0;
  for (const command of [["recall"], ["search"], ["run", "memory:recall"], ["run", "memory:search"]]) {
    for (const mode of [["--json"], ["--compact", "--max-bytes", "2048"]]) {
      await f.put("external edit " + "x".repeat(++sequence));
      const generation = await f.generation();
      const args = [...command, "--root", f.root, "--query", "quartz", ...mode];
      const stale = JSON.parse((await f.run([...args, "--no-refresh"])).stdout);
      assert.equal(stale.readiness.freshness, "stale");
      assert.equal(stale.retrieval.status, "partial");
      assert.equal(await f.generation(), generation);
      const { stdout } = await f.run(args);
      const fresh = JSON.parse(stdout);
      assert.equal(fresh.readiness.freshness, "fresh");
      assert.notEqual(await f.generation(), generation);
      if (mode.includes("--compact")) assert.ok(Buffer.byteLength(stdout) <= 2048);
    }
  }
  assert.equal(existsSync(path.join(f.root, "jumpybrain.json")), false);
});

test("protected hosted recall does not repair missing state behind a read-only target", async t => {
  const f = await fixture(t);
  await f.put("hosted initial");
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = f.env.JUMPYBRAIN_QMD_BIN;
  t.after(() => { if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous; });
  const server = await startJumpyBrainHttpServer({ root: f.root, apiKeys: ["secret"], port: 0, autoIndex: false, logger: { log() {}, info() {}, warn() {}, error() {} } });
  t.after(() => server.close());
  const policy = path.join(f.root, ".jumpybrain/policy.json");
  await writeFile(policy, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: server.url, access: "read-only" }] }));
  for (const mode of [["--json"], ["--compact"]]) {
    await assert.rejects(execute(process.execPath, [cli, "recall", "--target-url", server.url, "--query", "quartz", ...mode], {
      env: { ...f.env, JUMPYBRAIN_API_KEY: "secret", JUMPYBRAIN_CLI_CONFIG: policy },
    }));
  }
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/index.json")), false);
  assert.equal(existsSync(path.join(f.root, "jumpybrain.json")), false);
});

test("readiness discovery respects the operation deadline even when diagnostics I/O stalls", { skip: process.platform === "win32" }, async t => {
  const f = await fixture(t);
  const fifo = path.join(f.root, ".jumpybrain/index-failure.json");
  await execute("mkfifo", [fifo]);
  const operation = ensureMemoryIndexed(f.root, { timeoutMs: 30 });
  const outcome = await Promise.race([operation.then(() => "success", error => error.code),
    new Promise(resolve => setTimeout(() => resolve("still-blocked"), 500))]);
  // Release any detached read-only wait; r+ never blocks if cancellation won
  // before opening the FIFO, avoiding a stranded writer in an overloaded suite.
  await execute(process.execPath, ["-e", "const fs=require('node:fs');const fd=fs.openSync(process.argv[1],'r+');fs.writeSync(fd,'{}');fs.closeSync(fd)", fifo]);
  await operation.catch(() => {});
  assert.equal(outcome, "execution_timeout");
});

test("post-discovery automatic policy reads stop at the search deadline and release the root lock", { skip: process.platform === "win32" }, async t => {
  const f = await fixture(t);
  const fifo = path.join(f.root, "jumpybrain.json");
  await execute("mkfifo", [fifo]);
  const operation = withQmdOperation(f.root, "search", { timeoutMs: 100 }, () =>
    buildQmdIndex(f.root, [], { persistPolicy: false }));
  const outcome = await Promise.race([operation.then(() => "success", error => error.code),
    new Promise(resolve => setTimeout(() => resolve("still-blocked"), 500))]);
  await execute(process.execPath, ["-e", "const fs=require('node:fs');const fd=fs.openSync(process.argv[1],'r+');fs.writeSync(fd,'{}');fs.closeSync(fd)", fifo]);
  await operation.catch(() => {});
  assert.equal(outcome, "execution_timeout");
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/index.lock")), false);
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/qmd-cache/qmd/index.sqlite")), false);
});
