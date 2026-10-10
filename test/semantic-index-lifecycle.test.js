import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const fixture = fileURLToPath(new URL("./fixtures/fake-qmd-lifecycle/", import.meta.url));
const app = new URL("../dist/app/local-memory/index.js", import.meta.url).href;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = async file => JSON.parse(await readFile(file, "utf8"));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setup(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-lifecycle-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const pkg = path.join(temp, "qmd");
  await cp(fixture, pkg, { recursive: true });
  await copyFile(path.join(pkg, "database.cjs.fixture"), path.join(pkg, "database.cjs"));
  await mkdir(path.join(pkg, "dist"));
  for (const name of ["index", "store", "llm"]) {
    await copyFile(path.join(pkg, "sdk", `${name}.js.fixture`), path.join(pkg, "dist", `${name}.js`));
  }
  const sqlite = path.join(pkg, "node_modules", "better-sqlite3");
  await mkdir(sqlite, { recursive: true });
  await copyFile(path.join(pkg, "sqlite/package.json"), path.join(sqlite, "package.json"));
  await copyFile(path.join(pkg, "sqlite/index.js.fixture"), path.join(sqlite, "index.js"));
  const bin = path.join(pkg, "bin/qmd");
  await chmod(bin, 0o755);
  const root = path.join(temp, "memory");
  await mkdir(root);
  const model = path.join(pkg, "model.gguf");
  const controlFile = path.join(temp, "control.json");
  const eventsFile = path.join(temp, "events.jsonl");
  const env = { ...process.env, JUMPYBRAIN_QMD_BIN: bin, JUMPYBRAIN_QMD_EMBED: "", QMD_EMBED_MODEL: "",
    FAKE_QMD_CONTROL: controlFile, FAKE_QMD_EVENTS: eventsFile };
  const derived = path.join(root, ".jumpybrain");
  const dbFile = path.join(derived, "qmd-cache/qmd/index.sqlite");
  const manifestFile = path.join(derived, "index.json");
  const policy = { mode: "semantic", model };
  function run(action, options = {}, overrides = {}) {
    const program = `
      import * as app from ${JSON.stringify(app)};
      const [root, action, options] = JSON.parse(process.argv[1]);
      try {
        const result = action === "index" ? await app.indexMemory(root, options)
          : action === "status" ? await app.memoryStatus(root)
          : action === "search" ? await app.searchMemory(root, options.query ?? "quartz", 10)
          : (() => { throw new Error("unknown fixture action"); })();
        process.stdout.write(JSON.stringify(result));
      } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
    `;
    return new Promise((resolve, reject) => {
      execFile(process.execPath, ["--input-type=module", "-e", program, JSON.stringify([root, action, options])],
        { env: { ...env, ...overrides }, timeout: 20000 }, (error, stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
        });
    });
  }
  const put = async (file, content) => {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content);
  };
  const control = value => writeFile(controlFile, JSON.stringify(value));
  const state = () => json(dbFile);
  const manifest = () => json(manifestFile);
  const events = async () => existsSync(eventsFile) ? (await readFile(eventsFile, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  return { temp, pkg, root, model, policy, env, derived, dbFile, manifestFile, run, put, control, state, manifest, events };
}
function active(state, collection = "jumpybrain") {
  return state.documents.filter(d => d.active === 1 && d.collection === collection).map(d => d.file).sort();
}
function work(result, expected) {
  assert.deepEqual(result.work, { added: 0, updated: 0, unchanged: 0, removed: 0, embedded: 0, ...expected });
}
async function waitFor(file) {
  const deadline = Date.now() + 10000;
  while (!existsSync(file)) {
    if (Date.now() > deadline) assert.fail(`Timed out waiting for fixture barrier ${file}`);
    await pause(10);
  }
}

test("semantic lifecycle reuses exact content hashes across noop/add/edit/rename/delete/blank/dream changes", async t => {
  const f = await setup(t);
  const original = "---\ntitle: Quartz guide\n---\nquartz original qualification\n";
  await f.put("notes/alpha.md", original);
  await f.put("notes/empty.md", "");
  await f.put("notes/space.md", " \n\t");
  const first = await f.run("index", { indexing: f.policy });
  work(first, { added: 3, embedded: 1 });
  assert.deepEqual(first.readiness.modes, ["lexical", "semantic"]);
  assert.equal(first.readiness.freshness, "fresh");
  let state = await f.state();
  assert.equal(state.content[hash(original)], original);
  assert.equal(state.content[hash("")], "");
  assert.equal(state.content[hash(" \n\t")], " \n\t");
  assert.equal((await f.manifest()).embedding.modelHash, hash(await readFile(f.model)));
  assert.equal((await f.manifest()).embedding.emptyHashes, 2);
  work(await f.run("index"), { unchanged: 3 });
  assert.equal((await f.state()).counters.embedded, 1);
  await f.put("notes/duplicate.md", original);
  work(await f.run("index"), { added: 1, unchanged: 3 });
  await f.put("notes/new.md", "quartz newly added evidence\n");
  work(await f.run("index"), { added: 1, unchanged: 4, embedded: 1 });
  const edited = original.replace("original", "edited");
  await f.put("notes/alpha.md", edited);
  work(await f.run("index"), { updated: 1, unchanged: 4, embedded: 1 });
  await rename(path.join(f.root, "notes/alpha.md"), path.join(f.root, "notes/renamed.md"));
  work(await f.run("index"), { added: 1, removed: 1, unchanged: 4 });
  await rm(path.join(f.root, "notes/duplicate.md"));
  work(await f.run("index"), { removed: 1, unchanged: 4 });
  await f.put("notes/renamed.md", edited.replace("title:", "dream: true\ntitle:"));
  work(await f.run("index"), { updated: 1, unchanged: 3, embedded: 1 });
  assert.deepEqual(active(await f.state(), "jumpybrain-dreams"), ["notes/renamed.md"]);
  assert.equal((await f.manifest()).dreamCollection, "jumpybrain-dreams");
  assert.equal(existsSync(path.join(f.derived, "qmd-dreams")), false);
  await f.put("notes/renamed.md", edited);
  work(await f.run("index"), { updated: 1, unchanged: 3 });
  assert.deepEqual(active(await f.state(), "jumpybrain-dreams"), []);
  const result = await f.run("search");
  assert.deepEqual(result.results.map(r => r.provenance.file).sort(), ["notes/new.md", "notes/renamed.md"]);
  state = await f.state();
  assert.deepEqual(active(state), ["notes/empty.md", "notes/new.md", "notes/renamed.md", "notes/space.md"]);
  assert.equal(state.counters.embedded, 4);
  assert.equal(state.counters.clears, 0);
  assert.deepEqual(new Set(state.vectors), new Set(state.metadata.map(v => `${v.hash}_${v.seq}`)));
});

test("indexRoot scans only canonical allowed files and uses original paths for reads", async t => {
  const f = await setup(t);
  const source = path.join(f.temp, "source");
  await mkdir(source);
  await f.put("jumpybrain.json", JSON.stringify({ schemaVersion: 1, indexRoot: source, indexing: f.policy }));
  await f.put("local.md", "quartz outside selected source");
  for (const name of ["notes/valid.md", ".git/hidden.md", ".jumpybrain/copy.md", ".qmd/hidden.md", "node_modules/bad.md", "dist/bad.md", "build/bad.md", "logs/bad.md", "reports/bad.md", "gold.md", "answer_session_ids.md", "ignore.txt"]) {
    const file = path.join(source, name); await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "quartz " + name);
  }
  work(await f.run("index"), { added: 1, embedded: 1 });
  assert.deepEqual(active(await f.state()), ["notes/valid.md"]);
  assert.equal((await f.manifest()).sourceRoot, source);
  assert.equal((await f.state()).collections.jumpybrain.path, source);
  assert.deepEqual((await f.run("search")).results.map(r => r.provenance.file), ["notes/valid.md"]);
});

