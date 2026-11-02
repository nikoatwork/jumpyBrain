/** Optional provisioned-package evidence: no installation/download in this test. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
const build = process.env.JUMPYBRAIN_TEST_BUILD_DIR
  ? pathToFileURL(`${process.env.JUMPYBRAIN_TEST_BUILD_DIR}/`) : new URL("../dist/", import.meta.url);
const { runReadOnlyQmd, withReadOnlyQmdGeneration } = await import(new URL("adapters/qmd/qmd-read-only.js", build));
const { databasePath, resolveQmdSdk, runQmd } = await import(new URL("adapters/qmd/qmd-cli.js", build));
const { withQmdOperation } = await import(new URL("adapters/qmd/qmd-execution.js", build));
const { indexMemory, searchMemory, compactSearchMemory } = await import(new URL("app/local-memory/index.js", build));
const args = ["search", "dispatch approval", "--json", "-n", "10", "-c", "jumpybrain"];
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
async function unchanged(root, operation) {
  const before = await snapshot(root);
  try { return await operation(); } finally { assert.deepEqual(await snapshot(root), before); }
}
test("real QMD 2.8.3: CLI parity, WAL-absent physical readonly success, committed-WAL fail-closed", {
  skip: !process.env.JUMPYBRAIN_TEST_QMD_BIN && "Set JUMPYBRAIN_TEST_QMD_BIN to a provisioned @tobilu/qmd@2.8.3 binary",
}, async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jb-readonly-real-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = process.env.JUMPYBRAIN_TEST_QMD_BIN;
  t.after(() => { if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous; });
  const root = path.join(temp, "memory");
  await mkdir(path.join(root, "pages"), { recursive: true });
  for (const [file, text] of [["alpha", "dispatch approval requires the owner"], ["beta", "dispatch approval requires signoff"], ["dream", "dispatch approval overview"]]) {
    await writeFile(path.join(root, "pages", `${file}.md`), `---\ntitle: ${file}\ndate: 2020-01-01\n${file === "dream" ? "dream: true\n" : ""}---\n# ${file}\nBefore context\n${text}\nAfter context\n`);
  }
  await indexMemory(root, { indexing: { mode: "lexical" } });
  const sdk = resolveQmdSdk();
  process.env.SQLITE_USE_URI = "1";
  const Database = createRequire(sdk)("better-sqlite3");
  const ordinary = await withQmdOperation(root, "search", {}, () => runQmd(root, args));
  const expected = JSON.parse(ordinary.stdout);
  assert.equal(expected.length, 3);
  await assert.rejects(lstat(`${databasePath(root)}-wal`), { code: "ENOENT" });
  await assert.rejects(lstat(`${databasePath(root)}-shm`), { code: "ENOENT" });
  const beforeModes = await snapshot(root);
  for (const [file, mode] of [...beforeModes].reverse()) await chmod(path.join(root, file), (Number(mode) & 0o170000) === 0o040000 ? 0o555 : 0o444);
  let result;
  try {
    result = await unchanged(root, () => withReadOnlyQmdGeneration(root, () => runReadOnlyQmd(root, args)));
    assert.deepEqual(JSON.parse(result.stdout), expected);
    await unchanged(root, async () => {
      const rich = await searchMemory(root, "dispatch approval", 5, { readOnly: true });
      assert.equal(rich.results.length, 3);
      assert.ok(rich.retrieval.warnings.includes("read_only_index"));
      const compact = await compactSearchMemory(root, "dispatch approval", 5, { readOnly: true, maxBytes: 2048 });
      assert.ok(compact.passages.length > 0);
      const temporal = { from: "2020-01-01", to: "2020-01-01" };
      for (const query of ["dispatch -approval", '"requires approval"']) {
        assert.deepEqual((await searchMemory(root, query, 5, { readOnly: true, temporal })).results, [], query);
        assert.deepEqual((await compactSearchMemory(root, query, 5, { readOnly: true, temporal })).passages, [], query);
      }
      assert.ok(Buffer.byteLength(JSON.stringify(compact) + "\n") <= 2048);
    });
    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      await unchanged(root, () => assert.rejects(searchMemory(root, "dispatch approval", 5), /EACCES|permission|unavailable/i));
    }
    // Direct native proof: mode=ro is enforced by SQLite, not a query convention.
    const uri = pathToFileURL(databasePath(root)); uri.search = "?mode=ro&immutable=1";
    const ro = new Database(uri.href, { readonly: true, fileMustExist: true });
    try {
      assert.equal(ro.readonly, true);
      assert.throws(() => ro.exec("UPDATE jb_generation SET manifest = manifest"), { code: "SQLITE_READONLY" });
    } finally { ro.close(); }
    await assert.rejects(lstat(`${databasePath(root)}-wal`), { code: "ENOENT" });
    await assert.rejects(lstat(`${databasePath(root)}-shm`), { code: "ENOENT" });
  } finally {
    for (const [file, mode] of beforeModes) await chmod(path.join(root, file), Number(mode) & 0o777);
  }
  const writer = new Database(databasePath(root));
  try {
    writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE jb_readonly_wal_evidence(value TEXT); INSERT INTO jb_readonly_wal_evidence VALUES ('committed')");
    assert.equal(writer.prepare("SELECT value FROM jb_readonly_wal_evidence").get().value, "committed");
    assert.ok((await lstat(`${databasePath(root)}-wal`)).size > 0);
    await unchanged(root, () => assert.rejects(withReadOnlyQmdGeneration(root, () => runReadOnlyQmd(root, args)), { code: "read_only_wal" }));
  } finally { writer.close(); }
  await unchanged(root, () => runReadOnlyQmd(root, ["search", "dispatch approval", "--json", "-n", "2", "-c", "jumpybrain-dreams"]));
  const dbBytes = await readFile(databasePath(root));
  try {
    await writeFile(databasePath(root), "physically corrupt SQLite fixture");
    await unchanged(root, () => assert.rejects(searchMemory(root, "dispatch approval", 5, { readOnly: true }), { code: "read_only_invalid" }));
  } finally { await writeFile(databasePath(root), dbBytes); }
});

test("real lexical diagnosis: paraphrase candidate absence, strong distractor, shallow human note and imported evidence", {
  skip: !process.env.JUMPYBRAIN_TEST_QMD_BIN && "Set JUMPYBRAIN_TEST_QMD_BIN to a provisioned @tobilu/qmd@2.8.3 binary",
}, async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jb-diagnosis-real-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = process.env.JUMPYBRAIN_TEST_QMD_BIN;
  t.after(() => { if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous; });
  const root = path.join(temp, "memory");
  await mkdir(path.join(root, "notes"), { recursive: true });
  const put = (file, metadata, body) => writeFile(path.join(root, "notes", file), `---\n${metadata}\n---\n${body}\n`);
  await put("clinic.md", "title: Clinic note", "The cardiologist prescribed daily aerobic exercise to strengthen cardiac health and lower hypertension.");
  await put("human.md", "title: Harbor minutes\ntype: note\ncreator_kind: human", "Harbor dispatch approval: we decided to postpone dispatch until the owner signs. This is conditional, not production approval. The ceremony is on 18 November; the year was not specified.");
  await put("imported.md", "title: Harbor history\ntype: note\ndate: 2020-02-29\ncreated_at: 2026-11-01\nupdated_at: 2026-11-02", "Harbor dispatch approval was provisional in this historical record.");
  await indexMemory(root, { indexing: { mode: "lexical" } });
  const query = "physician recommends workouts for high blood pressure";
  await unchanged(root, async () => {
    const empty = await searchMemory(root, query, 5, { readOnly: true });
    assert.deepEqual(empty.results, [], "a paraphrase with no lexical overlap is absent before packet packing");
    const compact = await compactSearchMemory(root, query, 5, { readOnly: true });
    assert.equal(compact.passages.length, 0);
    assert.equal(compact.omitted.results, 0, "no candidate was lost to the output budget");
    for (const depth of ["shallow", "normal", "deep"]) {
      const result = await searchMemory(root, "harbor dispatch approval", 5, { readOnly: true, depth });
      const note = result.results.find(row => row.provenance.file === "notes/human.md");
      assert.ok(note, depth);
      assert.equal(note.provenance.metadata.creator_kind, "human");
      assert.match(note.snippet, /conditional, not production approval/);
      assert.match(note.snippet, /year was not specified/);
      assert.equal(note.scoreBreakdown.memoryStrength, 0);
    }
  });
  await put("distractor.md", "title: Search lesson", `The phrase "${query}" is a keyboard exercise; this note provides no clinical recommendation.`);
  await indexMemory(root);
  const { doctorReport } = await import("../dist/cli/doctor.js");
  const { createLocalMemoryTransport } = await import("../dist/cli/local-transport.js");
  const { parseArgs } = await import("../dist/cli/args.js");
  const { startJumpyBrainHttpServer } = await import("../dist/server/index.js");
  const { createRemoteMemoryTransport } = await import("../dist/adapters/http-client/index.js");
  const server = await startJumpyBrainHttpServer({ root, apiKeys: ["fictional-diagnosis"], port: 0, autoIndex: false,
    logger: { log() {}, info() {}, warn() {}, error() {} } });
  t.after(() => server.close());
  const remote = createRemoteMemoryTransport({ url: server.url, apiKey: "fictional-diagnosis" });
  await unchanged(root, async () => {
    const distractor = await searchMemory(root, query, 5, { readOnly: true });
    assert.deepEqual(distractor.results.map(row => row.provenance.file), ["notes/distractor.md"]);
    assert.equal(distractor.results[0].scoreBreakdown.qmdScore, 1);
    assert.match(distractor.results[0].snippet, /no clinical recommendation/);
    const report = await doctorReport(parseArgs(["doctor", "--root", root, "--probe-query", query]), createLocalMemoryTransport());
    assert.equal(report.retrievalProbe.status, "passed", "execution success says nothing about semantic relevance");
    assert.deepEqual(report.memoryRoot.readiness, { freshness: "fresh", modes: ["lexical"], embedding: "disabled" });
    assert.doesNotMatch(JSON.stringify(report), /clinical recommendation|Search lesson|physician recommends/);
    assert.deepEqual((await remote.memoryRootStatus()).readiness, report.memoryRoot.readiness);
    const options = { readOnly: true, temporal: { from: "2020-02-29", to: "2020-02-29" } };
    const local = await compactSearchMemory(root, "harbor dispatch approval", 5, options);
    assert.equal(local.passages[0].date.value, "2026-11-01");
    assert.equal(local.passages[0].evidenceDate.value, "2020-02-29");
    assert.deepEqual(await remote.compactSearchMemory("harbor dispatch approval", 5, options), JSON.parse(JSON.stringify(local)));
    assert.deepEqual((await remote.searchMemory(query, 5, { readOnly: true })).results, JSON.parse(JSON.stringify(distractor.results)));
  });
});
