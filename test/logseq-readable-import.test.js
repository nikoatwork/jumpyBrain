import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { convertLogseqBody, hashMigrationBytes, parseLogseqEnvelope, parseLogseqManifest, LOGSEQ_MIGRATION_MANIFEST } from "../dist/core/migration/index.js";
import { migrateLogseq, migrateLogseqWithHooks } from "../dist/app/migration/index.js";

const cases = [
  ["paragraphs/headings", "- # Title\n- First thought.\n- Second thought.\n", "# Title\n\nFirst thought.\n\nSecond thought.\n"],
  ["multiline/blank blocks", "- First\n  continuation\n-\n- Last", "First\ncontinuation\n\nLast"],
  ["tab child hierarchy", "- Parent\n\t- Child\n\t\t- Grandchild\n- Next", "Parent\n- Child\n\t- Grandchild\n\nNext"],
  ["space child list", "- Shopping\n  - Apples\n  - Pears\n", "Shopping\n- Apples\n- Pears\n"],
  ["explicit inner lists", "- - Apples\n- - Pears\n- 1. One\n- 2. Two\n", "- Apples\n- Pears\n1. One\n2. Two\n"],
  ["checkboxes/task states", "- [ ] Open\n- [x] Done\n- TODO Work\n  - LATER Child\n- DONE Finished", "- [ ] Open\n- [x] Done\n- TODO Work\n  - LATER Child\n- DONE Finished"],
  ["fenced literal dashes", "- ```js\n  - literal\n  ```\n- Prose\n", "```js\n- literal\n```\n\nProse\n"],
  ["unwrapped fence", "```md\n- literal\n```\n- Prose", "```md\n- literal\n```\n\nProse"],
  ["long/tilde fences", "- ~~~~text\n  ```\n  - literal\n  ~~~~\n", "~~~~text\n```\n- literal\n~~~~\n"],
  ["indented literal code", "-     - literal\n      more\n- Prose", "    - literal\n    more\n\nProse"],
  ["quotes/tables", "- > Quoted\n- > Still quoted\n- | A | B |\n- | --- | --- |\n- | 1 | 2 |", "> Quoted\n> Still quoted\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"],
  ["properties/macros/IDs", "- id:: uuid\n- {{query (task TODO)}}\n- Text [[Page]] ((block-id))\n  custom:: value", "- id:: uuid\n- {{query (task TODO)}}\n\nText [[Page]] ((block-id))\ncustom:: value"],
  ["source YAML", "---\ntags:\n- original\nid: source-id\n---\n- Prose", "---\ntags:\n- original\nid: source-id\n---\n\nProse"],
  ["CRLF/no final newline/Unicode", "- Café 🐐  \r\n  continued\r\n- 日本語", "Café 🐐  \r\ncontinued\r\n\r\n日本語"],
  ["mixed endings", "- First\r\n- Second\n", "First\r\n\nSecond\n"],
  ["ordinary Markdown", "# Title\n\nPlain text.\n\n1. One\n2. Two\n", "# Title\n\nPlain text.\n\n1. One\n2. Two\n"],
  ["empty", "", ""],
];
for (const [name, input, expected] of cases) {
  test(`readable Logseq: ${name}`, () => {
    assert.equal(convertLogseqBody(Buffer.from(input), "readable").body.toString(), expected);
    assert.deepEqual(convertLogseqBody(Buffer.from(input), "preserve").body, Buffer.from(input));
  });
}

test("unsupported syntax is preserved byte-for-byte with body-free warnings", () => {
  for (const source of [Buffer.from([0xff, 0x00, 0x80]), Buffer.from("- ```\n  - literal"), Buffer.from("---\n- source YAML"), Buffer.from("- bare\r- CR"), Buffer.from("- nul\0")]) {
    const result = convertLogseqBody(source, "readable");
    assert.deepEqual(result.body, source);
    assert.ok(result.warnings.length);
    assert.equal(result.removedOutlineMarkers, 0);
    assert.doesNotMatch(result.warnings.join(""), /literal|source YAML|bare|nul/);
    assert.deepEqual(convertLogseqBody(source, "preserve").warnings, []);
  }
  const nested = convertLogseqBody(Buffer.from("- Parent\n  - Child"), "readable");
  assert.equal(nested.retainedNestedBlocks, 1);
  assert.match(nested.warnings.join(""), /ambiguous/);
});

async function fixture(t) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "jumpy-logseq-readable-")));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = path.join(base, "source"), root = path.join(base, "memory");
  await mkdir(path.join(source, "pages"), { recursive: true });
  await mkdir(path.join(source, "journals"));
  const body = Buffer.from("- # Harbor\r\n- Marker amber-harbor-73 is historical.\r\n- A second thought.");
  await writeFile(path.join(source, "pages/Harbor.md"), body);
  const output = path.join(root, "notes/Harbor.md"), manifest = path.join(root, LOGSEQ_MIGRATION_MANIFEST);
  return { source, root, body, output, manifest };
}