test("policy persists across processes, migrates explicit legacy model, and never implicitly resolves a model", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz persistence");
  await assert.rejects(f.run("index", {}, { JUMPYBRAIN_QMD_EMBED: "1" }), /provisioned absolute local GGUF/);
  assert.equal(existsSync(f.dbFile), false);
  assert.deepEqual(await f.events(), []);
  await f.run("index", {}, { JUMPYBRAIN_QMD_EMBED: "1", QMD_EMBED_MODEL: f.model });
  assert.deepEqual((await json(path.join(f.root, "jumpybrain.json"))).indexing, f.policy);
  work(await f.run("index"), { unchanged: 1 });
  await f.run("index", { indexing: { mode: "lexical" } });
  await f.put("new.md", "quartz lexical change");
  const lexical = await f.run("index", {}, { JUMPYBRAIN_QMD_EMBED: "1", QMD_EMBED_MODEL: "/missing.gguf" });
  work(lexical, { added: 1, unchanged: 1 });
  assert.deepEqual(lexical.readiness.modes, ["lexical"]);
  assert.equal(lexical.readiness.embedding, "disabled");
  const before = (await f.events()).filter(e => e.type === "llm").length;
  await f.run("search");
  assert.equal((await f.events()).filter(e => e.type === "llm").length, before);
  assert.equal((await f.events()).filter(e => e.type === "query").at(-1).command, "search");
  work(await f.run("index", { indexing: f.policy }), { unchanged: 2, embedded: 1 });
  const natives = (await f.events()).filter(e => e.type === "native");
  assert.ok(natives.length > 0);
  assert.ok(natives.every(e => e.allowBuild === false));
});

