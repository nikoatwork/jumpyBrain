import assert from "node:assert/strict";
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateLogseq } from "../dist/runtime/index.js";
import { LOGSEQ_MIGRATION_MANIFEST, parseLogseqEnvelope } from "../dist/core/migration/index.js";

async function fixture(t) {
  const base = await mkdtemp(path.join(await realpath(tmpdir()), "jumpy-logseq-safety-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = path.join(base, "source"), root = path.join(base, "memory");
  await mkdir(path.join(source, "pages"), { recursive: true });
  await writeFile(path.join(source, "pages", "Example.md"), "synthetic body");
  return { base, source, root };
}

test("migration rejects redirected and malformed index roots before any mutation", async t => {
  const { source, root } = await fixture(t);
  await migrateLogseq(source, root, { apply: true });
  const configPath = path.join(root, "jumpybrain.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const manifestBefore = await readFile(path.join(root, LOGSEQ_MIGRATION_MANIFEST));
  for (const indexRoot of ["../source", source, false, null, [], {}]) {
    const bytes = JSON.stringify({ ...config, indexRoot });
    await writeFile(configPath, bytes);
    await assert.rejects(migrateLogseq(source, root, { apply: true }), /indexRoot/);
    assert.equal(await readFile(configPath, "utf8"), bytes);
    assert.deepEqual(await readFile(path.join(root, LOGSEQ_MIGRATION_MANIFEST)), manifestBefore);
  }
  await writeFile(configPath, JSON.stringify({ ...config, indexRoot: "." }));
  assert.equal((await migrateLogseq(source, root, { apply: true })).unchanged, 1);
});

test("migration validates hostile ownership paths, duplicate IDs and checksums before deletion", async t => {
  const { source, root } = await fixture(t);
  await migrateLogseq(source, root, { apply: true });
  const manifestPath = path.join(root, LOGSEQ_MIGRATION_MANIFEST);
  const original = JSON.parse(await readFile(manifestPath, "utf8"));
  const outputPath = path.join(root, "notes/Example.md"), output = await readFile(outputPath);
  await unlink(path.join(source, "pages/Example.md"));
  const variants = [
    entry => ({ ...entry, outputPath: "../outside.md" }),
    entry => ({ ...entry, sourcePath: "pages/../../outside.md" }),
    entry => ({ ...entry, outputPath: "preferences/Example.md" }),
    entry => ({ ...entry, sourceHash: "not-a-hash" }),
    entry => ({ ...entry, id: "not-an-id" }),
  ];
  for (const transform of variants) {
    await writeFile(manifestPath, JSON.stringify({ ...original, entries: original.entries.map(transform) }));
    await assert.rejects(migrateLogseq(source, root, { apply: true }), /manifest/);
    assert.deepEqual(await readFile(outputPath), output);
  }
  await writeFile(manifestPath, JSON.stringify({ ...original, entries: [...original.entries, ...original.entries] }));
  await assert.rejects(migrateLogseq(source, root, { apply: true }), /manifest/);
  assert.deepEqual(await readFile(outputPath), output);
});

test("migration rejects destination links, ancestor aliases, hardlinks and manifest links", async t => {
  const { base, source, root } = await fixture(t);
  const outside = path.join(base, "outside");
  await mkdir(outside);
  await mkdir(root);
  await symlink(outside, path.join(root, "notes"));
  await assert.rejects(migrateLogseq(source, root, { apply: true }), /Symlink/);
  await unlink(path.join(root, "notes"));
  const alias = path.join(base, "alias");
  await symlink(root, alias);
  await assert.rejects(migrateLogseq(source, path.join(alias, "new")), /Symlink/);
  await mkdir(path.join(root, "notes"));
  const external = path.join(outside, "external.md");
  await writeFile(external, "unrelated external content");
  await link(external, path.join(root, "notes/Example.md"));
  await assert.rejects(migrateLogseq(source, root, { apply: true }), /hardlinked/);
  assert.equal(await readFile(external, "utf8"), "unrelated external content");
  await unlink(path.join(root, "notes/Example.md"));
  await symlink(external, path.join(root, LOGSEQ_MIGRATION_MANIFEST));
  await assert.rejects(migrateLogseq(source, root, { apply: true }), /Symlink/);
  await assert.rejects(lstat(path.join(root, "jumpybrain.json")), { code: "ENOENT" });
});

test("migration supports POSIX colon filenames without decoding them into destination paths", { skip: process.platform === "win32" }, async t => {
  const { source, root } = await fixture(t);
  await writeFile(path.join(source, "pages", "Topic: detail.md"), "- body\r\n");
  const result = await migrateLogseq(source, root, { apply: true });
  assert.equal(result.created, 2);
  assert.equal(parseLogseqEnvelope(await readFile(path.join(root, "notes/Topic: detail.md"))).body.toString(), "- body\r\n");
  assert.equal((await migrateLogseq(source, root, { apply: true })).unchanged, 2);
});
