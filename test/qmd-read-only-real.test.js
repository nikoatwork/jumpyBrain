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
