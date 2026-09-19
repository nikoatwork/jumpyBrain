import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, realpath, symlink, lstat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrateLogseq, migrateLogseqWithHooks } from "../dist/app/migration/index.js";
import { LOGSEQ_MIGRATION_MANIFEST, hashMigrationBytes, mapLogseqPath, parseLogseqEnvelope, parseLogseqManifest } from "../dist/core/migration/index.js";

async function fixture(t) {
  const base = await mkdtemp(path.join(await realpath(tmpdir()), "jumpy-logseq-policy-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = path.join(base, "source"), root = path.join(base, "memory");
  await mkdir(path.join(source, "pages"), { recursive: true });
  await mkdir(path.join(source, "journals"));
  return { base, source, root };
}
async function put(root, relative, content) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
async function tree(root) {
  const result = {};
  async function visit(dir, relative) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { result[`${rel}/`] = "directory"; await visit(path.join(dir, entry.name), rel); }
      else result[rel] = (await readFile(path.join(dir, entry.name))).toString("base64");
    }
  }
  try { await visit(root, ""); } catch (error) { if (error.code !== "ENOENT") throw error; }
  return result;
}

test("migration: allowlist, dry-run, byte envelopes, metadata and no source writes", async t => {
  const { source, root } = await fixture(t);
  const bodies = [Buffer.from("- first\r\n\tproperty:: value\r\n- TODO [[Missing]] ![asset](../assets/private.png)"), Buffer.from("---\ntitle: source yaml\n---\nbody\n"), Buffer.from(""), Buffer.from([0xff, 0x00, 0x0d, 0x0a]), Buffer.from("Unicode 🐐\t  \n\n")];
  for (let index = 0; index < bodies.length; index++) await put(source, `pages/nested/Doc${index}.md`, bodies[index]);
  await put(source, "journals/2024_02_29.md", "- id:: 00000000-0000-0000-0000-000000000000\n");
  await put(source, "assets/private.png", "omitted-private-bytes");
  await put(source, "logseq/bak/old.md", "old private backup");
  await put(source, "logseq/config.edn", '{:pages-directory "pages" :journals-directory "journals"}');
  await put(source, "AGENTS.md", "not imported");
  await put(source, "pages/.support/hidden.md", "not imported");
  await put(source, "pages/non-markdown.txt", "not imported");
  const before = await tree(source);
  const plan = await migrateLogseq(source, root);
  assert.equal(plan.dryRun, true); assert.equal(plan.applied, false);
  assert.equal(plan.sourceDocuments, 6); assert.equal(plan.pages, 5); assert.equal(plan.journals, 1); assert.equal(plan.created, 6);
  await assert.rejects(lstat(root), { code: "ENOENT" });
  assert.match(plan.warnings.join("\n"), /assets=1, config\/support=1, backups=1/);
  assert.match(plan.warnings.join("\n"), /unresolved wiki links=1, omitted local asset references=1/);
  assert.doesNotMatch(JSON.stringify(plan), /omitted-private-bytes|source yaml|property::|old private backup/);
  const result = await migrateLogseq(source, root, { apply: true });
  assert.equal(result.applied, true); assert.equal(result.indexed, false);
  const manifest = parseLogseqManifest(await readFile(path.join(root, LOGSEQ_MIGRATION_MANIFEST)));
  assert.equal(new Set(result.entries.map(entry => entry.id)).size, 6);
  for (const entry of result.entries) {
    const output = await readFile(path.join(root, entry.outputPath));
    const envelope = parseLogseqEnvelope(output);
    assert.deepEqual(envelope.body, await readFile(path.join(source, entry.sourcePath)));
    assert.equal(entry.sourceHash, hashMigrationBytes(envelope.body));
    assert.equal(entry.outputHash, hashMigrationBytes(output));
    assert.equal(envelope.metadata.id, entry.id);
    assert.match(entry.id, /^mem_[a-f0-9-]{36}$/);
    assert.equal(envelope.metadata.source_path, entry.sourcePath);
    assert.equal(envelope.metadata.confidence, undefined);
  }
  assert.equal(manifest.entries.find(entry => entry.type === "session").date, "2024-02-29");
  assert.deepEqual(await tree(source), before);
});

test("migration: title decoding is bounded and journal dates are real", () => {
  assert.equal(mapLogseqPath("pages/Some%20Title___Child.md").title, "Some Title/Child");
  assert.equal(mapLogseqPath("pages/%2520.md").title, "%20");
  assert.equal(mapLogseqPath("pages/%ZZ.md").title, "%ZZ");
  assert.equal(mapLogseqPath("journals/sub/2024_02_29.md").date, "2024-02-29");
  assert.equal(mapLogseqPath("journals/2023_02_29.md").date, undefined);
  for (const name of ["pages/../evil.md", "pages/a\\b.md", "pages/.hidden.md"]) assert.throws(() => mapLogseqPath(name));
});