async function legacy(f) {
  await migrateLogseq(f.source, f.root, { apply: true, bodyFormat: "preserve" });
  const manifest = JSON.parse(await readFile(f.manifest, "utf8"));
  manifest.version = 1; manifest.importerVersion = 1;
  for (const entry of manifest.entries) for (const key of ["bodyFormat", "bodyVersion", "bodyHash", "bodyBytes"]) delete entry[key];
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(f.manifest, bytes);
  return bytes;
}

test("default readable preview/apply verifies separate source/body/output hashes and byte-stable reruns", async t => {
  const f = await fixture(t);
  const preview = await migrateLogseq(f.source, f.root);
  await assert.rejects(lstat(f.root), { code: "ENOENT" });
  assert.equal(preview.conversion.bodyFormat, "readable");
  assert.equal(preview.conversion.changedDocuments, 1);
  assert.equal(preview.conversion.removedOutlineMarkers, 3);
  const applied = await migrateLogseq(f.source, f.root, { apply: true });
  const bytes = await readFile(f.output), envelope = parseLogseqEnvelope(bytes), entry = applied.entries[0];
  assert.equal(envelope.body.toString(), "# Harbor\r\n\r\nMarker amber-harbor-73 is historical.\r\n\r\nA second thought.");
  assert.equal(entry.sourceHash, hashMigrationBytes(f.body));
  assert.equal(entry.bodyHash, hashMigrationBytes(envelope.body));
  assert.notEqual(entry.sourceHash, entry.bodyHash);
  assert.equal(entry.outputHash, hashMigrationBytes(bytes));
  assert.equal(entry.bodyBytes, envelope.body.length);
  const manifest = await readFile(f.manifest), modified = await stat(f.output), manifestStat = await stat(f.manifest);
  assert.equal(parseLogseqManifest(manifest).version, 2);
  assert.equal((await migrateLogseq(f.source, f.root, { apply: true })).unchanged, 1);
  assert.deepEqual(await readFile(f.output), bytes);
  assert.deepEqual(await readFile(f.manifest), manifest);
  assert.equal((await stat(f.output)).mtimeMs, modified.mtimeMs);
  assert.equal((await stat(f.manifest)).mtimeMs, manifestStat.mtimeMs);
  assert.deepEqual(await readFile(path.join(f.source, "pages/Harbor.md")), f.body);
});

test("version-one preview upgrades unchanged sources; switching modes preserves identity and no-op bytes", async t => {
  const f = await fixture(t), oldManifest = await legacy(f), oldOutput = await readFile(f.output);
  const old = parseLogseqEnvelope(oldOutput);
  const preview = await migrateLogseq(f.source, f.root);
  assert.equal(preview.overwritten, 1);
  assert.equal(preview.entries[0].conflict, false);
  assert.match(preview.warnings.join(""), /policy upgrade/);
  assert.deepEqual(await readFile(f.manifest), oldManifest);
  assert.deepEqual(await readFile(f.output), oldOutput);
  const result = await migrateLogseq(f.source, f.root, { apply: true, failOnConflict: true });
  assert.equal(result.entries[0].id, old.metadata.id);
  assert.equal(result.entries[0].createdAt, old.metadata.created_at);
  assert.ok(result.entries[0].updatedAt > old.metadata.updated_at);
  const preserved = await migrateLogseq(f.source, f.root, { apply: true, bodyFormat: "preserve" });
  assert.equal(preserved.overwritten, 1);
  assert.equal(preserved.entries[0].id, old.metadata.id);
  assert.deepEqual(parseLogseqEnvelope(await readFile(f.output)).body, f.body);
  assert.equal((await migrateLogseq(f.source, f.root, { apply: true, bodyFormat: "preserve" })).unchanged, 1);
  assert.equal((await migrateLogseq(f.source, f.root, { apply: true })).overwritten, 1);
});

test("legacy preserve upgrades ownership metadata without rewriting canonical bytes", async t => {
  const f = await fixture(t); await legacy(f);
  const before = await readFile(f.output);
  const result = await migrateLogseq(f.source, f.root, { apply: true, bodyFormat: "preserve" });
  assert.equal(result.unchanged, 1);
  assert.deepEqual(await readFile(f.output), before);
  assert.equal(parseLogseqManifest(await readFile(f.manifest)).version, 2);
});