test("semantic failures and invalid vector coverage roll back all derived database mutations", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz last good");
  await f.run("index", { indexing: f.policy });
  const originalDb = await readFile(f.dbFile, "utf8");
  const generation = (await f.manifest()).generation;
  await f.put("a.md", "quartz changed after last good\n");
  for (const [failure, stage] of [["ingest", "ingest"], ["embed", "embed"], ["embed-result", "embed"],
    ["coverage-vector", "coverage"], ["coverage-metadata", "coverage"], ["dispose", "model-close"], ["commit", "commit"]]) {
    await f.control({ fail: failure });
    await assert.rejects(f.run("index"), new RegExp(`failed during ${stage}; previous committed index retained`));
    assert.equal(await readFile(f.dbFile, "utf8"), originalDb, failure);
    assert.equal((await f.manifest()).generation, generation);
    const status = await f.run("status");
    assert.equal(status.readiness.freshness, "stale");
    assert.equal(status.readiness.lastFailure.code, "index_failed");
    assert.equal(existsSync(path.join(f.derived, "index-pending.json")), true);
  }
  assert.ok((await f.events()).some(e => e.type === "rollback"));
  await f.control({});
  work(await f.run("index"), { updated: 1, embedded: 1 });
  assert.equal((await f.run("status")).readiness.freshness, "fresh");
  assert.equal(existsSync(path.join(f.derived, "index-failure.json")), false);
  assert.equal((await f.state()).counters.embedded, 2);
});

test("unsupported package versions are rejected without opening the SDK database", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz");
  const pkg = await json(path.join(f.pkg, "package.json"));
  await writeFile(path.join(f.pkg, "package.json"), JSON.stringify({ ...pkg, version: "2.8.4" }));
  await assert.rejects(f.run("index"), /Unsupported QMD version/);
  assert.equal(existsSync(f.dbFile), false);
  assert.deepEqual(await f.events(), []);
});

test("query startup rejects unsupported packages before backend schema or retrieval work", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz supported backend");
  await f.run("index");
  const before = (await f.events()).length;
  const pkg = await json(path.join(f.pkg, "package.json"));
  await writeFile(path.join(f.pkg, "package.json"), JSON.stringify({ ...pkg, version: "9.0.0" }));
  await assert.rejects(f.run("search"), /Unsupported QMD version/);
  assert.equal((await f.events()).length, before);
});

test("a changed configured model digest disables semantic queries until explicitly indexed", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz pinned model");
  await f.run("index", { indexing: f.policy });
  const config = await json(path.join(f.root, "jumpybrain.json"));
  config.indexing.modelHash = "0".repeat(64);
  await writeFile(path.join(f.root, "jumpybrain.json"), JSON.stringify(config));
  const status = await f.run("status");
  assert.equal(status.readiness.freshness, "stale");
  assert.equal(status.readiness.embedding, "incomplete");
  const before = (await f.events()).filter(e => e.type === "query" && e.command === "query").length;
  const result = await f.run("search");
  assert.deepEqual(result.readiness.modes, ["lexical"]);
  assert.equal(result.retrieval.status, "partial");
  assert.equal((await f.events()).filter(e => e.type === "query" && e.command === "query").length, before);
  await assert.rejects(f.run("index"), /failed during model/);
});

test("local model validation and identity changes require explicit rebuild", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz model identity");
  await writeFile(f.model, "not a GGUF file");
  await assert.rejects(f.run("index", { indexing: f.policy }), /failed during model/);
  assert.deepEqual(await f.events(), []);
  await copyFile(path.join(fixture, "model.gguf"), f.model);
  await assert.rejects(f.run("index", { indexing: { ...f.policy, modelHash: "0".repeat(64) } }), /failed during model/);
  await f.run("index", { indexing: f.policy });
  const before = await readFile(f.dbFile, "utf8");
  await writeFile(f.model, "GGUFdifferent model bytes");
  assert.equal((await f.run("status")).readiness.embedding, "incomplete");
  await assert.rejects(f.run("index"), /failed during compatibility/);
  assert.equal(await readFile(f.dbFile, "utf8"), before);
  work(await f.run("index", { rebuild: true }), { added: 1, embedded: 1 });
  assert.equal((await f.state()).counters.clears, 1);
  assert.equal((await f.manifest()).embedding.modelHash, hash(await readFile(f.model)));
  assert.equal((await f.run("status")).readiness.embedding, "complete");
});

