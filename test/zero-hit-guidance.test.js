import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { FEWER_KEYWORDS_HINT, fewerKeywordsHintApplies } from "../dist/core/retrieval-policy/zero-hit.js";
import { serializeCompactRecall } from "../dist/core/retrieval-policy/compact.js";
import { qmdLexQueries, queryKeywordCount } from "../dist/adapters/qmd/qmd-query.js";
import { databasePath, manifestPath } from "../dist/adapters/qmd/qmd-cli.js";
import { indexMemory, searchMemory } from "../dist/app/local-memory/index.js";
import { compactSearchMemory } from "../dist/app/local-memory/compact.js";
import { readMarkdownDocuments } from "../dist/runtime/index.js";
import { stopRootBackend } from "../dist/app/backend-host/index.js";
import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
import { createRemoteMemoryTransport } from "../dist/adapters/http-client/index.js";
import { formatHumanResults } from "../dist/cli/formatting.js";
import { classifyVerification } from "../scripts/install-compatibility.mjs";
import { installFakeQmd } from "./fake-qmd-helper.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const logger = { info() {}, warn() {}, error() {}, log() {} };
// Synthetic stand-ins for the reported shape: a long query misses, its two-keyword core hits.
const LONG = "SAP C4C CRM step setup chat";
const SHORT = "SAP C4C";
const NOTE = "SAP C4C tenant onboarding: connect the sales cloud before the first sync.";
const TEXT = /No memory matches found\. Try fewer keywords; text search needs them to appear together\./;
const bytes = packet => Buffer.byteLength(serializeCompactRecall(packet), "utf8");
const hinted = result => result.retrieval.warnings.includes(FEWER_KEYWORDS_HINT);

/** One note behind an AND-faithful fake backend that records every query it is asked. */
async function fixture(t, { semantic = false } = {}) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-zero-hit-")));
  const root = path.join(temp, "memory");
  t.after(async () => {
    if (existsSync(path.join(root, ".jumpybrain/backend/owner.json"))) await stopRootBackend(root);
    await rm(temp, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "notes"), { recursive: true });
  await writeFile(path.join(root, "notes/sap.md"), `---\nid: mem_90000000-0000-4000-8000-000000000001\ntype: note\ntitle: Tenant onboarding\ndate: 2026-01-10\n---\n${NOTE}\n`);
  const stateFile = path.join(temp, "state.json");
  const callsFile = path.join(temp, "calls.jsonl");
  const { bin, model } = await installFakeQmd(root);
  await writeFile(bin, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2), command = args[0], query = args[1];
if (command !== 'search' && command !== 'query') { console.log('[]'); process.exit(0); }
const state = JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, 'utf8'));
fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify({ command, query }) + '\\n');
if (state.failAll || (state.failQueries || []).includes(query) || (state.failCommands || []).includes(command)) process.exit(1);
const words = value => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const collection = args[args.indexOf('-c') + 1];
const rows = collection !== 'jumpybrain' ? [] : command === 'query' ? (state.semanticRows || [])
  : state.rows.filter(row => words(query).length && words(query).every(term => words(row.snippet).includes(term)));
