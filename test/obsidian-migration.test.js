import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, link, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateObsidian, migrateObsidianWithHooks, migrateLogseq } from "../dist/app/migration/index.js";
import { analyzeObsidianReferences, hashMigrationBytes, mapObsidianPath, parseObsidianManifest, parseMigrationEnvelope, OBSIDIAN_MIGRATION_MANIFEST, LOGSEQ_MIGRATION_MANIFEST } from "../dist/core/migration/index.js";
import { discoverMarkdownIndexInputs, readCanonicalMarkdownIndexInput, listMarkdownFiles, listCanonicalMemoryMarkdownFiles, readCanonicalMemoryDocumentById, resolveCanonicalMemoryDocumentByTitle } from "../dist/core/canonical/index.js";
import { getDreamWindow } from "../dist/app/dream/index.js";

async function put(root, file, body = "Synthetic private body\r\n- Intentional list\r\n- [ ] Task") {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), body);
}
async function fixture(t) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "jumpy-obsidian-")));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = path.join(base, "vault with 'quote"), root = path.join(base, "memory");
  await mkdir(source);
  return { base, source, root };
}
async function tree(root) {
  if (!existsSync(root)) return null;
  const entries = [];
  for (const file of (await readdir(root, { recursive: true })).sort()) {
    const state = await stat(path.join(root, file));
    entries.push([file, state.mode & 0o777, state.isFile() ? hashMigrationBytes(await readFile(path.join(root, file))) : null]);
  }
  return entries;
}

test("Obsidian preserves literal paths, all source bytes and protected YAML behind its own envelope", async t => {
  const { source, root } = await fixture(t);
  const names = ["Root.md", "nested/Root.MD", "spaces 日本語 🐐/Some%20Title___Child.md", "gold.md", "answer_session_ids.md", "build/logs/topic.md", "2020-02-29.md"];
  const bytes = Buffer.from('---\r\nid: source-id\r\ntype: page\r\ndream: true\r\nconfidence: high\r\nattention_at: 2099-01-01\r\naliases: [Alias]\r\ntags: [tag]\r\ndate: 2000-01-01\r\ncreated_at: 1900-01-01\r\n---\r\n# Prose\r\n- list\r\n- [ ] task\r\n> quote\r\n```js\r\nx()\r\n```\r\n^block');
  for (const name of names) await put(source, name, bytes);
  await put(source, "invalid-utf8.md", Buffer.from([255, 254, 13, 10, 0]));
  const before = await tree(source);
  const preview = await migrateObsidian(source, root);
  assert.equal(preview.created, names.length + 1); assert.equal(preview.dryRun, true); assert.equal(existsSync(root), false);
  const result = await migrateObsidian(source, root, { apply: true });
  assert.equal(result.notes, names.length + 1); assert.equal(result.indexed, false); assert.equal(result.pages, undefined);
  for (const entry of result.entries) {
    assert.equal(entry.outputPath, `notes/${entry.sourcePath}`);
    assert.equal(entry.title, entry.sourcePath.replace(/\.md$/i, ""));
    assert.equal(entry.type, "note"); assert.equal(entry.date, undefined);
    const output = await readFile(path.join(root, entry.outputPath));
    const { metadata, body } = parseMigrationEnvelope(output);
    assert.deepEqual(body, await readFile(path.join(source, entry.sourcePath)));
    assert.equal(metadata.source, "obsidian-migration"); assert.equal(metadata.id, entry.id);
    assert.equal(metadata.dream, undefined); assert.equal(metadata.confidence, undefined); assert.equal(metadata.attention_at, undefined);
    assert.equal(metadata.date, undefined); assert.notEqual(metadata.created_at, "1900-01-01");
    assert.equal(hashMigrationBytes(body), entry.sourceHash); assert.equal(entry.bodyHash, entry.sourceHash);
    assert.equal(hashMigrationBytes(output), entry.outputHash);
  }
  const manifestFile = path.join(root, result.manifest), manifest = await readFile(manifestFile), mtime = (await stat(manifestFile)).mtimeMs;
  assert.equal(parseObsidianManifest(manifest).version, 1);
  assert.equal((await migrateObsidian(source, root, { apply: true })).unchanged, names.length + 1);
  assert.deepEqual(await readFile(manifestFile), manifest); assert.equal((await stat(manifestFile)).mtimeMs, mtime);
  assert.deepEqual(await tree(source), before);
});