test("manual cleanup conflicts fail closed during legacy upgrade, default source wins, removal stays owned", async t => {
  const f = await fixture(t), manifest = await legacy(f);
  const old = parseLogseqEnvelope(await readFile(f.output));
  const cleaned = Buffer.concat([(await readFile(f.output)).subarray(0, -f.body.length), Buffer.from("Manually cleaned prose")]);
  await writeFile(f.output, cleaned);
  await assert.rejects(migrateLogseq(f.source, f.root, { apply: true, failOnConflict: true }), /conflict/);
  assert.deepEqual(await readFile(f.output), cleaned);
  assert.deepEqual(await readFile(f.manifest), manifest);
  const result = await migrateLogseq(f.source, f.root, { apply: true });
  assert.equal(result.entries[0].conflict, true);
  assert.equal(result.entries[0].id, old.metadata.id);
  await writeFile(path.join(f.root, "notes/unrelated.md"), "keep");
  await unlink(path.join(f.source, "pages/Harbor.md"));
  assert.equal((await migrateLogseq(f.source, f.root, { apply: true })).deleted, 1);
  await assert.rejects(lstat(f.output), { code: "ENOENT" });
  assert.equal(await readFile(path.join(f.root, "notes/unrelated.md"), "utf8"), "keep");
});

for (const step of ["after-write", "after-manifest"]) {
  test(`legacy body-policy upgrade rolls back output and manifest after ${step}`, async t => {
    const f = await fixture(t), manifest = await legacy(f), output = await readFile(f.output);
    await assert.rejects(migrateLogseqWithHooks(f.source, f.root, { apply: true }, { onStep(actual) { if (actual === step) throw new Error("synthetic failure"); } }), /rolled back/);
    assert.deepEqual(await readFile(f.manifest), manifest);
    assert.deepEqual(await readFile(f.output), output);
    assert.deepEqual(await readFile(path.join(f.source, "pages/Harbor.md")), f.body);
  });
}

test("invalid modes and conversion ownership metadata cannot authorize writes or deletion", async t => {
  const f = await fixture(t);
  for (const bodyFormat of ["raw", false, 1, "", {}]) await assert.rejects(migrateLogseq(f.source, f.root, { apply: true, bodyFormat }), /body format/);
  await assert.rejects(lstat(f.root), { code: "ENOENT" });
  await migrateLogseq(f.source, f.root, { apply: true });
  const manifest = JSON.parse(await readFile(f.manifest, "utf8")), output = await readFile(f.output);
  await unlink(path.join(f.source, "pages/Harbor.md"));
  const variants = [
    m => { m.version = 3; }, m => { m.importerVersion = 1; },
    m => { m.entries[0].bodyHash = "bad"; }, m => { delete m.entries[0].bodyHash; },
    m => { m.entries[0].bodyVersion = 999; }, m => { m.entries[0].bodyBytes = -1; },
    m => { m.entries[0].bodyFormat = "unknown"; }, m => { m.entries[0].bodyBytes = m.entries[0].outputBytes + 1; },
    m => { m.entries[0].bodyFormat = "preserve"; m.entries[0].bodyVersion = 0; },
  ];
  for (const mutate of variants) {
    const value = structuredClone(manifest); mutate(value);
    await writeFile(f.manifest, JSON.stringify(value));
    await assert.rejects(migrateLogseq(f.source, f.root, { apply: true }), /manifest/);
    assert.deepEqual(await readFile(f.output), output);
  }
});

test("shipped CLI defaults readable, forwards preserve, and rejects malformed/repeated format flags", async t => {
  const f = await fixture(t), cli = path.resolve("dist/cli.js");
  const args = ["migrate", "logseq", "--source", f.source, "--root", f.root];
  const invoke = extra => spawnSync(process.execPath, [cli, ...args, ...extra], { encoding: "utf8", timeout: 15000 });
  const preview = invoke(["--json"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).conversion.bodyFormat, "readable");
  assert.doesNotMatch(preview.stdout, /amber-harbor-73|historical/);
  for (const extra of [["--body-format"], ["--body-format="], ["--body-format=raw"], ["--body-format", "readable", "--body-format=preserve"]]) {
    const failure = invoke([...extra, "--apply"]);
    assert.notEqual(failure.status, 0);
    await assert.rejects(lstat(f.root), { code: "ENOENT" });
  }
  const preserve = invoke(["--body-format=preserve", "--apply", "--json"]);
  assert.equal(preserve.status, 0, preserve.stderr);
  assert.equal(JSON.parse(preserve.stdout).conversion.bodyFormat, "preserve");
  assert.deepEqual(parseLogseqEnvelope(await readFile(f.output)).body, f.body);
  const applied = invoke(["--apply", "--json"]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).overwritten, 1);
});