test("model replacement during embedding cannot publish under the original digest", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz digest");
  await f.run("index", { indexing: f.policy });
  const before = await readFile(f.dbFile, "utf8");
  await f.put("a.md", "quartz changed digest");
  await f.control({ fail: "model-replaced" });
  await assert.rejects(f.run("index"), /failed during coverage/);
  assert.equal(await readFile(f.dbFile, "utf8"), before);
});

test("pending publication recovers the committed database manifest using readonly SQLite without model work", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz recovery");
  await f.run("index", { indexing: f.policy });
  const committed = JSON.parse((await f.state()).manifest);
  const dbBytes = await readFile(f.dbFile, "utf8");
  // Model a crash after COMMIT but before publishing the manifest/config.
  await writeFile(f.manifestFile, JSON.stringify({ ...committed, generation: "old-unpublished", documents: [] }));
  await rm(path.join(f.derived, "qmd-config"), { recursive: true });
  await writeFile(path.join(f.derived, "index-pending.json"), JSON.stringify({ generation: committed.generation }));
  const before = (await f.events()).filter(e => e.type === "llm").length;
  const result = await f.run("search");
  assert.deepEqual(await f.manifest(), committed);
  assert.equal(await readFile(f.dbFile, "utf8"), dbBytes);
  assert.equal(result.results[0].provenance.file, "a.md");
  assert.equal(result.readiness.freshness, "stale");
  assert.equal(result.readiness.lastFailure.code, "interrupted_update");
  assert.equal(existsSync(path.join(f.derived, "index-pending.json")), false);
  assert.equal((await json(path.join(f.derived, "qmd-config/index.yml"))).models.embed, f.model);
  const events = await f.events();
  assert.ok(events.some(e => e.type === "open" && e.readonly));
  assert.equal(events.filter(e => e.type === "llm").length, before);
  work(await f.run("index"), { unchanged: 1 });
  assert.equal((await f.run("status")).readiness.freshness, "fresh");
});

test("deleting all derived state retains canonical Markdown and persistent semantic policy", async t => {
  const f = await setup(t);
  const content = "quartz canonical preserved\n";
  await f.put("a.md", content);
  await f.run("index", { indexing: f.policy });
  const config = await readFile(path.join(f.root, "jumpybrain.json"), "utf8");
  await rm(f.derived, { recursive: true });
  assert.equal((await f.run("status")).readiness.freshness, "missing");
  work(await f.run("index"), { added: 1, embedded: 1 });
  assert.equal((await f.run("status")).readiness.embedding, "complete");
  assert.equal(await readFile(path.join(f.root, "jumpybrain.json"), "utf8"), config);
  assert.equal(await readFile(path.join(f.root, "a.md"), "utf8"), content);
});

test("index jobs/readers serialize while a concurrent canonical write leaves the snapshot stale", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz before concurrent write");
  await f.run("index", { indexing: f.policy });
  const gate = path.join(f.temp, "gate");
  await f.control({ gate });
  const indexing = f.run("index");
  // Attach a handler immediately so a failing barrier does not create unhandled rejections.
  indexing.catch(() => {});
  await waitFor(gate + ".entered");
  await f.put("a.md", "quartz after concurrent write with new bytes\n");
  let readDone = false;
  const reading = f.run("search").then(result => { readDone = true; return result; });
  reading.catch(() => {});
  await pause(120);
  assert.equal(readDone, false);
  await writeFile(gate + ".release", "release");
  const indexed = await indexing;
  assert.equal(indexed.readiness.freshness, "stale");
  const read = await reading;
  assert.equal(read.readiness.freshness, "stale");
  assert.ok(read.retrieval.warnings.includes("index_not_fresh"));
  const oldHash = (await f.state()).documents.find(d => d.active === 1).hash;
  assert.equal(oldHash, hash("quartz before concurrent write"));
  await f.control({});
  const concurrent = await Promise.all([f.run("index"), f.run("index")]);
  assert.deepEqual(concurrent.map(r => r.work.embedded).sort(), [0, 1]);
  assert.deepEqual(concurrent.map(r => r.work.updated).sort(), [0, 1]);
  assert.equal((await f.state()).counters.embedded, 2);
  assert.equal((await f.run("status")).readiness.freshness, "fresh");
  assert.equal(existsSync(path.join(f.derived, "index.lock")), false);
});