test("Obsidian discovery counts hidden support, non-Markdown and symlinks without reading bodies", async t => {
  const { source, root, base } = await fixture(t);
  await put(source, "Note.md");
  for (const name of [".obsidian/plugins/plugin/main.js", ".trash/deleted.md", ".git/config", ".hidden.md", "assets/large.png", "board.canvas", "table.base"]) { await put(source, name); await chmod(path.join(source, name), 0o000); }
  await put(base, "outside/Secret.md");
  await symlink(path.join(base, "outside"), path.join(source, "linked"));
  await symlink(path.join(base, "outside/Secret.md"), path.join(source, "linked.md"));
  const result = await migrateObsidian(source, root, { apply: true });
  assert.equal(result.notes, 1); assert.deepEqual(result.omissions, { hidden: 4, nonMarkdown: 3, symlinks: 2 });
  assert.doesNotMatch(JSON.stringify(result), /Synthetic private body|main\.js|Secret/);
  assert.deepEqual((await readdir(path.join(root, "notes"))), ["Note.md"]);
});

test("Obsidian references report distinctions without exposing targets or claiming parity", () => {
  const refs = analyzeObsidianReferences([
    { sourcePath: "Start.md", body: Buffer.from('[[Twin]] [[A/Twin#Plan|alias]] [[#^local]] [[Missing]] ![[A/Twin]] ![[asset.png]] [relative](A/Twin.md#^block) [root](/A/Twin.md) ![image](asset.png) [web](https://example.com)') },
    { sourcePath: "A/Twin.md", body: Buffer.alloc(0) }, { sourcePath: "B/Twin.md", body: Buffer.alloc(0) },
  ]);
  assert.equal(refs.ambiguousNoteTargets, 1); assert.equal(refs.unresolvedNoteTargets, 1);
  assert.equal(refs.aliases, 1); assert.equal(refs.headingReferences, 1); assert.equal(refs.blockReferences, 2);
  assert.equal(refs.noteEmbeds, 1); assert.equal(refs.assetEmbeds, 2); assert.equal(refs.omittedAssetReferences, 2);
  assert.equal(refs.vaultRootMarkdownLinks, 1);
});

test("Obsidian source-wins updates, removals, renames, conflicts, identity checks and missing outputs", async t => {
  const { source, root, base } = await fixture(t);
  await put(source, "Old.md"); await put(root, "notes/manual.md", "Manual unrelated note");
  const first = await migrateObsidian(source, root, { apply: true }); const entry = first.entries[0];
  const output = path.join(root, entry.outputPath), original = await readFile(output);
  await writeFile(output, Buffer.concat([original, Buffer.from("destination edit")]));
  await assert.rejects(migrateObsidian(source, root, { apply: true, failOnConflict: true }), /conflict/);
  const updated = await migrateObsidian(source, root, { apply: true });
  assert.equal(updated.overwritten, 1); assert.equal(updated.entries[0].id, entry.id); assert.equal(updated.entries[0].createdAt, entry.createdAt);
  await put(source, "Old.md", "changed source");
  assert.equal((await migrateObsidian(source, root, { apply: true })).overwritten, 1);
  await rm(output); const recreated = await migrateObsidian(source, root, { apply: true });
  assert.equal(recreated.created, 1); assert.equal(recreated.entries[0].id, entry.id);
  await rename(path.join(source, "Old.md"), path.join(source, "Renamed.md"));
  const renamed = await migrateObsidian(source, root, { apply: true });
  assert.equal(renamed.created, 1); assert.equal(renamed.deleted, 1); assert.notEqual(renamed.entries.find(e => e.action === "create").id, entry.id);
  assert.equal(existsSync(output), false); assert.equal(await readFile(path.join(root, "notes/manual.md"), "utf8"), "Manual unrelated note");
  await mkdir(path.join(base, "other-vault"));
  await assert.rejects(migrateObsidian(path.join(base, "other-vault"), root, { apply: true }), /different Obsidian vault/);
  const target = path.join(root, "notes/Renamed.md"); await writeFile(target, "no ID");
  await rm(path.join(source, "Renamed.md"));
  await assert.rejects(migrateObsidian(source, root, { apply: true }), /identity mismatch/);
  await rm(target); assert.equal((await migrateObsidian(source, root, { apply: true })).deleted, 1);
  assert.equal((await migrateObsidian(source, root, { apply: true })).unchanged, 0);
});

