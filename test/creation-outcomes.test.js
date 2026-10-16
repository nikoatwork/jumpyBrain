import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { rememberMemory, writeSessionWrapup } from "../dist/runtime/index.js";
import { failedCreationReplay } from "../dist/app/writing/creation-outcome.js";
import { withIdempotency } from "../dist/app/server-memory/idempotency.js";
import { failedCreationIndex } from "../dist/app/writing/creation-outcome.js";
import { writeServerMemoryWithIdempotency } from "../dist/app/server-memory/index.js";
import { activeFakeQmdFiles, fakeQmdState, installFakeQmd } from "./fake-qmd-helper.js";

const cli = new URL("../dist/cli.js", import.meta.url).pathname;
const wrapup = ["Findings", "Decisions", "Conflicts / Corrections", "Open Questions"].map(section => `## ${section}\n- None captured.`).join("\n\n");
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jb-creation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { bin, model } = await installFakeQmd(root);
  const queryScript = (await readFile(new URL("./fixtures/fake-qmd-lifecycle/bin/qmd", import.meta.url), "utf8"))
    .replace('import { readFileSync } from "node:fs";', 'const { readFileSync } = require("node:fs");')
    .replace('import helpers from "../database.cjs";', 'const helpers = require("../database.cjs");');
  await writeFile(bin, queryScript);
  await chmod(bin, 0o755);
  const control = path.join(root, ".jumpybrain/control.json");
  await writeFile(control, JSON.stringify({ fail: "ingest" }));
  const env = { ...process.env, JUMPYBRAIN_QMD_BIN: bin, FAKE_QMD_CONTROL: control, JUMPYBRAIN_QMD_EMBED: "0", JUMPYBRAIN_INDEX_TIMEOUT_MS: "10000" };
  return { root, control, env, model };
}
function child(args, { env, input = "" } = {}) {
  const processChild = spawn(process.execPath, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  processChild.stdout.on("data", data => { stdout += data; });
  processChild.stderr.on("data", data => { stderr += data; });
  processChild.stdin.end(input);
  const result = new Promise((resolve, reject) => {
    processChild.once("error", reject);
    processChild.once("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
  result.process = processChild;
  return result;
}
async function run(args, options) {
  const result = await child([cli, ...args], options);
  assert.equal(result.status, 0, result.stderr);
  return result;
}
function assertSaved(result, status) {
  assert.match(result.id, /^mem_/);
  assert.ok(result.file.endsWith(".md"));
  assert.equal(result.saved, true);
  assert.equal(result.indexed, status === "indexed");
  assert.equal(result.indexing.status, status);
  if (status !== "indexed") assert.match(result.indexing.diagnostic.recovery, /Do not repeat creation/);
}

test("runtime creation publishes identifiable Markdown and reports deferred indexing", async t => {
  const f = await fixture(t);
  for (const result of [
    await rememberMemory(f.root, { type: "note", title: "Pending", body: "Runtime body." }),
    await writeSessionWrapup(f.root, { title: "Pending session", body: wrapup }),
  ]) {
    assertSaved(result, "pending");
    assert.match(await readFile(path.join(f.root, result.file), "utf8"), new RegExp(result.id));
  }
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/index.json")), false);
});

test("CLI indexing failure is exit-zero partial success with safe JSON and human identity", async t => {
  const f = await fixture(t);
  const args = ["remember", "--root", f.root, "--type", "finding", "--title", "Saved despite failure"];
  const json = JSON.parse((await run([...args, "--json"], { env: f.env, input: "Published complete body." })).stdout);
  assertSaved(json, "failed");
  assert.equal(json.indexing.diagnostic.code, "index_failed");
  assert.match(await readFile(path.join(f.root, json.file), "utf8"), /Published complete body/);
  assert.doesNotMatch(JSON.stringify(json), /fixture private diagnostic|qmd-cache|model.gguf/);
  const human = await run(args, { env: f.env, input: "Second intentional creation." });
  assert.match(human.stdout, /Remembered memory: findings\//);
  assert.match(human.stdout, /Saved document ID: mem_/);
  assert.match(human.stdout, /Partial success: Markdown saved; indexing failed/);
  assert.match(human.stdout, /Do not repeat creation/);
  assert.equal(human.stderr, "");
  await writeFile(f.control, "{}");
  const indexed = JSON.parse((await run([...args, "--json"], { env: f.env, input: "Successful synchronous index." })).stdout);
  assertSaved(indexed, "indexed");
});

test("a fresh unrelated indexRoot never falsely reports the saved memory indexed", async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, "pages"));
  const config = JSON.stringify({ schemaVersion: 1, indexRoot: "pages", indexing: { mode: "lexical" } });
  await writeFile(path.join(f.root, "jumpybrain.json"), config);
  await writeFile(f.control, "{}");
  const saved = JSON.parse((await run(["remember", "--root", f.root, "--title", "Excluded note", "--json"], { env: f.env, input: "Quartz saved outside retrieval scope." })).stdout);
  assertSaved(saved, "pending");
  assert.equal(saved.indexing.diagnostic.code, "index_scope_excluded");
  assert.match(await readFile(path.join(f.root, saved.file), "utf8"), /Quartz saved outside retrieval scope/);
  assert.equal(await readFile(path.join(f.root, "jumpybrain.json"), "utf8"), config);
});

test("publication and validation errors still fail creation without a partial-success packet", async t => {
  const f = await fixture(t);
  const args = [cli, "remember", "--root", f.root, "--title", "Not saved", "--json"];
  let result = await child(args, { env: f.env, input: "  " });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /body is empty/);
  assert.equal(result.stdout, "");
  await writeFile(path.join(f.root, "notes"), "not a directory");
  result = await child(args, { env: f.env, input: "Must not publish." });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsafe Markdown destination/);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/index.json")), false);
});