test("migration: stable reruns, source-wins conflicts and tracked removal", async t => {
  const { source, root } = await fixture(t);
  await put(source, "pages/A.md", "original\r\n");
  await migrateLogseq(source, root, { apply: true });
  const before = await tree(root);
  const original = parseLogseqEnvelope(await readFile(path.join(root, "notes/A.md"))).metadata;
  const noop = await migrateLogseq(source, root, { apply: true });
  assert.equal(noop.unchanged, 1); assert.equal(noop.overwritten, 0);
  assert.deepEqual(await tree(root), before);
  await put(root, "notes/unrelated.md", "unrelated");
  const imported = await readFile(path.join(root, "notes/A.md"));
  await writeFile(path.join(root, "notes/A.md"), Buffer.concat([imported, Buffer.from("local edits")]));
  await put(source, "pages/A.md", "source wins");
  await assert.rejects(migrateLogseq(source, root, { apply: true, failOnConflict: true }), /conflict/);
  const changed = await migrateLogseq(source, root, { apply: true });
  assert.equal(changed.overwritten, 1); assert.equal(changed.entries[0].conflict, true);
  const current = parseLogseqEnvelope(await readFile(path.join(root, "notes/A.md")));
  assert.equal(current.body.toString(), "source wins");
  assert.equal(current.metadata.id, original.id); assert.equal(current.metadata.created_at, original.created_at);
  assert.ok(current.metadata.updated_at > original.updated_at);
  await unlink(path.join(source, "pages/A.md"));
  await put(source, "pages/Renamed.md", "source wins");
  const renamed = await migrateLogseq(source, root, { apply: true });
  assert.equal(renamed.created, 1); assert.equal(renamed.deleted, 1);
  await assert.rejects(lstat(path.join(root, "notes/A.md")), { code: "ENOENT" });
  assert.equal(await readFile(path.join(root, "notes/unrelated.md"), "utf8"), "unrelated");
});

test("migration: nonempty manual root and direct mapped conflicts preserve valid identity", async t => {
  const { source, root } = await fixture(t);
  const id = "mem_00000000-0000-0000-0000-000000000001";
  await put(source, "pages/A.md", "imported");
  await put(root, "notes/A.md", `---\nid: ${id}\ncreated_at: 2020-01-01T00:00:00.000Z\n---\nold`);
  await put(root, "preferences/keep.md", "keep");
  await put(root, ".gitignore", "custom\r\n");
  const result = await migrateLogseq(source, root, { apply: true });
  assert.equal(result.overwritten, 1); assert.equal(result.entries[0].id, id);
  assert.equal(result.entries[0].createdAt, "2020-01-01T00:00:00.000Z");
  assert.match(await readFile(path.join(root, ".gitignore"), "utf8"), /^custom\r\n/);
  assert.equal(await readFile(path.join(root, "preferences/keep.md"), "utf8"), "keep");
});

test("migration: deletion identity mismatch and corrupt manifest fail before writes", async t => {
  const { source, root } = await fixture(t);
  await put(source, "pages/A.md", "source");
  await migrateLogseq(source, root, { apply: true });
  await unlink(path.join(source, "pages/A.md"));
  await put(root, "notes/A.md", "unrelated replacement");
  const before = await tree(root);
  await assert.rejects(migrateLogseq(source, root, { apply: true }), /identity/);
  assert.deepEqual(await tree(root), before);
  await put(root, LOGSEQ_MIGRATION_MANIFEST, '{"private":"never echo this raw body"');
  await assert.rejects(migrateLogseq(source, root), error => /manifest/.test(error.message) && !/never echo/.test(error.message));
});

for (const step of ["before-init", "after-init", "after-write", "after-manifest"]) {
  test(`migration: first initialization rolls back completely after ${step}`, async t => {
    const { base, source } = await fixture(t);
    const root = path.join(base, "new-parent", "deeper", "memory");
    await put(source, "pages/nested/A.md", "source");
    await assert.rejects(migrateLogseqWithHooks(source, root, { apply: true }, { onStep(actual) { if (actual === step) throw new Error("private injection content"); } }), error => /rolled back/.test(error.message) && !/private injection/.test(error.message));
    await assert.rejects(lstat(path.join(base, "new-parent")), { code: "ENOENT" });
  });
}
for (const step of ["after-write", "after-delete", "after-manifest"]) {
  test(`migration: existing root rollback restores overwrite/delete/manifest after ${step}`, async t => {
    const { source, root } = await fixture(t);
    await put(source, "pages/A.md", "old A"); await put(source, "pages/B.md", "old B");
    await migrateLogseq(source, root, { apply: true });
    await put(root, "notes/unrelated.md", "keep");
    const before = await tree(root);
    await put(source, "pages/A.md", "new A"); await unlink(path.join(source, "pages/B.md"));
    await put(source, "pages/new-dir/C.md", "new C");
    await assert.rejects(migrateLogseqWithHooks(source, root, { apply: true }, { onStep(actual) { if (actual === step) throw new Error("failure"); } }), /rolled back/);
    assert.deepEqual(await tree(root), before);
    await assert.rejects(lstat(`${root}.logseq-migration-transaction`), { code: "ENOENT" });
  });
}