for (const firstKind of ["obsidian", "logseq"]) test(`mixed ownership rejects overlap and malformed other manifests: ${firstKind} first`, async t => {
  const { source, root, base } = await fixture(t);
  const logseq = path.join(base, "logseq"); await put(logseq, "pages/Shared.md"); await put(source, "Shared.md");
  const first = firstKind === "obsidian" ? () => migrateObsidian(source, root, { apply: true }) : () => migrateLogseq(logseq, root, { apply: true });
  const second = firstKind === "obsidian" ? () => migrateLogseq(logseq, root, { apply: true }) : () => migrateObsidian(source, root, { apply: true });
  const result = await first(), before = await tree(root);
  await assert.rejects(second(), /owned by another importer/); assert.deepEqual(await tree(root), before);
  // Even a missing managed output cannot be claimed by the other importer.
  await rm(path.join(root, "notes/Shared.md")); await assert.rejects(second(), /owned by another importer/);
  await first();
  const otherFile = path.join(root, result.manifest), good = await readFile(otherFile);
  await writeFile(otherFile, '{"secret":"BODY_DO_NOT_LEAK"}');
  await assert.rejects(second(), error => /manifest/.test(error.message) && !/BODY_DO_NOT_LEAK/.test(error.message));
  await writeFile(otherFile, good);
  // Nonoverlapping mappings coexist; importing one never deletes the other's files.
  if (firstKind === "obsidian") { await rm(path.join(logseq, "pages/Shared.md")); await put(logseq, "pages/Logseq.md"); }
  else { await rm(path.join(source, "Shared.md")); await put(source, "Obsidian.md"); }
  await second(); await first();
  assert.ok(existsSync(path.join(root, OBSIDIAN_MIGRATION_MANIFEST))); assert.ok(existsSync(path.join(root, LOGSEQ_MIGRATION_MANIFEST)));
});

test("Obsidian rejects unsupported ownership versions, tampered mappings and source identities", async t => {
  const { source, root } = await fixture(t); await put(source, "A.md");
  await migrateObsidian(source, root, { apply: true });
  const file = path.join(root, OBSIDIAN_MIGRATION_MANIFEST), original = JSON.parse(await readFile(file, "utf8"));
  for (const alter of [m => m.version = 2, m => m.importerVersion = 2, m => m.importer = "jumpybrain-logseq", m => m.sourceIdentity = "bad", m => m.entries[0].outputPath = "notes/elsewhere.md", m => m.entries[0].bodyHash = "bad", m => m.entries[0].date = "2000-01-01", m => m.entries[0].type = "page", m => m.entries.push(m.entries[0])]) {
    const copy = structuredClone(original); alter(copy); await writeFile(file, JSON.stringify(copy));
    await assert.rejects(migrateObsidian(source, root, { apply: true }), /manifest/);
  }
  // Unrecognized fields are discarded from parsed ownership and ordinary results.
  original.entries[0].body = "DO_NOT_LEAK"; await writeFile(file, JSON.stringify(original));
  assert.doesNotMatch(JSON.stringify(await migrateObsidian(source, root)), /DO_NOT_LEAK/);
});

test("Obsidian rejects unsafe paths, overlaps, symlink ancestors, hardlinks and incompatible roots", async t => {
  const { source, root, base } = await fixture(t); await put(source, "A.md");
  for (const name of ["../A.md", "/A.md", "a//b.md", "a/../b.md", "a\\b.md", ".hidden/A.md", "folder /A.md", "a\u0000.md"]) assert.throws(() => mapObsidianPath(name), /Unsafe/);
  for (const dest of [source, path.join(source, "child"), base]) await assert.rejects(migrateObsidian(source, dest, { apply: true }), /non-overlapping/);
  await link(path.join(source, "A.md"), path.join(base, "hardlink")); await assert.rejects(migrateObsidian(source, root), /hardlinked/); await rm(path.join(base, "hardlink"));
  await symlink(source, path.join(base, "alias")); await assert.rejects(migrateObsidian(path.join(base, "alias"), root), /Symlink/);
  await mkdir(root); await put(root, "jumpybrain.json", '{"indexRoot":"elsewhere"}'); await assert.rejects(migrateObsidian(source, root, { apply: true }), /indexRoot/);
  await put(root, "jumpybrain.json", '{}'); await assert.rejects(migrateObsidian(source, root, { apply: true }), /Incompatible/);
  await rm(root, { recursive: true }); await put(source, "Ａ.md"); await assert.rejects(migrateObsidian(source, root), /collision/);
  assert.equal(existsSync(root), false);
});

