import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hashMemoryDocumentContent, replaceCanonicalMemoryDocumentById } from "../dist/core/canonical/markdown-store.js";
import { writeUniqueMarkdownFile } from "../dist/app/writing/filesystem.js";
import { MemoryDocumentPreconditionError, updateMemoryDocument } from "../dist/app/local-memory/index.js";

const id = "mem_61000000-0000-4000-8000-000000000001";
const original = `---\nid: ${id}\ntype: note\ntitle: Original\n---\nOriginal bytes.\n`;
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "jumpybrain-publication-")));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "notes");
  await fs.mkdir(dir);
  const file = path.join(dir, "original.md");
  await fs.writeFile(file, original);
  return { root, dir, file, ifMatch: hashMemoryDocumentContent(original) };
}

// Exercise real filesystem operations with a deterministic interleaving after
// staged bytes have been written/fsynced, rather than timing-dependent polling.
function atStageSync(t, callback) {
  const open = fs.open;
  let fired = false;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await open(...args);
    if (String(args[0]).endsWith(".tmp") && !fired) {
      fired = true;
      const sync = handle.sync.bind(handle);
      handle.sync = async () => { await sync(); await callback(String(args[0])); };
    }
    return handle;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}
async function assertClean(dir, expected = ["original.md"]) {
  assert.deepEqual((await fs.readdir(dir)).sort(), expected.sort());
}

test("core rejects stale ifMatch before staging", async t => {
  const f = await fixture(t);
  await assert.rejects(replaceCanonicalMemoryDocumentById(f.root, id, "Changed", { ifMatch: "sha256:stale" }), error => {
    assert.equal(error.code, "precondition_failed");
    assert.deepEqual(error.details, { id, file: "notes/original.md", currentContentHash: f.ifMatch });
    return true;
  });
  assert.equal(await fs.readFile(f.file, "utf8"), original);
  await assertClean(f.dir);
});

test("app publication rechecks a revision changed during staging and retains public error semantics", async t => {
  const f = await fixture(t);
  const concurrent = original.replace("Original bytes.", "External revision.");
  atStageSync(t, () => fs.writeFile(f.file, concurrent));
  await assert.rejects(updateMemoryDocument(f.root, id, "Must not win", { ifMatch: f.ifMatch }), error => {
    assert.ok(error instanceof MemoryDocumentPreconditionError);
    assert.equal(error.code, "precondition_failed");
    assert.equal(error.message, "Document content hash is stale. Re-read the document before retrying the update.");
    assert.equal(error.details.currentContentHash, hashMemoryDocumentContent(concurrent));
    return true;
  });
  assert.equal(await fs.readFile(f.file, "utf8"), concurrent);
  await assertClean(f.dir);
});

for (const change of ["identical-inode-replacement", "symlink", "hardlink", "directory-symlink"]) {
  test(`canonical publication rejects ${change} introduced during staging`, async t => {
    const f = await fixture(t);
    const other = path.join(f.root, "other.md");
    await fs.writeFile(other, original);
    atStageSync(t, async () => {
      if (change === "identical-inode-replacement") {
        await fs.rename(other, f.file);
      } else if (change === "symlink") {
        await fs.unlink(f.file);
        await fs.symlink(other, f.file);
      } else if (change === "hardlink") {
        await fs.link(f.file, path.join(f.root, "alias.md"));
      } else {
        const moved = path.join(f.root, "moved");
        await fs.rename(f.dir, moved);
        await fs.symlink(moved, f.dir);
      }
    });
    await assert.rejects(replaceCanonicalMemoryDocumentById(f.root, id, "Must not win", { ifMatch: f.ifMatch }), { code: "precondition_failed" });
    assert.equal(await fs.readFile(f.file, "utf8"), original);
    await assertClean(f.dir);
  });
}

test("cooperating updates sharing one token have exactly one winner", async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) =>
    updateMemoryDocument(f.root, id, `Revision ${i}`, { ifMatch: f.ifMatch })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  for (const result of results.filter(result => result.status === "rejected")) assert.equal(result.reason.code, "precondition_failed");
  const winner = results.find(result => result.status === "fulfilled").value;
  assert.equal(hashMemoryDocumentContent(await fs.readFile(f.file)), winner.newContentHash);
  await assertClean(f.dir);
});

test("publication lock excludes a separate cooperating process between validation and rename", async t => {
  const f = await fixture(t);
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (...args) => {
    if (args[1] === f.file) {
      const moduleUrl = new URL("../dist/core/canonical/markdown-store.js", import.meta.url).href;
      const script = `import { replaceCanonicalMemoryDocumentById } from ${JSON.stringify(moduleUrl)};
        try { await replaceCanonicalMemoryDocumentById(${JSON.stringify(f.root)}, ${JSON.stringify(id)}, "Child revision", { ifMatch: ${JSON.stringify(f.ifMatch)} }); process.exitCode = 1; }
        catch (error) { console.log(error.code); }`;
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10000 });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stdout.trim(), "precondition_failed");
    }
    return rename(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await replaceCanonicalMemoryDocumentById(f.root, id, "Parent revision", { ifMatch: f.ifMatch });
  assert.match(await fs.readFile(f.file, "utf8"), /Parent revision/);
  await assertClean(f.dir);
});

