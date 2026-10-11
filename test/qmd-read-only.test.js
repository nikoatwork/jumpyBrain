import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const build = process.env.JUMPYBRAIN_TEST_BUILD_DIR
  ? pathToFileURL(`${process.env.JUMPYBRAIN_TEST_BUILD_DIR}/`) : new URL("../dist/", import.meta.url);
const { runReadOnlyQmd, withReadOnlyQmdGeneration } = await import(new URL("adapters/qmd/qmd-read-only.js", build));
const { searchMemory, compactSearchMemory, readMarkdownDocuments } = await import(new URL("runtime/index.js", build));
const { startJumpyBrainHttpServer } = await import(new URL("server/index.js", build));
const { createRemoteMemoryTransport } = await import(new URL("adapters/http-client/index.js", build));
const { databasePath, manifestPath } = await import(new URL("adapters/qmd/qmd-cli.js", build));
const fixture = fileURLToPath(new URL("./fixtures/fake-qmd-read-only/", import.meta.url));
const args = ["search", "dispatch approval", "--json", "-n", "2", "-c", "jumpybrain"];
async function snapshot(root) {
  const entries = [];
  async function walk(file) {
    const s = await lstat(file, { bigint: true });
    entries.push([path.relative(root, file), String(s.mode), String(s.size), String(s.mtimeNs), String(s.ctimeNs),
      s.isFile() ? createHash("sha256").update(await readFile(file)).digest("hex") : null]);
    if (s.isDirectory()) for (const child of (await readdir(file)).sort()) await walk(path.join(file, child));
  }
  await walk(root); return entries;
}
async function setup(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jb-readonly-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "memory"), pkg = path.join(temp, "qmd");
  await mkdir(path.join(pkg, "dist"), { recursive: true });
  await mkdir(path.join(pkg, "bin"));
  await mkdir(path.join(pkg, "node_modules/better-sqlite3"), { recursive: true });
  await writeFile(path.join(pkg, "package.json"), JSON.stringify({ name: "@tobilu/qmd", version: "2.8.3", type: "module" }));
  await writeFile(path.join(pkg, "bin/qmd"), "not a CLI: do not execute");
  await writeFile(path.join(pkg, "dist/index.js"), "throw Error('do not load SDK entry/createStore')");
  await copyFile(path.join(fixture, "store.js.fixture"), path.join(pkg, "dist/store.js"));
  await copyFile(path.join(fixture, "sqlite.cjs.fixture"), path.join(pkg, "node_modules/better-sqlite3/index.js"));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = path.join(pkg, "bin/qmd");
  t.after(() => { if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous; });
  await mkdir(path.dirname(databasePath(root)), { recursive: true });
  const state = { manifest: { generation: "published" }, expectedFetch: 50, expectedCollection: "jumpybrain", rows: [
    { filepath: "qmd://jumpybrain/a.md", title: "Approval", hash: "abcdef123", score: 0.004, body: "dispatch approval" },
    { filepath: "qmd://jumpybrain/b.md", title: "Dispatch", hash: "123456def", score: 0.125, body: "dispatch approval two" },
    { filepath: "qmd://jumpybrain/c.md", title: "Extra", hash: "987654aaa", score: 0, body: "extra" },
  ] };
  await writeFile(databasePath(root), JSON.stringify(state));
  await writeFile(manifestPath(root), JSON.stringify(state.manifest));
  return { root, state, put: () => writeFile(databasePath(root), JSON.stringify(state)) };
}
async function unchanged(root, operation) {
  const before = await snapshot(root);
  try { return await operation(); } finally { assert.deepEqual(await snapshot(root), before); }
}
test("strict lexical worker uses immutable physical readonly URI, rounds CLI rows and never loads CLI/createStore", async t => {
  const { root, state, put } = await setup(t);
  const result = await unchanged(root, () => withReadOnlyQmdGeneration(root, () => runReadOnlyQmd(root, args)));
  assert.equal(result.exitCode, 0); assert.equal(result.stderr, "");
  const rows = JSON.parse(result.stdout);
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(r => r.score), [0, 0.13]);
  assert.equal(rows[0].docid, "#abcdef"); assert.equal(rows[0].line, 3);
  assert.match(rows[0].snippet, /^@@ -2,4 @@/);
  state.expectedFetch = 120; await put();
  assert.equal(JSON.parse((await unchanged(root, () => runReadOnlyQmd(root, args.map(v => v === "2" ? "60" : v)))).stdout).length, 3);
});
test("all static failure gates leave original state unchanged", async t => {
  for (const scenario of ["wal", "lock", "pending", "missing-generation", "mismatch", "corrupt", "query-failure", "missing-db", "missing-manifest"]) {
    await t.test(scenario, async t => {
      const { root, state, put } = await setup(t);
      if (scenario === "wal") await writeFile(`${databasePath(root)}-wal`, "committed WAL bytes");
      if (scenario === "lock") await writeFile(path.join(root, ".jumpybrain/index.lock"), JSON.stringify({ pid: process.pid }));
      if (scenario === "pending") await writeFile(path.join(root, ".jumpybrain/index-pending.json"), "pending");
      if (scenario === "missing-generation") { delete state.manifest.generation; await put(); await writeFile(manifestPath(root), JSON.stringify(state.manifest)); }
      if (scenario === "mismatch") { state.manifest.generation = "other"; await put(); }
      if (scenario === "corrupt") await writeFile(databasePath(root), "private-corruption-do-not-expose");
      if (scenario === "query-failure") { state.failQuery = true; await put(); }
      if (scenario === "missing-db") await rm(databasePath(root));
      if (scenario === "missing-manifest") await rm(manifestPath(root));
      await unchanged(root, () => assert.rejects(withReadOnlyQmdGeneration(root, () => runReadOnlyQmd(root, args)), error => {
        assert.match(error.message, /Read-only/); assert.doesNotMatch(error.message, /private-|WAL bytes/); return true;
      }));
    });
  }
});
test("empty WAL is safe without creating SHM; semantic and unknown args fail without mutation", async t => {
  const { root } = await setup(t);
  await writeFile(`${databasePath(root)}-wal`, "");
  await unchanged(root, () => runReadOnlyQmd(root, args));
  for (const command of [["query", "vec: secret", "--json"], [...args, "--full"], args.map(v => v === "2" ? "161" : v)]) {
    await unchanged(root, () => assert.rejects(runReadOnlyQmd(root, command), { code: "read_only_arguments" }));
  }
});
test("outer guard rejects filesystem, publication and generation changes across full retrieval, including failed retrieval", async t => {
  for (const mutation of ["manifest", "db", "wal", "lock", "pending", "throw"]) await t.test(mutation, async t => {
    const { root } = await setup(t);
    await assert.rejects(withReadOnlyQmdGeneration(root, async () => {
      await runReadOnlyQmd(root, args);
      if (mutation === "manifest" || mutation === "throw") await writeFile(manifestPath(root), JSON.stringify({ generation: "replacement" }));
      if (mutation === "db") await writeFile(databasePath(root), "replaced");
      if (mutation === "wal") await writeFile(`${databasePath(root)}-wal`, "committed");
      if (mutation === "lock") await writeFile(path.join(root, ".jumpybrain/index.lock"), "new owner");
      if (mutation === "pending") await writeFile(path.join(root, ".jumpybrain/index-pending.json"), "pending");
      if (mutation === "throw") throw Error("operation failed");
      return "must not return";
    }), error => { assert.match(error.message, /Read-only/); return true; });
  });
});

 test("strict runtime/compact/HTTP retrieval is source-backed and zero-write even on physically readonly memory", async t => {
  const { root, state, put } = await setup(t);
  const id = "mem_80000000-0000-4000-8000-000000000001";
  const content = `---\nid: ${id}\ntitle: Dispatch approval\ncreated_at: 2024-01-01\n---\nDispatch approval is provisional, NOT production approved.\n`;
  await mkdir(path.join(root, "notes"));
  await writeFile(path.join(root, "notes/a.md"), content);
  const info = await stat(path.join(root, "notes/a.md"));
  state.rows = [state.rows[0]];
  state.rows[0].filepath = "qmd://jumpybrain/notes/a.md";
  state.rows[0].body = content;
  state.expectedFetch = 80;
  state.manifest = { version: 1, root, generation: "published", qmdCollection: "jumpybrain", generatedAt: new Date().toISOString(),
    policy: { mode: "lexical" }, embedding: { state: "disabled" }, documents: await readMarkdownDocuments(root),
    sources: [{ file: "notes/a.md", size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs }] };
  await put(); await writeFile(manifestPath(root), JSON.stringify(state.manifest));
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ["readonly-test"], port: 0, autoIndex: false,
    logger: { log() {}, info() {}, warn() {}, error() {} } });
  t.after(() => server.close());
  const remote = createRemoteMemoryTransport({ url: server.url, apiKey: "readonly-test" });
  const modes = await snapshot(root);
  for (const [file, mode] of [...modes].reverse()) await chmod(path.join(root, file), (Number(mode) & 0o170000) === 0o040000 ? 0o555 : 0o444);
  try {
    await unchanged(root, async () => {
      const local = await searchMemory(root, "dispatch approval", 5, { readOnly: true });
      assert.equal(local.results[0].provenance.file, "notes/a.md");
      assert.match(local.results[0].snippet, /NOT production approved/);
      assert.ok(local.retrieval.warnings.includes("read_only_index"));
      const hosted = await remote.searchMemory("dispatch approval", 5, { readOnly: true });
      assert.deepEqual(hosted.results, JSON.parse(JSON.stringify(local.results)));
      const compact = await compactSearchMemory(root, "dispatch approval", 5, { readOnly: true, maxBytes: 2048 });
      assert.equal(compact.passages[0].documentId, id);
      assert.ok(Buffer.byteLength(JSON.stringify(compact) + "\n") <= 2048);
      assert.deepEqual(await remote.compactSearchMemory("dispatch approval", 5, { readOnly: true, maxBytes: 2048 }), compact);
      for (const command of [["recall"], ["search"], ["run", "memory:search"]]) for (const mode of [["--json"], ["--compact", "--max-bytes", "2048"]]) {
        const { stdout } = await execute(process.execPath, [fileURLToPath(new URL("cli.js", build)), ...command, "--root", root,
          "--query", "dispatch approval", "--limit", "5", "--read-only", ...mode]);
        assert.ok(JSON.parse(stdout).retrieval.warnings.includes("read_only_index"));
      }
      const old = createRemoteMemoryTransport({ url: "https://old.example", apiKey: "unused", fetchImpl: async () => new Response(JSON.stringify({ query: "dispatch approval", results: [] })) });
      await assert.rejects(old.searchMemory("dispatch approval", 5, { readOnly: true }), { code: "unsupported_read_only" });
    });
  } finally { for (const [file, mode] of modes) await chmod(path.join(root, file), Number(mode) & 0o777); }
  await writeFile(path.join(root, ".jumpybrain/index.lock"), "do not reclaim");
  await unchanged(root, () => assert.rejects(remote.searchMemory("dispatch approval", 5, { readOnly: true }), { code: "read_only_busy" }));
});