for (const step of ["before-init", "after-init", "after-write", "after-manifest"]) test(`Obsidian rollback restores initialization and files after ${step}`, async t => {
  const { source, root } = await fixture(t); await put(source, "A.md");
  await assert.rejects(migrateObsidianWithHooks(source, root, { apply: true }, { onStep(actual) { if (actual === step) throw Error("PRIVATE_FAILURE_BODY"); } }), error => /rolled back/.test(error.message) && !/PRIVATE_FAILURE_BODY/.test(error.message));
  assert.equal(existsSync(root), false); assert.equal(existsSync(`${root}.logseq-migration-transaction`), false);
});

test("Obsidian rollback restores updates, deletions and ownership together", async t => {
  const { source, root } = await fixture(t); await put(source, "A.md"); await put(source, "B.md");
  await migrateObsidian(source, root, { apply: true }); const before = await tree(root);
  await put(source, "A.md", "changed"); await rm(path.join(source, "B.md"));
  for (const step of ["after-write", "after-delete", "after-manifest"]) {
    await assert.rejects(migrateObsidianWithHooks(source, root, { apply: true }, { onStep(actual) { if (actual === step) throw Error("injected"); } }), /rolled back/);
    assert.deepEqual(await tree(root), before);
  }
});

test("Obsidian preserves concurrent edits and retains body-free recovery receipts", async t => {
  const { source, root } = await fixture(t); await put(source, "A.md");
  await assert.rejects(migrateObsidianWithHooks(source, root, { apply: true }, { async onStep(step) { if (step === "after-write") { await writeFile(path.join(root, "notes/A.md"), "CONCURRENT_PRIVATE_BODY"); throw Error("stop"); } } }), /recovery data was retained/);
  assert.equal(await readFile(path.join(root, "notes/A.md"), "utf8"), "CONCURRENT_PRIVATE_BODY");
  const receipt = await readFile(`${root}.logseq-migration-transaction/receipt.json`, "utf8");
  assert.doesNotMatch(receipt, /CONCURRENT_PRIVATE_BODY|Synthetic private body/);
  await assert.rejects(migrateObsidian(source, root), /retained.*transaction/);
  await assert.rejects(migrateLogseq(source, root), /retained.*transaction/);
});

test("Obsidian canonical scanners, ID/title reads, index inputs and Dream use standalone import envelopes", async t => {
  const { source, root } = await fixture(t);
  const names = ["gold.md", "answer_session_ids.md", "build/logs/Leaf.md", "dist/reports/Leaf.md", "2000-01-01.md"];
  for (const name of names) await put(source, name);
  const imported = await migrateObsidian(source, root, { apply: true }); await rm(path.join(root, imported.manifest));
  await rm(path.join(root, ".jumpybrain"), { recursive: true, force: true });
  for (const list of [listMarkdownFiles, listCanonicalMemoryMarkdownFiles]) assert.deepEqual((await list(root)).map(f => path.relative(root, f)).sort(), names.map(n => `notes/${n}`).sort());
  const inputs = await discoverMarkdownIndexInputs(root);
  for (const entry of imported.entries) {
    assert.equal((await readCanonicalMemoryDocumentById(root, entry.id)).file, entry.outputPath);
    assert.equal((await resolveCanonicalMemoryDocumentByTitle(root, entry.title)).id, entry.id);
    const input = inputs.find(i => i.absolutePath === path.join(root, entry.outputPath)); assert.ok(input); assert.ok(await readCanonicalMarkdownIndexInput(root, input));
  }
  const window = await getDreamWindow({ root, request: { from: new Date().toISOString().slice(0, 10), days: 1, maxFiles: 30 } });
  assert.equal(window.totalFiles, names.length); assert.ok(window.files.every(f => f.dateConfidence === "fallback"));
  assert.ok(window.files.every(f => f.type !== "page"));
  const original = await readFile(path.join(root, "notes/gold.md"), "utf8");
  for (const patch of [{ source: "manual" }, { source_path: "../gold.md" }, { type: "session" }, { id: "bad" }]) {
    let content = original;
    for (const [key, value] of Object.entries(patch)) content = content.replace(new RegExp(`^${key}: .*$`, "m"), `${key}: ${JSON.stringify(value)}`);
    await put(root, "notes/gold.md", content); assert.ok(!(await listCanonicalMemoryMarkdownFiles(root)).includes(path.join(root, "notes/gold.md")));
  }
  await put(root, "notes/.obsidian/gold.md", original);
  await put(root, "notes/.obsidian/ordinary.md", original);
  await put(root, "notes/build/ordinary.md", "ordinary excluded");
  assert.ok(!(await listCanonicalMemoryMarkdownFiles(root)).some(f => f.includes(".obsidian") || f.endsWith("ordinary.md")));
});

