// Warm smart-search worker lifecycle against the deterministic QMD double.
// Real-model row parity lives in the opt-in scripts/semantic-warm-search-smoke.mjs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { indexMemory, searchMemory, prewarmSmartSearch } from "../dist/app/local-memory/index.js";
import { retainWarmSmartSearch, warmSmartSearchForTests as warm, WARM_SMART_SEARCH_LIMITS } from "../dist/adapters/qmd/qmd-warm.js";
import { qmdExecutionForTests as execution } from "../dist/adapters/qmd/qmd-execution.js";
import { smartSearchIdleMs, SMART_SEARCH_IDLE_DEFAULT_MS } from "../dist/core/execution-limits.js";
import { resolveServerConfig, startJumpyBrainHttpServer } from "../dist/server/index.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-qmd-lifecycle/", import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(predicate, label, ms = 10_000) {
  const deadline = Date.now() + ms;
  while (!await predicate()) { assert.ok(Date.now() < deadline, `timed out: ${label}`); await pause(20); }
}
const FALLBACK = "semantic_query_failed_lexical_fallback";

async function setup(t, roots = ["memory"]) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-warm-")));
  const pkg = path.join(temp, "qmd");
  await cp(fixture, pkg, { recursive: true });
  await copyFile(path.join(pkg, "database.cjs.fixture"), path.join(pkg, "database.cjs"));
  await mkdir(path.join(pkg, "dist"));
  for (const name of ["index", "store", "llm", "collections"]) await copyFile(path.join(pkg, "sdk", `${name}.js.fixture`), path.join(pkg, "dist", `${name}.js`));
  const sqlite = path.join(pkg, "node_modules", "better-sqlite3");
  await mkdir(sqlite, { recursive: true });
  await copyFile(path.join(pkg, "sqlite/package.json"), path.join(sqlite, "package.json"));
  await copyFile(path.join(pkg, "sqlite/index.js.fixture"), path.join(sqlite, "index.js"));
  await chmod(path.join(pkg, "bin/qmd"), 0o755);
  const controlFile = path.join(temp, "control.json"), eventsFile = path.join(temp, "events.jsonl");
  const saved = Object.fromEntries(["JUMPYBRAIN_QMD_BIN", "FAKE_QMD_CONTROL", "FAKE_QMD_EVENTS", "JUMPYBRAIN_QMD_EMBED", "QMD_EMBED_MODEL", "JUMPYBRAIN_SMART_SEARCH_IDLE_MS"].map(key => [key, process.env[key]]));
  Object.assign(process.env, { JUMPYBRAIN_QMD_BIN: path.join(pkg, "bin/qmd"), FAKE_QMD_CONTROL: controlFile, FAKE_QMD_EVENTS: eventsFile, JUMPYBRAIN_QMD_EMBED: "", QMD_EMBED_MODEL: "" });
  delete process.env.JUMPYBRAIN_SMART_SEARCH_IDLE_MS;
  const release = retainWarmSmartSearch();
  t.after(async () => {
    await release();
    await warm.stop();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(temp, { recursive: true, force: true });
  });
  const model = path.join(pkg, "model.gguf");
  const paths = roots.map(name => path.join(temp, name));
  for (const root of paths) {
    await mkdir(path.join(root, "notes"), { recursive: true });
    await writeFile(path.join(root, "notes/quartz.md"), "---\ntitle: Quartz guide\n---\nquartz crystals resonate\n");
    await writeFile(path.join(root, "notes/copper.md"), "---\ntitle: Copper\n---\ncopper wires conduct\n");
    await indexMemory(root, { indexing: { mode: "semantic", model } });
  }
  const events = async () => existsSync(eventsFile) ? (await readFile(eventsFile, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  return { temp, pkg, model, roots: paths, root: paths[0], release, control: value => writeFile(controlFile, JSON.stringify(value)), events };
}
const pidOf = root => warm.workers().find(worker => worker.root === root)?.pid;

test("idle setting validation keeps 0 as never-unload and rejects ambiguous values", () => {
  assert.equal(smartSearchIdleMs(), SMART_SEARCH_IDLE_DEFAULT_MS);
  assert.equal(SMART_SEARCH_IDLE_DEFAULT_MS, 30 * 60_000);
  assert.equal(smartSearchIdleMs("0"), 0);
  assert.equal(smartSearchIdleMs(" 5000 "), 5000);
  assert.equal(smartSearchIdleMs(2_147_483_647), 2_147_483_647);
  for (const bad of ["", " ", "-1", "1.5", "1e3", "abc", "2147483648", -1, 1.5, Number.NaN]) {
    assert.throws(() => smartSearchIdleMs(bad), /JUMPYBRAIN_SMART_SEARCH_IDLE_MS must be a whole number/, String(bad));
  }
  const base = { root: "/srv/memory", apiKeys: "key" };
  assert.throws(() => resolveServerConfig(base, { JUMPYBRAIN_SMART_SEARCH_IDLE_MS: "soon" }), /JUMPYBRAIN_SMART_SEARCH_IDLE_MS/);
  assert.doesNotThrow(() => resolveServerConfig(base, { JUMPYBRAIN_SMART_SEARCH_IDLE_MS: "0" }));
});

test("one warm worker serves repeated smart searches with the CLI path's exact results", async t => {
  const f = await setup(t);
  await f.release(); // Cold reference through the one-shot `qmd query` child first.
  const cold = await searchMemory(f.root, "quartz crystals", 10, { refresh: false });
  const again = retainWarmSmartSearch();
  t.after(again);
  const first = await searchMemory(f.root, "quartz crystals", 10, { refresh: false });
  const pid = pidOf(f.root);
  assert.ok(pid && alive(pid));
  const second = await searchMemory(f.root, "copper wires", 10, { refresh: false });
  const third = await searchMemory(f.root, "quartz crystals", 10, { refresh: false });
  assert.equal(pidOf(f.root), pid, "worker reused across queries");
  assert.deepEqual(first.results, cold.results);
  assert.deepEqual(first.retrieval, cold.retrieval);
  assert.deepEqual(third.results, cold.results);
  assert.ok(second.results.some(row => row.provenance.file === "notes/copper.md"));
  for (const result of [first, second, third]) assert.equal(result.retrieval.warnings.includes(FALLBACK), false);
  const events = await f.events();
  assert.equal(events.filter(e => e.type === "query" && e.command === "query" && !e.warm).length, 1, "only the cold reference used the CLI");
  const warmQueries = events.filter(e => e.type === "query" && e.warm);
  assert.equal(warmQueries.length, 3);
  assert.ok(warmQueries.every(e => e.pid === pid));
  assert.equal(events.filter(e => e.type === "llm" && e.pid === pid).length, 1, "model constructed once");
  assert.ok(events.filter(e => e.type === "native" && e.pid === pid).every(e => e.allowBuild === false));
  assert.deepEqual(execution.state(), { active: 0, queued: 0 });
});

test("idle unload exits the worker; 0 keeps it; keyword-only roots never start one", async t => {
  const f = await setup(t, ["memory", "keyword"]);
  process.env.JUMPYBRAIN_SMART_SEARCH_IDLE_MS = "150";
  await searchMemory(f.root, "quartz", 10, { refresh: false });
  const pid = pidOf(f.root);
  assert.ok(pid);
  await until(() => !pidOf(f.root) && !alive(pid), "idle worker exit");
  process.env.JUMPYBRAIN_SMART_SEARCH_IDLE_MS = "0";
  await searchMemory(f.root, "quartz", 10, { refresh: false });
  const kept = pidOf(f.root);
  await pause(400);
  assert.equal(pidOf(f.root), kept);
  assert.ok(alive(kept));
  // An invalid setting is a configuration error, not a silent fallback.
  process.env.JUMPYBRAIN_SMART_SEARCH_IDLE_MS = "later";
  await assert.rejects(searchMemory(f.root, "quartz", 10, { refresh: false }), /JUMPYBRAIN_SMART_SEARCH_IDLE_MS/);
  delete process.env.JUMPYBRAIN_SMART_SEARCH_IDLE_MS;
  const keyword = f.roots[1];
  await indexMemory(keyword, { indexing: { mode: "lexical" } });
  const lexical = await searchMemory(keyword, "quartz", 10, { refresh: false });
  assert.ok(lexical.results.length);
  assert.equal(pidOf(keyword), undefined);
  assert.equal(await prewarmSmartSearch(keyword), false);
});

test("warm roots are capped per process with least-recently-used eviction", async t => {
  const f = await setup(t, ["a", "b", "c"]);
  assert.equal(WARM_SMART_SEARCH_LIMITS.roots, 2);
  const [a, b, c] = f.roots;
  const search = root => searchMemory(root, "quartz", 10, { refresh: false });
  await search(a); await search(b);
  const pidA = pidOf(a);
  assert.deepEqual(warm.workers().map(w => w.root), [a, b]);
  await search(c);
  assert.deepEqual(warm.workers().map(w => w.root), [b, c]);
  assert.equal(alive(pidA), false, "evicted worker was stopped before the new one started");
  await search(b);
  await search(a);
  assert.deepEqual(warm.workers().map(w => w.root), [b, a]);
  for (const result of await Promise.all([search(a), search(b)])) assert.equal(result.retrieval.warnings.includes(FALLBACK), false);
});

test("timeout and abort kill the worker before the operation releases; the next search gets a fresh one", async t => {
  const f = await setup(t);
  await searchMemory(f.root, "quartz", 10, { refresh: false });
  const original = pidOf(f.root);
  await f.control({ fail: "query-hang" });
  await assert.rejects(searchMemory(f.root, "quartz", 10, { refresh: false, timeoutMs: 400 }), error => error.code === "execution_timeout");
  assert.equal(alive(original), false, "hung worker is gone when the deadline error is returned");
  assert.equal(pidOf(f.root), undefined);
  assert.deepEqual(execution.state(), { active: 0, queued: 0 });
  const controller = new AbortController();
  const aborted = searchMemory(f.root, "quartz", 10, { refresh: false, signal: controller.signal });
  await until(async () => (await f.events()).filter(e => e.type === "query" && e.warm).length >= 3, "hung query started");
  const hung = pidOf(f.root);
  controller.abort();
  await assert.rejects(aborted, error => error.code === "execution_aborted");
  assert.equal(alive(hung), false);
  await f.control({});
  const recovered = await searchMemory(f.root, "quartz", 10, { refresh: false });
  assert.equal(recovered.retrieval.warnings.includes(FALLBACK), false);
  assert.ok(![original, hung].includes(pidOf(f.root)));
});

test("crash, worker error, output overflow and malformed replies fall back with the labeled warning", async t => {
  const f = await setup(t);
  for (const fail of ["query-crash", "query", "query-noise", "query-malformed"]) {
    await f.control({});
    await searchMemory(f.root, "quartz", 10, { refresh: false });
    const pid = pidOf(f.root);
    await f.control({ fail });
    const result = await searchMemory(f.root, "quartz crystals", 10, { refresh: false });
    assert.ok(result.retrieval.warnings.includes(FALLBACK), fail);
    assert.equal(result.retrieval.status, "partial");
    assert.ok(result.results.some(row => row.provenance.file === "notes/quartz.md"), `${fail}: lexical evidence retained`);
    assert.equal(alive(pid), false, `${fail}: bad worker is never reused`);
    assert.equal(pidOf(f.root), undefined);
  }
  await f.control({});
  const healthy = await searchMemory(f.root, "quartz", 10, { refresh: false });
  assert.equal(healthy.retrieval.warnings.includes(FALLBACK), false);
  // Structured text the CLI itself rejects (a newline in the query) falls back
  // the same way, without discarding the loaded model.
  const pid = pidOf(f.root);
  const rejected = await searchMemory(f.root, "quartz\ncrystals", 10, { refresh: false });
  assert.ok(rejected.retrieval.warnings.includes(FALLBACK));
  assert.equal(pidOf(f.root), pid);
  assert.ok(alive(pid));
});

test("reindex is visible to the same worker; a model change replaces it", async t => {
  const f = await setup(t);
  await searchMemory(f.root, "quartz", 10, { refresh: false });
  const pid = pidOf(f.root);
  await writeFile(path.join(f.root, "notes/basalt.md"), "---\ntitle: Basalt\n---\nbasalt columns cool slowly\n");
  await indexMemory(f.root);
  const fresh = await searchMemory(f.root, "basalt columns", 10, { refresh: false });
  assert.ok(fresh.results.some(row => row.provenance.file === "notes/basalt.md"), "new generation is searched");
  assert.equal(pidOf(f.root), pid, "same model keeps the warm worker");
  const replacement = path.join(f.temp, "model-2.gguf");
  await writeFile(replacement, Buffer.concat([await readFile(f.model), Buffer.from("other bytes")]));
  await indexMemory(f.root, { indexing: { mode: "semantic", model: replacement }, rebuild: true });
  const after = await searchMemory(f.root, "quartz", 10, { refresh: false });
  assert.equal(after.retrieval.warnings.includes(FALLBACK), false);
  const next = pidOf(f.root);
  assert.ok(next && next !== pid);
  assert.equal(alive(pid), false);
  assert.deepEqual((await f.events()).filter(e => e.type === "llm" && e.pid === next).map(e => e.model), [replacement]);
});

test("pre-warm loads the model in the background and the first search reuses it", async t => {
  const f = await setup(t);
  assert.equal(await prewarmSmartSearch(f.root), true);
  const pid = pidOf(f.root);
  assert.ok((await f.events()).some(e => e.type === "embed-query" && e.pid === pid));
  assert.equal((await f.events()).some(e => e.type === "query" && e.warm), false, "pre-warm runs no search");
  await searchMemory(f.root, "quartz", 10, { refresh: false });
  assert.equal(pidOf(f.root), pid);
  // Not ready (pending publication) or disabled: nothing starts.
  await warm.stop();
  await writeFile(path.join(f.root, ".jumpybrain/index-pending.json"), "{}");
  assert.equal(await prewarmSmartSearch(f.root), false);
  await rm(path.join(f.root, ".jumpybrain/index-pending.json"));
  await f.release();
  assert.equal(await prewarmSmartSearch(f.root), false);
  assert.equal(pidOf(f.root), undefined);
});

test("a host server pre-warms when ready and stops its worker on close", async t => {
  const f = await setup(t);
  await f.release();
  const started = await startJumpyBrainHttpServer({ root: f.root, apiKeys: ["warm-test-key"], port: 0, autoIndex: false, warmSmartSearch: true });
  let closed = false;
  t.after(async () => { if (!closed) await started.close(); });
  await until(() => !!pidOf(f.root), "pre-warmed worker");
  const pid = pidOf(f.root);
  const response = await fetch(`${started.url}/memories/all/search`, { method: "POST", headers: { authorization: "Bearer warm-test-key", "content-type": "application/json" }, body: JSON.stringify({ query: "quartz", limit: 5 }) });
  assert.equal(response.status, 200);
  const packet = await response.json();
  assert.equal(packet.retrieval.warnings.includes(FALLBACK), false);
  assert.equal(pidOf(f.root), pid);
  await started.close(); closed = true;
  assert.equal(pidOf(f.root), undefined);
  assert.equal(alive(pid), false);
});

test("the worker exits when its owning process dies without closing it", async t => {
  const f = await setup(t);
  const program = `
    const { retainWarmSmartSearch, warmSmartSearchForTests } = await import(${JSON.stringify(new URL("../dist/adapters/qmd/qmd-warm.js", import.meta.url).href)});
    const { searchMemory } = await import(${JSON.stringify(new URL("../dist/app/local-memory/index.js", import.meta.url).href)});
    retainWarmSmartSearch();
    await searchMemory(process.argv[1], "quartz", 5, { refresh: false });
    process.stdout.write(String(warmSmartSearchForTests.workers()[0].pid) + "\\n");
    setInterval(() => {}, 1000);
  `;
  const owner = spawn(process.execPath, ["--input-type=module", "-e", program, f.root], { env: process.env, stdio: ["ignore", "pipe", "inherit"] });
  t.after(() => { if (owner.exitCode === null) owner.kill("SIGKILL"); });
  let output = "";
  owner.stdout.on("data", chunk => { output += chunk; });
  await until(() => output.includes("\n"), "owner reported worker pid");
  const pid = Number(output.trim());
  assert.ok(alive(pid));
  owner.kill("SIGKILL");
  await until(() => !alive(pid), "orphaned worker exit", 5_000);
});