test("occupied cooperating publication lock fails closed without deleting another owner's lock", async t => {
  const f = await fixture(t);
  const lock = path.join(f.dir, ".original.md.replace.lock");
  await fs.writeFile(lock, "owned by another process");
  await assert.rejects(replaceCanonicalMemoryDocumentById(f.root, id, "Must not win", { ifMatch: f.ifMatch }), { code: "precondition_failed" });
  assert.equal(await fs.readFile(lock, "utf8"), "owned by another process");
  assert.equal(await fs.readFile(f.file, "utf8"), original);
  await assertClean(f.dir, ["original.md", ".original.md.replace.lock"]);
});

test("creation publishes only complete staged bytes and never overwrites a late collision", async t => {
  const f = await fixture(t);
  const target = path.join(f.dir, "new.md");
  const content = "Complete Markdown\n".repeat(10000);
  atStageSync(t, async temporary => {
    await assert.rejects(fs.lstat(target), { code: "ENOENT" });
    assert.equal(await fs.readFile(temporary, "utf8"), content);
    await fs.writeFile(target, "Concurrent creation");
  });
  const written = await writeUniqueMarkdownFile(f.dir, "new", content);
  assert.notEqual(written, target);
  assert.match(path.basename(written), /^new-\d+-1\.md$/);
  assert.equal(await fs.readFile(written, "utf8"), content);
  assert.equal((await fs.lstat(written)).nlink, 1);
  assert.equal(await fs.readFile(target, "utf8"), "Concurrent creation");
  await assertClean(f.dir, ["original.md", "new.md", path.basename(written)]);
});

test("creation retries exactly the original 20 suffix candidates and cleans exhausted staging", async t => {
  const f = await fixture(t);
  t.mock.method(Date, "now", () => 1234);
  const names = ["new.md", ...Array.from({ length: 20 }, (_, i) => `new-1234-${i + 1}.md`)];
  await Promise.all(names.map(name => fs.writeFile(path.join(f.dir, name), name)));
  await assert.rejects(writeUniqueMarkdownFile(f.dir, "new", "Must not replace"), { code: "EEXIST" });
  for (const name of names) assert.equal(await fs.readFile(path.join(f.dir, name), "utf8"), name);
  await assertClean(f.dir, ["original.md", ...names]);
});

test("creation treats symlink filenames as collisions but rejects symlink directories and ancestors", async t => {
  const f = await fixture(t);
  const linked = path.join(f.dir, "new.md");
  await fs.symlink(f.file, linked);
  const result = await writeUniqueMarkdownFile(f.dir, "new", "New bytes");
  assert.notEqual(result, linked);
  assert.equal((await fs.lstat(linked)).isSymbolicLink(), true);
  assert.equal(await fs.readFile(f.file, "utf8"), original);
  const alias = path.join(f.root, "alias");
  await fs.symlink(f.dir, alias);
  await assert.rejects(writeUniqueMarkdownFile(alias, "blocked", "Never written"), /Unsafe Markdown destination directory/);
  await assert.rejects(writeUniqueMarkdownFile(path.join(alias, "nested"), "blocked", "Never written"), /Unsafe Markdown destination directory/);
  await assert.rejects(fs.lstat(path.join(f.dir, "nested")), { code: "ENOENT" });
});

test("creation rechecks directory identity after asynchronous staging", async t => {
  const f = await fixture(t);
  atStageSync(t, async () => {
    await fs.rename(f.dir, path.join(f.root, "moved"));
    await fs.symlink(path.join(f.root, "moved"), f.dir);
  });
  await assert.rejects(writeUniqueMarkdownFile(f.dir, "new", "Never published"), /Unsafe Markdown destination directory/);
  await assertClean(f.dir);
});

for (const writer of ["create", "replace"]) {
  test(`${writer} cleans staging on fsync failure without visible partial Markdown`, async t => {
    const f = await fixture(t);
    atStageSync(t, async () => { throw Object.assign(new Error("Injected fsync failure"), { code: "EIO" }); });
    const action = writer === "create" ? writeUniqueMarkdownFile(f.dir, "new", "Never published") :
      replaceCanonicalMemoryDocumentById(f.root, id, "Never published", { ifMatch: f.ifMatch });
    await assert.rejects(action, { code: "EIO" });
    assert.equal(await fs.readFile(f.file, "utf8"), original);
    await assertClean(f.dir);
  });
}

test("rename I/O errors propagate, clean the owned lock/staging, and release the update queue", async t => {
  const f = await fixture(t);
  const rename = t.mock.method(fs, "rename", async () => { throw Object.assign(new Error("Denied rename"), { code: "EACCES" }); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(updateMemoryDocument(f.root, id, "Failed revision", { ifMatch: f.ifMatch }), { code: "EACCES" });
  assert.equal(await fs.readFile(f.file, "utf8"), original);
  await assertClean(f.dir);
  rename.mock.restore();
  syncBuiltinESMExports();
  await updateMemoryDocument(f.root, id, "Successful retry", { ifMatch: f.ifMatch });
  assert.match(await fs.readFile(f.file, "utf8"), /Successful retry/);
  await assertClean(f.dir);
});

test("unsupported exclusive hardlinks fail closed, without partial-file fallback", async t => {
  const f = await fixture(t);
  t.mock.method(fs, "link", async () => { throw Object.assign(new Error("Not supported"), { code: "ENOTSUP" }); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(writeUniqueMarkdownFile(f.dir, "new", "Never published"), { code: "ENOTSUP" });
  await assertClean(f.dir);
});