const cli = path.resolve("dist/cli.js");
function invoke(args, ok = true, env = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 15000, env: { ...process.env, JUMPYBRAIN_QMD_BIN: "/nonexistent/no-index", JUMPYBRAIN_API_KEY: "", ...env } });
  assert.equal(result.status === 0, ok, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /Synthetic private body/);
  return result;
}
test("Obsidian shipped CLI is strict, local-only, body-free and nonmutating until apply", async t => {
  const { source, root, base } = await fixture(t); await put(source, "A.md");
  const args = ["migrate", "obsidian", "--source", source, "--root", root];
  assert.match(invoke(args).stdout, /Obsidian migration dry-run: 1 notes/);
  const preview = JSON.parse(invoke([...args, "--json"]).stdout); assert.equal(preview.indexed, false); assert.equal(existsSync(root), false);
  for (const suffix of [["--body-format", "preserve"], ["--apply", "no"], ["--unknown"], ["--root", root], ["extra"]]) invoke([...args, ...suffix], false);
  await put(base, "bad-policy.json", "not JSON");
  for (const suffix of [["--target-url"], ["--remote-url=http://127.0.0.1:1"], ["--target-url", "http://127.0.0.1:1"]]) assert.match(invoke([...args, "--apply", ...suffix], false, { JUMPYBRAIN_CLI_CONFIG: path.join(base, "bad-policy.json") }).stderr, /local-only/);
  assert.equal(existsSync(root), false);
  const applied = JSON.parse(invoke([...args, "--apply", "--json"]).stdout); assert.equal(applied.created, 1); assert.equal(applied.indexed, false);
  assert.equal(JSON.parse(invoke([...args, "--apply", "--json"]).stdout).unchanged, 1);
});

for (const step of ["before-init", "after-write", "after-manifest"]) test(`Obsidian source changes during ${step} prevent publication`, async t => {
  const { source, root } = await fixture(t); await put(source, "A.md");
  await assert.rejects(migrateObsidianWithHooks(source, root, { apply: true }, { async onStep(actual) { if (actual === step) await put(source, "new.md", "concurrent source addition"); } }), /rolled back/);
  assert.equal(existsSync(root), false);
});

test("Obsidian graph semantics preserve relative links, ambiguity and relocation limits", async t => {
  const { source, root } = await fixture(t);
  await put(source, "Start.md", '[[Twin]] [[Alias]] [[Leaf#Heading|Label]] [[Leaf#^block]] ![[Leaf]] ![asset](asset.png) [relative](A/Leaf.md#Heading) [root](/A/Leaf.md)');
  await put(source, "A/Leaf.md", '---\naliases: [Alias]\n---\n# Heading\nEvidence ^block');
  await put(source, "A/Twin.md"); await put(source, "B/Twin.md");
  await migrateObsidian(source, root, { apply: true });
  const { graphMemory } = await import("../dist/runtime/index.js");
  const graph = await graphMemory(root, { includeUnresolved: true });
  const edges = graph.edges.filter(e => e.source === "notes/Start.md");
  assert.ok(edges.some(e => e.kind === "markdown-link" && e.target === "notes/A/Leaf.md" && e.resolved));
  assert.ok(edges.some(e => e.kind === "wiki-link" && e.target === "notes/A/Leaf.md" && e.resolved));
  assert.ok(edges.some(e => e.target === "unresolved:twin" && !e.resolved));
  assert.ok(edges.some(e => e.target === "unresolved:alias" && !e.resolved));
  assert.ok(edges.some(e => e.target === "unresolved:/a/leaf.md" && !e.resolved));
  assert.ok(edges.every(e => !e.target.includes("asset")), "embeds do not become graph connections");
});

test("Obsidian rejects special active files without reading them", { skip: process.platform === "win32" }, async t => {
  const { source, root } = await fixture(t);
  const made = spawnSync("mkfifo", [path.join(source, "special.md")]); assert.equal(made.status, 0);
  await assert.rejects(migrateObsidian(source, root, { apply: true }), /special file/);
  assert.equal(existsSync(root), false);
});