test("CLI wrapup keeps body/validation fields and explicitly reports pending indexing", async t => {
  const f = await fixture(t);
  const args = ["wrapup", "--root", f.root, "--title", "Deferred session"];
  const result = JSON.parse((await run([...args, "--json"], { env: f.env, input: wrapup })).stdout);
  assertSaved(result, "pending");
  assert.equal(result.validation.valid, true);
  assert.match(result.body, /## Findings/);
  const human = await run(args, { env: f.env, input: wrapup });
  assert.match(human.stdout, /Index pending: Markdown saved; indexing pending/);
  assert.match(human.stdout, /Saved document ID: mem_/);
  assert.match(human.stdout, /## Open Questions/);
});

test("safe creation diagnostics allowlist execution codes without leaking arbitrary messages", () => {
  for (const code of ["execution_timeout", "execution_aborted", "execution_overloaded", "execution_failed", "execution_output_limit", "secret/root/private"]) {
    const result = failedCreationIndex(Object.assign(new Error("private backend stderr and API key"), { code }));
    assert.equal(result.indexing.diagnostic.code, code.startsWith("execution_") ? code : "index_failed");
    assert.doesNotMatch(JSON.stringify(result), /secret|private|API key/);
    assert.match(result.indexing.diagnostic.recovery, /same root\/target/);
  }
});

test("hosted creation is pending, and failed derived bookkeeping preserves identity and replay", async t => {
  const f = await fixture(t);
  const remote = path.join(f.root, ".jumpybrain/remote");
  await mkdir(remote, { recursive: true });
  for (const kind of ["note", "wrapup"]) {
    const options = { root: f.root, key: kind, method: "POST", path: `/v1/memory/all/${kind}`, body: { kind },
      write: kind === "note" ? { kind, draft: { type: "note", title: "Hosted deferred", body: "Remote body." } }
        : { kind, draft: { title: "Hosted session", body: wrapup } } };
    if (kind === "wrapup") await writeFile(path.join(remote, "index-state.json"), "private corrupted derived state");
    const created = await writeServerMemoryWithIdempotency(options);
    assert.equal(created.kind, "created");
    assertSaved(created.result, kind === "note" ? "pending" : "failed");
    assert.equal(created.result.index.stale, true);
    assert.equal(created.result.target, "remote");
    assert.doesNotMatch(JSON.stringify(created.result), /private corrupted|jb-creation-/);
    if (kind === "wrapup") assert.equal(created.result.indexing.diagnostic.code, "index_state_failed");
    const replay = await writeServerMemoryWithIdempotency(options);
    assert.equal(replay.kind, "replayed");
    assert.deepEqual(replay.result, JSON.parse(JSON.stringify(created.result)));
    assert.equal((await readdir(path.join(f.root, kind === "note" ? "notes" : "sessions"))).length, 1);
  }
});

test("hosted CLI exposes deferred and failed post-save outcomes without hidden indexing or root leakage", async t => {
  const f = await fixture(t);
  const { startJumpyBrainHttpServer } = await import("../dist/server/index.js");
  const server = await startJumpyBrainHttpServer({ root: f.root, apiKeys: ["creation-test-secret"], port: 0, autoIndex: false,
    logger: { log() {}, info() {}, warn() {}, error() {} } });
  t.after(() => server.close());
  const env = { ...f.env, JUMPYBRAIN_API_KEY: "creation-test-secret", JUMPYBRAIN_CLI_CONFIG: path.join(f.root, "no-device-policy.json") };
  const target = ["--target-url", server.url];
  const note = JSON.parse((await run(["remember", ...target, "--title", "Hosted CLI deferred", "--json"], { env, input: "Remote CLI body." })).stdout);
  assertSaved(note, "pending");
  const state = path.join(f.root, ".jumpybrain/remote/index-state.json");
  await writeFile(state, "private broken bookkeeping");
  const session = JSON.parse((await run(["wrapup", ...target, "--title", "Hosted CLI partial", "--json"], { env, input: wrapup })).stdout);
  assertSaved(session, "failed");
  assert.equal(session.indexing.diagnostic.code, "index_state_failed");
  assert.equal(session.validation.valid, true);
  const diagnostics = await server.diagnostics.snapshot();
  assert.ok(diagnostics.events.some(event => event.code === "saved" && event.outcome === "ok"));
  assert.ok(diagnostics.events.some(event => event.code === "index_state_failed" && event.outcome === "pending"));
  assert.doesNotMatch(JSON.stringify(diagnostics), /private broken|creation-test-secret|Remote CLI body/);
  assert.equal(session.target, "remote");
  assert.doesNotMatch(JSON.stringify(session), /jb-creation-|private broken|creation-test-secret/);
  const human = await run(["remember", ...target, "--title", "Hosted CLI partial text"], { env, input: "Another intentional remote note." });
  assert.match(human.stdout, /Partial success: Markdown saved; indexing failed/);
  assert.match(human.stdout, /Saved document ID: mem_/);
  assert.match(human.stdout, /Do not repeat creation/);
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/index.json")), false, "hosted creation must not start an index job");
});

test("SIGTERM during post-save indexing preserves identity, exits zero and joins child/lock cleanup", { skip: process.platform === "win32" }, async t => {
  const f = await fixture(t);
  const config = JSON.stringify({ schemaVersion: 1, indexing: { mode: "semantic", model: f.model } });
  await writeFile(path.join(f.root, "jumpybrain.json"), config);
  const gate = path.join(f.root, ".jumpybrain/cancel-gate");
  await writeFile(f.control, JSON.stringify({ gate }));
  const operation = child([cli, "remember", "--root", f.root, "--title", "Saved before cancellation", "--json"], { env: f.env, input: "Quartz complete canceled-index memory.\n" });
  const deadline = Date.now() + 10000;
  while (!existsSync(gate + ".entered") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  const entered = existsSync(gate + ".entered");
  operation.process.kill("SIGTERM");
  const response = await operation;
  assert.ok(entered, "publication must finish before cancellation");
  assert.equal(response.status, 0, response.stderr);
  const saved = JSON.parse(response.stdout);
  assertSaved(saved, "failed");
  assert.equal(saved.indexing.diagnostic.code, "execution_aborted");
  assert.ok((await readFile(path.join(f.root, saved.file), "utf8")).endsWith("Quartz complete canceled-index memory.\n"));
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/index.lock")), false);
  assert.equal(await readFile(path.join(f.root, "jumpybrain.json"), "utf8"), config);
  await writeFile(f.control, "{}");
  const recalled = JSON.parse((await run(["recall", "--root", f.root, "--query", "quartz", "--json"], { env: f.env })).stdout);
  assert.equal(recalled.readiness.freshness, "fresh");
  assert.equal(recalled.results[0].provenance.metadata.id, saved.id);
});

test("simultaneous processes creating, repairing and recalling join the existing root exclusion without lost memories", async t => {
  const f = await fixture(t);
  await writeFile(f.control, "{}");
  const initial = await rememberMemory(f.root, { type: "note", title: "Concurrent baseline", body: "Quartz initial evidence." });
  await run(["index", "--root", f.root, "--semantic-model", f.model], { env: f.env });
  await writeFile(path.join(f.root, initial.file), (await readFile(path.join(f.root, initial.file), "utf8")) + "Quartz edited evidence.\n");
  const gate = path.join(f.root, ".jumpybrain/mixed-gate");
  await writeFile(f.control, JSON.stringify({ gate }));
  const indexing = run(["index", "--root", f.root, "--json"], { env: f.env });
  indexing.catch(() => {});
  const deadline = Date.now() + 10000;
  while (!existsSync(gate + ".entered") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  const entered = existsSync(gate + ".entered");
  const bodies = Array.from({ length: 3 }, (_, i) => `Quartz concurrently saved evidence ${i}. NOT production approved.\n`);
  const creates = bodies.map(input => run(["remember", "--root", f.root, "--title", "Concurrent saved", "--json"], { env: f.env, input }));
  creates.forEach(work => work.catch(() => {}));
  while ((await readdir(path.join(f.root, "notes"))).filter(file => file.endsWith(".md")).length < 4 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  const readers = [0, 1].map(() => run(["recall", "--root", f.root, "--query", "quartz", "--limit", "10", "--json"], { env: f.env }));
  readers.forEach(work => work.catch(() => {}));
  await writeFile(gate + ".release", "go");
  const outcomes = await Promise.all([indexing, ...creates, ...readers]);
  assert.ok(entered, "index worker must reach its barrier");
  const saved = outcomes.slice(1, 4).map(result => JSON.parse(result.stdout));
  assert.equal(new Set(saved.map(result => result.id)).size, 3);
  assert.equal((await readdir(path.join(f.root, "notes"))).filter(file => file.endsWith(".md")).length, 4);
  for (const [i, result] of saved.entries()) {
    assert.equal(result.saved, true);
    assert.ok((await readFile(path.join(f.root, result.file), "utf8")).endsWith(bodies[i]));
  }
  for (const response of outcomes.slice(4)) {
    const recalled = JSON.parse(response.stdout);
    assert.equal(recalled.readiness.freshness, "fresh");
    assert.equal(recalled.results.length, 4);
  }
  assert.equal(existsSync(path.join(f.root, ".jumpybrain/index.lock")), false);
});

test("post-publication replay storage failure returns the saved identity without canonical retry", async t => {
  const f = await fixture(t);
  const replay = path.join(f.root, ".jumpybrain/remote/idempotency");
  await mkdir(path.dirname(replay), { recursive: true });
  let creates = 0;
  const result = await withIdempotency({ root: f.root, key: "late-replay-failure", method: "POST", path: "/notes", body: {},
    create: async () => {
      creates++;
      const saved = await rememberMemory(f.root, { type: "note", title: "Saved before replay failure", body: "Canonical bytes remain complete." });
      await writeFile(replay, "controlled record-directory failure");
      return saved;
    },
    onRecordFailure: saved => ({ ...saved, ...failedCreationReplay() }),
  });
  assert.equal(result.kind, "created");
  assertSaved(result.result, "failed");
  assert.equal(result.result.indexing.diagnostic.code, "creation_replay_failed");
  assert.equal(creates, 1);
  assert.match(await readFile(path.join(f.root, result.result.file), "utf8"), /Canonical bytes remain complete/);
  assert.equal((await readdir(path.join(f.root, "notes"))).length, 1);
});

test("eight concurrent processes save complete collision-safe memories despite index failure; automatic repair loses none", async t => {
  const f = await fixture(t);
  const barrier = path.join(f.root, ".jumpybrain/barrier");
  await mkdir(barrier);
  const commandUrl = new URL("../dist/cli/memory-commands.js", import.meta.url).href;
  const transportUrl = new URL("../dist/cli/local-transport.js", import.meta.url).href;
  const script = `import { writeFile, access } from 'node:fs/promises';
    import { runMemoryCommand } from ${JSON.stringify(commandUrl)};
    import { createLocalMemoryTransport } from ${JSON.stringify(transportUrl)};
    const local = createLocalMemoryTransport(); const publish = local.rememberMemory;
    local.rememberMemory = async (...args) => {
      const saved = await publish(...args);
      await writeFile(${JSON.stringify(barrier)} + '/' + process.pid, JSON.stringify(saved));
      const deadline = Date.now() + 10000;
      while (true) { try { await access(${JSON.stringify(barrier + "/release")}); break; } catch {};
        if (Date.now() > deadline) throw new Error('barrier deadline');
        await new Promise(resolve => setTimeout(resolve, 10)); }
      return saved;
    };
    await runMemoryCommand('remember', { root: ${JSON.stringify(f.root)}, title: 'Concurrent same title', json: true }, local);`;
  const bodies = Array.from({ length: 8 }, (_, i) => `Unique memory ${i}: complete-marker-${i}\n` + "Full stored bytes.\n".repeat(1000));
  const children = bodies.map(input => child(["--input-type=module", "-e", script], { env: f.env, input }));
  const deadline = Date.now() + 10000;
  while ((await readdir(barrier)).length < 8 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  const arrived = await readdir(barrier);
  // Always release before asserting, so a failed assertion cannot strand children.
  await writeFile(path.join(barrier, "release"), "go");
  const outcomes = await Promise.all(children);
  assert.equal(arrived.length, 8, "every process published before any index attempt");
  const results = outcomes.map(outcome => { assert.equal(outcome.status, 0, outcome.stderr); return JSON.parse(outcome.stdout); });
  assert.equal(new Set(results.map(result => result.id)).size, 8);
  assert.equal(new Set(results.map(result => result.file)).size, 8);
  const before = new Map();
  for (const [i, result] of results.entries()) {
    assertSaved(result, "failed");
    const content = await readFile(path.join(f.root, result.file), "utf8");
    assert.match(content, new RegExp(result.id));
    assert.ok(content.endsWith(bodies[i]));
    before.set(result.file, content);
  }
  assert.equal((await readdir(path.join(f.root, "notes"))).length, 8, "no staging or lost writes");
  // Recover as an automatic operation on a legacy root, despite environment-driven
  // semantic migration settings. It must neither recreate notes nor persist policy.
  if (existsSync(path.join(f.root, "jumpybrain.json"))) await unlink(path.join(f.root, "jumpybrain.json"));
  await writeFile(f.control, "{}");
  const runtimeUrl = new URL("../dist/runtime/index.js", import.meta.url).href;
  const recovery = await child(["--input-type=module", "-e", `import { ensureMemoryIndexed } from ${JSON.stringify(runtimeUrl)};
    console.log(JSON.stringify(await ensureMemoryIndexed(${JSON.stringify(f.root)})));`], {
    env: { ...f.env, JUMPYBRAIN_QMD_EMBED: "1", QMD_EMBED_MODEL: "/missing-private-model.gguf" },
  });
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.equal(JSON.parse(recovery.stdout).readiness.freshness, "fresh");
  assert.equal(existsSync(path.join(f.root, "jumpybrain.json")), false);
  assert.deepEqual(activeFakeQmdFiles(await fakeQmdState(f.root)), [...before.keys()].sort());
  assert.equal((await readdir(path.join(f.root, "notes"))).length, 8);
  for (const [file, content] of before) assert.equal(await readFile(path.join(f.root, file), "utf8"), content);
});
