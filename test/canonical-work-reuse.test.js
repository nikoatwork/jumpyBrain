import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as canonical from "../dist/core/canonical/index.js";
import { initializeMemoryRoot, readMemoryDocument, updateMemoryDocument } from "../dist/runtime/index.js";
const ids = [1, 2, 3].map(n => `mem_10000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "jb-work-reuse-")));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await initializeMemoryRoot(root);
  for (let i = 0; i < ids.length; i++) await fs.writeFile(path.join(root, "notes", `${i}.md`), `---\nid: ${ids[i]}\ntitle: Item ${i}\n---\nOriginal ${i}\n`);
  return root;
}
function counters(t, root) {
  const counts = { discovery: 0, reads: 0, opens: 0 };
  const readdir = fs.readdir, readFile = fs.readFile, open = fs.open;
  t.mock.method(fs, "readdir", async (...args) => { if (args[0] === path.join(root, "notes")) counts.discovery++; return readdir(...args); });
  t.mock.method(fs, "readFile", async (...args) => { if (String(args[0]).endsWith(".md")) counts.reads++; return readFile(...args); });
  t.mock.method(fs, "open", async (...args) => { if (String(args[0]).endsWith(".md")) counts.opens++; return open(...args); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return counts;
}
test("multi-ID discovery scans once, guards current bytes, and retains global duplicate errors", async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, "pages", "duplicate.md"), `---\nid: ${ids[2]}\n---\nduplicate\n`);
  const counts = counters(t, root);
  const discovery = await canonical.discoverCanonicalMemoryDocumentsById(root, ids);
  for (const id of ids.slice(0, 2)) assert.equal((await discovery.read(id, { guarded: true })).id, id);
  await assert.rejects(discovery.read(ids[2], { guarded: true }), { code: "duplicate_id" });
  await assert.rejects(discovery.read("invalid"), { code: "invalid_id" });
  await assert.rejects(discovery.read("mem_10000000-0000-4000-8000-000000000099"), { code: "missing_id" });
  assert.equal(counts.discovery, 1);
  assert.equal(counts.reads, 4);
  assert.equal(counts.opens, 2);
  await fs.writeFile(path.join(root, "notes", "0.md"), `---\nid: ${ids[1]}\n---\nchanged identity\n`);
  await assert.rejects(discovery.read(ids[0], { guarded: true }), { code: "precondition_failed" });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(canonical.discoverCanonicalMemoryDocumentsById(root, ids, controller.signal), { name: "AbortError" });
});
test("app update performs one discovery and delegates stale preconditions to core", async t => {
  const root = await fixture(t);
  const before = await readMemoryDocument(root, ids[0]);
  const counts = counters(t, root);
  const updated = await updateMemoryDocument(root, ids[0], before.content.replace("Original 0", "Updated 0"), { ifMatch: before.contentHash });
  assert.notEqual(updated.contentHash, before.contentHash);
  assert.equal(counts.discovery, 1);
  await assert.rejects(updateMemoryDocument(root, ids[0], before.content, { ifMatch: before.contentHash }), error => error.name === "MemoryDocumentPreconditionError" && error.code === "precondition_failed");
});

test("index reads/parses inputs once inside the root lock, including excluded-name migration envelopes", async t => {
  const root = await fixture(t);
  const { installFakeQmd } = await import("./fake-qmd-helper.js");
  const { bin } = await installFakeQmd(root);
  await fs.writeFile(bin, `#!${process.execPath}\n`); await fs.chmod(bin, 0o755);
  const prior = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = bin;
  t.after(() => { if (prior === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = prior; });
  const imported = "---\nid: mem_10000000-0000-4000-8000-000000000088\ntype: note\nsource: logseq-migration\nsource_path: pages/gold.md\n---\nImported exception\n";
  await fs.writeFile(path.join(root, "notes/gold.md"), imported);
  await fs.writeFile(path.join(root, "notes/answer_session_ids.md"), "excluded ordinary input\n");
  const counts = counters(t, root);
  let lockedReads = 0;
  const readFile = fs.readFile;
  t.mock.method(fs, "readFile", async (...args) => {
    if (String(args[0]).endsWith(".md")) {
      let locked = true;
      try { await fs.access(path.join(root, ".jumpybrain", "index.lock")); } catch { locked = false; }
      if (locked) lockedReads++;
      else await fs.access(path.join(root, ".jumpybrain", "index.json")); // No unlocked content pre-read before publication.
    }
    return readFile(...args);
  });
  syncBuiltinESMExports();
  const { indexMemory } = await import("../dist/runtime/index.js");
  const result = await indexMemory(root, { indexing: { mode: "lexical" } });
  assert.equal(result.documents, 4);
  assert.equal(lockedReads, 5);
  assert.equal(counts.reads, 7); // Two independent readiness-envelope reads after publication.
  // Isolate the parser mock before app import; keep ordinary npm test flag-free.
  const program = `
    import { mock } from "node:test";
    import { syncBuiltinESMExports } from "node:module";
    import fs from "node:fs/promises";
    import { existsSync } from "node:fs";
    import path from "node:path";
    const locked = () => existsSync(path.join(process.argv[1], ".jumpybrain/index.lock"));
    const parserUrl = ${JSON.stringify(new URL("../dist/core/frontmatter.js", import.meta.url).href)};
    const original = await import(parserUrl);
    let parses = 0, reads = 0, totalParses = 0, totalReads = 0;
    mock.module(parserUrl, { namedExports: { parseFrontmatter: (...args) => { totalParses++; if (locked()) parses++; return original.parseFrontmatter(...args); } } });
    const readFile = fs.readFile;
    mock.method(fs, "readFile", async (...args) => { if (String(args[0]).endsWith(".md")) { totalReads++; if (locked()) reads++; } return readFile(...args); });
    syncBuiltinESMExports();
    const { indexMemory } = await import(${JSON.stringify(new URL("../dist/app/local-memory/index.js", import.meta.url).href)});
    await indexMemory(process.argv[1], { indexing: { mode: "lexical" } });
    process.stdout.write(JSON.stringify({ reads, parses, outsideReads: totalReads - reads, outsideParses: totalParses - parses }));
  `;
  assert.deepEqual(JSON.parse(execFileSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "-e", program, root], { encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } })), { reads: 5, parses: 5, outsideReads: 2, outsideParses: 2 });
});

test("canonical snapshot rejects cancellation and changes during the content read", async t => {
  const root = await fixture(t);
  const file = path.join(root, "notes/0.md");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(canonical.readCanonicalMarkdownSnapshot(root, file, controller.signal), { name: "AbortError" });
  const readFile = fs.readFile;
  t.mock.method(fs, "readFile", async (...args) => {
    const bytes = await readFile(...args);
    if (args[0] === file) await fs.writeFile(file, "changed while reading and now longer\n");
    return bytes;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(canonical.readCanonicalMarkdownSnapshot(root, file), /changed during snapshot/);
});