test("migration: manual-root setup rollback restores ignore/config and created directories", async t => {
  const { source, root } = await fixture(t);
  await put(source, "pages/A.md", "source"); await put(root, ".gitignore", "custom"); await put(root, "other.txt", "keep");
  const before = await tree(root);
  await assert.rejects(migrateLogseqWithHooks(source, root, { apply: true }, { onStep(step) { if (step === "after-init") throw new Error("fail"); } }), /rolled back/);
  assert.deepEqual(await tree(root), before);
});

test("migration: concurrent future-target edit is preserved, earlier write rolled back", async t => {
  const { source, root } = await fixture(t);
  await put(source, "pages/A.md", "old A"); await put(source, "pages/B.md", "old B");
  await migrateLogseq(source, root, { apply: true });
  const originalA = await readFile(path.join(root, "notes/A.md"));
  await put(source, "pages/A.md", "new A"); await put(source, "pages/B.md", "new B");
  await assert.rejects(migrateLogseqWithHooks(source, root, { apply: true }, { async onStep(step, detail) {
    if (step === "after-write" && detail.writes === 1) await put(root, "notes/B.md", "concurrent unrelated edit");
  } }), /rolled back/);
  assert.deepEqual(await readFile(path.join(root, "notes/A.md")), originalA);
  assert.equal(await readFile(path.join(root, "notes/B.md"), "utf8"), "concurrent unrelated edit");
});

test("migration: concurrent edit to installed target retains recovery data and fails closed", async t => {
  const { source, root } = await fixture(t);
  await put(source, "pages/A.md", "original"); await migrateLogseq(source, root, { apply: true });
  await put(source, "pages/A.md", "new");
  await assert.rejects(migrateLogseqWithHooks(source, root, { apply: true }, { async onStep(step) {
    if (step === "after-write") { await put(root, "notes/A.md", "concurrent edit"); throw new Error("fail"); }
  } }), /recovery data was retained/);
  assert.equal(await readFile(path.join(root, "notes/A.md"), "utf8"), "concurrent edit");
  await assert.rejects(migrateLogseq(source, root), /retained.*transaction/);
  assert.doesNotMatch(await readFile(`${root}.logseq-migration-transaction/receipt.json`, "utf8"), /concurrent edit|original/);
});

test("migration: overlap, symlinks, normalized collisions, DB and custom configuration reject", async t => {
  const { base, source, root } = await fixture(t);
  await put(source, "pages/A.md", "source");
  await assert.rejects(migrateLogseq(source, source), /overlap/);
  await assert.rejects(migrateLogseq(source, path.join(source, "output")), /overlap/);
  await assert.rejects(migrateLogseq(source, base), /overlap/);
  const alias = path.join(base, "alias"); await symlink(source, alias);
  await assert.rejects(migrateLogseq(alias, root), /Symlink/);
  await symlink(path.join(source, "pages/A.md"), path.join(source, "pages/link.md"));
  await assert.rejects(migrateLogseq(source, root), /Symlink/);
  await unlink(path.join(source, "pages/link.md"));
  await put(source, "pages/a.md", "case collision");
  // This fixture intentionally requires a case-sensitive filesystem; aliasing files on insensitive FS is detected at path validation too.
  if ((await readdir(path.join(source, "pages"))).includes("a.md") && (await readdir(path.join(source, "pages"))).includes("A.md")) await assert.rejects(migrateLogseq(source, root), /collision/);
  await unlink(path.join(source, "pages/a.md"));
  await put(source, "logseq/config.edn", '{:pages-directory "private-pages"}');
  await assert.rejects(migrateLogseq(source, root), error => /Custom/.test(error.message) && !/private-pages/.test(error.message));
  await unlink(path.join(source, "logseq/config.edn"));
  await put(source, "db.sqlite", "private database");
  await assert.rejects(migrateLogseq(source, root), /database/);
  await unlink(path.join(source, "db.sqlite"));
  await put(root, "jumpybrain.json", '{"schemaVersion":999,"private":"secret"}');
  await assert.rejects(migrateLogseq(source, root), error => /Incompatible/.test(error.message) && !/secret/.test(error.message));
});