test("default lexical indexing stays model-free, reports true empties and never hides a total query outage", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz lexical only");
  const result = await f.run("index");
  work(result, { added: 1 });
  assert.equal(result.readiness.embedding, "disabled");
  assert.deepEqual(result.readiness.modes, ["lexical"]);
  const empty = await f.run("search", { query: "unmatchedkeyword" });
  assert.deepEqual(empty.results, []);
  assert.equal(empty.retrieval.status, "complete");
  await f.control({ fail: "search" });
  await assert.rejects(f.run("search"), /no backend query succeeded/);
  assert.equal((await f.events()).some(e => e.type === "llm" || (e.type === "query" && e.command === "query")), false);
  await assert.rejects(f.run("index", { indexing: { mode: "semantic", model: "hf:remote-model" } }), /provisioned absolute local GGUF/);
  assert.equal((await json(path.join(f.root, "jumpybrain.json"))).indexing.mode, "lexical");
});

test("first-generation embedding failure cannot publish a fresh empty index; retry recovers missing DB", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz initial failure");
  await f.control({ fail: "embed" });
  await assert.rejects(f.run("index", { indexing: f.policy }), /failed during embed/);
  assert.equal(existsSync(f.dbFile), false);
  assert.equal(existsSync(f.manifestFile), false);
  assert.equal((await f.run("status")).readiness.freshness, "missing");
  await f.control({});
  work(await f.run("index"), { added: 1, embedded: 1 });
  assert.equal((await f.run("status")).readiness.freshness, "fresh");
  assert.equal((await f.state()).counters.embedded, 1);
});

test("unknown legacy vector identity requires rebuild and semantic query failure is labeled lexical fallback", async t => {
  const f = await setup(t);
  await f.put("a.md", "quartz known vector identity");
  await f.run("index", { indexing: f.policy });
  // Simulate an old database with vectors but no committed generation/model digest.
  const legacy = await f.state();
  delete legacy.manifest;
  legacy.tables = legacy.tables.filter(name => name !== "jb_generation");
  await writeFile(f.dbFile, JSON.stringify(legacy));
  const before = await readFile(f.dbFile, "utf8");
  await assert.rejects(f.run("index"), /failed during compatibility/);
  assert.equal(await readFile(f.dbFile, "utf8"), before);
  work(await f.run("index", { rebuild: true }), { added: 1, embedded: 1 });
  await f.control({ fail: "query" });
  const result = await f.run("search");
  assert.equal(result.results[0].provenance.file, "a.md");
  assert.equal(result.retrieval.status, "partial");
  assert.ok(result.retrieval.warnings.includes("semantic_query_failed_lexical_fallback"));
  assert.equal(result.readiness.embedding, "complete");
});


test("full rebuild replaces corrupted content and inactive history atomically from the exact snapshot", async t => {
  const f = await setup(t);
  const original = "---\ndream: true\n---\nquartz canonical bytes\n";
  await f.put("a.md", original);
  await f.put("removed.md", "quartz obsolete bytes");
  await f.run("index", { indexing: f.policy });
  await rm(path.join(f.root, "removed.md"));
  await f.run("index");
  const corrupted = await f.state();
  corrupted.content[hash(original)] = "corrupt cached content under the unchanged hash";
  await writeFile(f.dbFile, JSON.stringify(corrupted));
  const before = await readFile(f.dbFile, "utf8");
  const generation = (await f.manifest()).generation;
  for (const fail of ["ingest", "embed", "coverage-vector", "commit"]) {
    await f.control({ fail });
    await assert.rejects(f.run("index", { rebuild: true }), /previous committed index retained/);
    assert.equal(await readFile(f.dbFile, "utf8"), before);
    assert.equal((await f.manifest()).generation, generation);
  }
  await f.control({});
  work(await f.run("index", { rebuild: true }), { added: 1, embedded: 1 });
  const rebuilt = await f.state();
  assert.deepEqual(rebuilt.content, { [hash(original)]: original });
  assert.equal(rebuilt.documents.length, 2);
  assert.deepEqual(active(rebuilt), ["a.md"]);
  assert.deepEqual(active(rebuilt, "jumpybrain-dreams"), ["a.md"]);
  assert.equal(rebuilt.metadata.length, 1);
  for (const type of ["clear-documents", "clear-content", "clear-fts"])
    assert.ok((await f.events()).some(event => event.type === type));
  // Lexical rebuild has the same full replacement semantics, without embedding.
  work(await f.run("index", { rebuild: true, indexing: { mode: "lexical" } }), { added: 1 });
  assert.deepEqual((await f.state()).metadata, []);
  assert.equal((await f.run("search")).results[0].provenance.file, "a.md");
});