console.log(rows.length ? JSON.stringify(rows.map(row => ({ ...row, file: 'qmd://' + collection + '/' + row.file }))) : 'No results found.');
`);
  await chmod(bin, 0o755);
  for (const [key, value] of Object.entries({ JUMPYBRAIN_QMD_BIN: bin, JUMPYBRAIN_QMD_EMBED: "0" })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const configure = async (extra = {}) => {
    await writeFile(stateFile, JSON.stringify({ rows: [{ file: "notes/sap.md", snippet: NOTE, score: 0.8, line: 7 }], ...extra }));
    await writeFile(callsFile, "");
  };
  const calls = async () => (await readFile(callsFile, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line));
  await configure();
  await indexMemory(root, semantic ? { indexing: { mode: "semantic", model } } : {});
  await configure();
  return { root, temp, configure, calls };
}

test("the pure policy hints only for a completed lexical-only miss of several keywords", () => {
  const base = { results: 0, requested: 5, keywords: 5, readOnly: false, modes: ["lexical"], warnings: [] };
  assert.equal(fewerKeywordsHintApplies(base), true);
  for (const [name, facts] of Object.entries({
    "any result": { results: 1 },
    "no search requested": { requested: 0 },
    "one keyword": { keywords: 1 },
    "no keyword": { keywords: 0 },
    "semantic discovery ran": { modes: ["lexical", "semantic"] },
    "semantic discovery ran after relaxation": { modes: ["lexical", "semantic"], warnings: ["keyword_query_relaxed"] },
    "stale index": { warnings: ["index_not_fresh"] },
    "failed lexical branch": { warnings: ["lexical_query_failed"] },
    "failed semantic branch": { modes: ["lexical", "semantic"], warnings: ["semantic_query_failed_lexical_fallback"] },
    "incomplete embeddings": { warnings: ["semantic_coverage_incomplete"] },
    "temporal filter": { warnings: ["temporal_bounded_discovery"] },
    "changed source": { warnings: ["source_changed"] },
    "unknown future warning": { warnings: ["something_new"] },
  })) assert.equal(fewerKeywordsHintApplies({ ...base, ...facts }), false, name);
  for (const [name, facts] of Object.entries({
    "relaxed singletons also missed": { warnings: ["keyword_query_relaxed"] },
    "constraints kept a semantic index lexical": { modes: ["lexical", "semantic"], warnings: ["query_constraints_lexical_only"] },
    "read-only lexical fallback": { readOnly: true, modes: ["lexical", "semantic"], warnings: ["read_only_index", "read_only_lexical_fallback"] },
    "read-only lexical index": { readOnly: true, warnings: ["read_only_index"] },
    "two keywords": { keywords: 2 },
  })) assert.equal(fewerKeywordsHintApplies({ ...base, ...facts }), true, name);
});

test("keywords are counted as the lexical backend sees them, without sending anything", () => {
  assert.equal(queryKeywordCount(LONG), 5, "the stopword 'chat' is not a keyword");
  assert.equal(queryKeywordCount(SHORT), 2);
  assert.equal(queryKeywordCount("installation check"), 1, "installer verification topic stays a single keyword");
  for (const single of ["unmatchedkeyword", "mem_abc123", "src/qmd-query.ts", "the and with dispatch", "  quartz  ", "quartz Quartz"]) assert.equal(queryKeywordCount(single), 1, single);
  for (const none of ["", "   ", "the and with"]) assert.equal(queryKeywordCount(none), 0, JSON.stringify(none));
  assert.equal(queryKeywordCount('"dispatch approval" -unicorn'), 3);
});

test("a lexical miss gets one static hint and no extra backend query, ranking or status change", async t => {
  const { root, configure, calls } = await fixture(t);
  const miss = await searchMemory(root, LONG, 5);
  assert.deepEqual(miss.results, []);
  assert.deepEqual(miss.retrieval, { status: "complete", warnings: [FEWER_KEYWORDS_HINT] });
  assert.deepEqual(await calls(), [{ command: "search", query: LONG }], "identifier-bearing queries pass through once: no broadened query, no retry");

  await configure();
  const hit = await searchMemory(root, SHORT, 5);
  assert.deepEqual(hit.results.map(result => result.provenance.file), ["notes/sap.md"]);
  assert.deepEqual(hit.retrieval, { status: "complete", warnings: [] });
  assert.match(hit.results[0].snippet, /SAP C4C tenant onboarding/);

  for (const query of ["unmatchedkeyword", "installation check"]) {
    await configure();
    const single = await searchMemory(root, query, 5);
    assert.deepEqual(single.results, [], query);
    assert.deepEqual(single.retrieval, { status: "complete", warnings: [] }, query);
    assert.equal((await calls()).length, 1, query);
  }

  // Existing relaxation is unchanged: same strict variants, same two singletons, then the hint.
  await configure();
  const relaxed = await searchMemory(root, "nebula phantom", 5);
  assert.deepEqual(relaxed.results, []);
  assert.deepEqual(relaxed.retrieval, { status: "partial", warnings: ["keyword_query_relaxed", FEWER_KEYWORDS_HINT] });
  assert.deepEqual((await calls()).map(call => call.query), [...qmdLexQueries("nebula phantom"), "nebula", "phantom"]);

  await configure();
  const unrequested = await searchMemory(root, LONG, 0);
  assert.deepEqual(unrequested.results, []);
  assert.equal(hinted(unrequested), false, "a zero limit never searched");
  assert.deepEqual(await calls(), []);
});

test("failed, stale and date-filtered empties keep their own explanation and get no keyword hint", async t => {
  const { root, configure } = await fixture(t);
  await configure({ failQueries: ["beta gamma"] });
  const partial = await searchMemory(root, "alpha beta gamma", 5);
  assert.deepEqual(partial.results, []);
  assert.equal(partial.retrieval.status, "partial");
  assert.ok(partial.retrieval.warnings.includes("lexical_query_failed"));
  assert.equal(hinted(partial), false);

  await configure({ failAll: true });
  await assert.rejects(searchMemory(root, LONG, 5), /no backend query succeeded/);

  await configure();
  const scoped = await searchMemory(root, LONG, 5, { temporal: { from: "2030-01-01", to: "2030-01-31" } });
  assert.deepEqual(scoped.results, []);
  assert.ok(scoped.retrieval.warnings.includes("temporal_bounded_discovery"));
  assert.equal(hinted(scoped), false);

  await writeFile(path.join(root, "notes/later.md"), "---\ntitle: Later\n---\nWritten after the index was built.\n");
  await configure();
  const stale = await searchMemory(root, LONG, 5, { refresh: false });
  assert.deepEqual(stale.results, []);
  assert.ok(stale.retrieval.warnings.includes("index_not_fresh"));
  assert.equal(hinted(stale), false);
});

test("a semantic index hints only when constraints kept discovery lexical and nothing failed", async t => {
  const { root, configure, calls } = await fixture(t, { semantic: true });
  const ready = await searchMemory(root, SHORT, 5);
  assert.deepEqual(ready.readiness.modes, ["lexical", "semantic"]);

  await configure();
  const vector = await searchMemory(root, "nebula phantom", 5);
  assert.deepEqual(vector.results, []);
  assert.ok((await calls()).some(call => call.command === "query"), "vector discovery ran");
  assert.equal(hinted(vector), false, "an empty semantic search is not a keyword-conjunction miss");

  await configure({ semanticRows: [{ file: "notes/sap.md", snippet: NOTE, score: 0.7, line: 7 }] });
  const paraphrase = await searchMemory(root, "customer platform rollout", 5);
  assert.deepEqual(paraphrase.results.map(result => result.provenance.file), ["notes/sap.md"]);
  assert.equal(hinted(paraphrase), false);

  await configure();
  const constrained = await searchMemory(root, LONG, 5);
  assert.deepEqual(constrained.results, []);
  assert.deepEqual(constrained.retrieval, { status: "partial", warnings: ["query_constraints_lexical_only", FEWER_KEYWORDS_HINT] });
  assert.deepEqual(await calls(), [{ command: "search", query: LONG }]);

  await configure({ failCommands: ["query"] });
  const failed = await searchMemory(root, "nebula phantom", 5);
  assert.deepEqual(failed.results, []);
  assert.ok(failed.retrieval.warnings.includes("semantic_query_failed_lexical_fallback"));
  assert.equal(hinted(failed), false);
});

test("compact packets carry the hint inside the byte budget and never fail or lose evidence for it", async t => {
  const { root } = await fixture(t);
  for (const maxBytes of [1024, 8192, 65536]) {
    const packet = await compactSearchMemory(root, LONG, 5, { maxBytes });
    assert.deepEqual(packet.passages, []);
    assert.deepEqual(packet.omitted, { results: 0, passages: 0 });
    assert.deepEqual(packet.retrieval, { status: "complete", warnings: [FEWER_KEYWORDS_HINT] });
    assert.equal(serializeCompactRecall(packet), JSON.stringify(packet) + "\n");
    assert.ok(bytes(packet) <= maxBytes);
  }
  const found = await compactSearchMemory(root, SHORT, 5);
  assert.equal(found.passages.length, 1);
  assert.deepEqual(found.retrieval, { status: "complete", warnings: [] });

  // The advisory code yields before a previously fitting empty envelope would fail its budget.
  const empty = await compactSearchMemory(root, LONG, 5, { maxBytes: 1024 });
  const room = 1024 - bytes(empty);
  const fits = `${LONG} ${"x".repeat(room - 1)}`;
  const exact = await compactSearchMemory(root, fits, 5, { maxBytes: 1024 });
  assert.equal(bytes(exact), 1024);
  assert.equal(hinted(exact), true);
  const tight = await compactSearchMemory(root, `${fits}x`, 5, { maxBytes: 1024 });
  assert.deepEqual(tight.retrieval, { status: "complete", warnings: [] }, "hint dropped, packet still returned");
  assert.ok(bytes(tight) <= 1024);
  const widest = `${fits}${"x".repeat(FEWER_KEYWORDS_HINT.length + 2)}`;
  assert.equal(bytes(await compactSearchMemory(root, widest, 5, { maxBytes: 1024 })), 1024, "same largest query as before the hint existed");
  await assert.rejects(compactSearchMemory(root, `${widest}x`, 5, { maxBytes: 1024 }), { code: "budget_too_small" });
});

test("budget-omitted evidence is reported as omitted, never as a keyword miss", async t => {
  const { root, configure } = await fixture(t);
  const wide = `SAP C4C ${"tenant onboarding qualification ".repeat(30)}`.trim();
  await writeFile(path.join(root, "notes/sap.md"), `---\nid: mem_90000000-0000-4000-8000-000000000001\ntype: note\ntitle: Tenant onboarding\ndate: 2026-01-10\n---\n${wide}\n`);
  await indexMemory(root);
  await configure({ rows: [{ file: "notes/sap.md", snippet: wide, score: 0.8, line: 7 }] });
  const packet = await compactSearchMemory(root, SHORT, 5, { maxBytes: 1024 });
  assert.deepEqual(packet.passages, []);
  assert.deepEqual(packet.omitted, { results: 1, passages: 1 });
  assert.equal(hinted(packet), false);
  assert.ok(bytes(packet) <= 1024);
});

test("hosted rich and compact results match local ones byte for byte, and CLI text states the hint once", async t => {
  const { root, temp, configure } = await fixture(t);
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ["secret"], port: 0, autoIndex: false, logger });
  t.after(() => server.close());
  const remote = createRemoteMemoryTransport({ url: server.url, apiKey: "secret" });

  for (const maxBytes of [1024, 8192]) {
    const local = await compactSearchMemory(root, LONG, 5, { maxBytes, refresh: false });
    assert.equal(hinted(local), true);
    assert.deepEqual(await remote.compactSearchMemory(LONG, 5, { maxBytes }), local, "the closed version-1 client schema accepts the code");
    const response = await fetch(server.url + "/memories/all/recall/compact", { method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" }, body: JSON.stringify({ query: LONG, limit: 5, maxBytes }) });
    assert.equal(await response.text(), JSON.stringify(local) + "\n");
  }
  for (const mode of ["search", "recall"]) {
    const hosted = await remote.searchMemory(LONG, 5, { mode });
    assert.deepEqual(hosted.results, []);
    assert.deepEqual(hosted.retrieval, (await searchMemory(root, LONG, 5, { refresh: false })).retrieval);
    assert.deepEqual(hosted.retrieval, { status: "complete", warnings: [FEWER_KEYWORDS_HINT] });
    assert.deepEqual((await remote.searchMemory(SHORT, 5, { mode })).retrieval, { status: "complete", warnings: [] });
  }

  const policy = path.join(temp, "policy.json");
  await writeFile(policy, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: server.url, access: "read-only" }] }));
  const env = { ...process.env, JUMPYBRAIN_API_KEY: "secret", JUMPYBRAIN_CLI_CONFIG: policy };
  const run = args => execute(process.execPath, [cli, ...args], { env });
  for (const target of [["--root", root], ["--target-url", server.url]]) {
    for (const command of [["recall", "--topic"], ["search", "--query"], ["run", "memory:recall", "--topic"]]) {
      await configure();
      const text = await run([...command, LONG, ...target]);
      assert.match(text.stdout, TEXT);
      assert.equal(text.stdout.match(/fewer keywords/g).length, 1);
      assert.doesNotMatch(text.stdout, /Warning:|no_matches_try_fewer_keywords/, "plain guidance, not a degraded-retrieval warning");
      const json = JSON.parse((await run([...command, LONG, ...target, "--json"])).stdout);
      assert.deepEqual(json.results, []);
      assert.deepEqual(json.retrieval, { status: "complete", warnings: [FEWER_KEYWORDS_HINT] });
      const compact = await run([...command, LONG, ...target, "--compact", "--max-bytes", "1024"]);
      assert.equal(compact.stdout, JSON.stringify(await compactSearchMemory(root, LONG, 5, { maxBytes: 1024, refresh: false })) + "\n");
      assert.equal(compact.stderr, "");
      assert.ok(Buffer.byteLength(compact.stdout) <= 1024);
    }
    const found = await run(["recall", "--topic", SHORT, ...target]);
    assert.match(found.stdout, /SAP C4C tenant onboarding/);
    assert.doesNotMatch(found.stdout, /fewer keywords|No memory matches/);
    const single = await run(["recall", "--topic", "unmatchedkeyword", ...target]);
    assert.match(single.stdout, /No memory matches found\.\n$/);
    assert.doesNotMatch(single.stdout, /fewer keywords/);
  }
  assert.equal(formatHumanResults([]), "No memory matches found.", "callers that do not pass the hint keep the previous text");
});

test("strict read-only misses hint through the lexical fallback and leave installer verification unchanged", async t => {
  // The read-only path uses pinned lexical functions on an immutable store, so it has its own fake.
  const temp = await mkdtemp(path.join(os.tmpdir(), "jb-zero-hit-readonly-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "memory"), pkg = path.join(temp, "qmd");
  const source = fileURLToPath(new URL("./fixtures/fake-qmd-read-only/", import.meta.url));
  await mkdir(path.join(pkg, "dist"), { recursive: true });
  await mkdir(path.join(pkg, "bin"));
  await mkdir(path.join(pkg, "node_modules/better-sqlite3"), { recursive: true });
  await writeFile(path.join(pkg, "package.json"), JSON.stringify({ name: "@tobilu/qmd", version: "2.8.3", type: "module" }));
  await writeFile(path.join(pkg, "bin/qmd"), `#!${process.execPath}\nif(process.argv[2] !== '--version') throw Error('unexpected query CLI'); console.log('qmd 2.8.3');\n`);
  await chmod(path.join(pkg, "bin/qmd"), 0o700);
  await writeFile(path.join(pkg, "dist/index.js"), "throw Error('do not load SDK entry/createStore')");
  await writeFile(path.join(pkg, "dist/llm.js"), "throw Error('do not load models')");
  await copyFile(path.join(source, "store.js.fixture"), path.join(pkg, "dist/store.js"));
  await copyFile(path.join(source, "sqlite.cjs.fixture"), path.join(pkg, "node_modules/better-sqlite3/index.js"));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = path.join(pkg, "bin/qmd");
  t.after(() => { if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous; });

  await mkdir(path.join(root, "notes"), { recursive: true });
  const note = path.join(root, "notes/sap.md");
  await writeFile(note, `---\ntitle: Tenant onboarding\n---\n${NOTE}\n`);
  const info = await stat(note);
  const model = path.join(root, ".jumpybrain/model.gguf");
  await mkdir(path.dirname(databasePath(root)), { recursive: true });
  await writeFile(model, "fictional model bytes; must not be loaded");
  const modelInfo = await stat(model);
  const indexing = { mode: "semantic", model };
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 1, indexing }));
  const manifest = { version: 1, root, generation: "published", qmdCollection: "jumpybrain", generatedAt: "2026-01-01T00:00:00Z",
    policy: indexing, embedding: { state: "complete" }, modelStat: { size: modelInfo.size, mtimeMs: modelInfo.mtimeMs, ctimeMs: modelInfo.ctimeMs },
    documents: await readMarkdownDocuments(root), sources: [{ file: "notes/sap.md", size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs }] };
  await writeFile(databasePath(root), JSON.stringify({ manifest, expectedFetch: 80, expectedCollection: "jumpybrain", rows: [] }));
  await writeFile(manifestPath(root), JSON.stringify(manifest));

  const miss = await searchMemory(root, LONG, 5, { readOnly: true });
  assert.deepEqual(miss.results, []);
  assert.deepEqual(miss.readiness.modes, ["lexical", "semantic"]);
  assert.deepEqual(miss.retrieval, { status: "partial", warnings: ["read_only_index", "read_only_lexical_fallback", FEWER_KEYWORDS_HINT] });
  const compact = await compactSearchMemory(root, LONG, 5, { readOnly: true, maxBytes: 1024 });
  assert.deepEqual(compact.retrieval, miss.retrieval);
  assert.ok(bytes(compact) <= 1024);

  // The installer accepts only the two read-only warnings; its one-keyword topic must add nothing.
  const { stdout } = await execute(process.execPath, [cli, "recall", "--root", root, "--topic", "installation check", "--limit", "1", "--json", "--read-only"]);
  assert.deepEqual(JSON.parse(stdout).retrieval, { status: "partial", warnings: ["read_only_index", "read_only_lexical_fallback"] });
  assert.equal(classifyVerification("recall", { status: 0, stdout }, { readOnly: true }).outcome, "ready");
});
