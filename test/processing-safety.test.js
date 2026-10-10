import assert from "node:assert/strict";
import { installFakeQmd } from "./fake-qmd-helper.js";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeMemoryRoot, processMemory } from "../dist/index.js";
import { hashMemoryDocumentContent, parseFrontmatter, readMarkdownDocuments } from "../dist/core/canonical/markdown-store.js";
import { buildQmdIndex } from "../dist/adapters/qmd/index.js";
import { parseArgs } from "../dist/cli/args.js";
import { runMemoryCommand } from "../dist/cli/memory-commands.js";

const id = "mem_00000000-0000-0000-0000-000000000321";
async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-process-safe-"));
  try {
    await initializeMemoryRoot(root);
    const write = async (file, body, metadata = {}) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      const text = `---\n${Object.entries({ type: "note", updated_at: "2026-02-01", ...metadata }).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${body}\n`;
      await writeFile(path.join(root, file), text);
      return text;
    };
    await write("notes/quartz.md", "# Quartz ledger\n\n## Import header\nRecorded by the fictional office at noon.\n\n## Retry mechanism\nQuartz ledger deduplicates retries with a durable invoice key.\n\nThis applies only to the test cluster; production remains unverified.", { title: "Quartz ledger" });
    await run(root, write);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const synthesize = (root, extra = {}) => processMemory(root, { mode: "synthesize", topic: "quartz ledger", apply: true, ...extra });

test("synthesis refuses human and dream collisions without changing a byte", () => fixture(async (root, write) => {
  for (const metadata of [{}, { source: "human" }, { source: "jumpybrain-process", dream: true }, { source: "jumpybrain-process", confidence: "user-reviewed" }, { source: "jumpybrain-process", topic: "another topic" }]) {
    const before = await write("pages/quartz-ledger.md", "# Human page\n\nPreserve me.", { id, type: "page", topic: "quartz ledger", ...metadata });
    await assert.rejects(synthesize(root), /Refusing to overwrite/);
    assert.equal(await readFile(path.join(root, "pages/quartz-ledger.md"), "utf8"), before);
  }
}));

test("synthesis uses structural excerpts, retains qualifications, preserves metadata and is byte-stable on rerun", () => fixture(async (root, write) => {
  await write("pages/quartz-ledger.md", "# Old map\n\nOld generated body.", {
    id, type: "page", topic: "quartz ledger", title: "Preserved custom title", source: "jumpybrain-process",
    created_at: "2020-01-01", tags: ["custom"], custom_owner: "fictional", review: "recommended", confidence: "agent-drafted",
  });
  const first = await synthesize(root);
  assert.equal(first.modifiedCount, 1);
  const content = await readFile(path.join(root, "pages/quartz-ledger.md"), "utf8");
  assert.match(content, /extractive source map, not reviewed synthesis/);
  assert.match(content, /durable invoice key/);
  assert.match(content, /production remains unverified/);
  assert.doesNotMatch(content, /\*\*Quartz ledger\*\*: Recorded/);
  assert.doesNotMatch(content, /Current understanding/);
  assert.match(content, /\[Original source\]\(\.\.\/notes\/quartz.md\) — lines \d+-\d+/);
  const parsed = parseFrontmatter(content);
  assert.equal(parsed.frontmatter.id, id);
  assert.equal(parsed.frontmatter.title, "Preserved custom title");
  assert.equal(parsed.frontmatter.created_at, "2020-01-01");
  assert.equal(parsed.frontmatter.custom_owner, "fictional");
  assert.deepEqual(parsed.frontmatter.tags, ["custom"]);
  assert.equal(parsed.frontmatter.review, "recommended");
  const rerun = await synthesize(root, { ifMatch: hashMemoryDocumentContent(content) });
  assert.equal(rerun.applied, false);
  assert.equal(rerun.modifiedCount, 0);
  assert.deepEqual(rerun.files, []);
  assert.equal(await readFile(path.join(root, "pages/quartz-ledger.md"), "utf8"), content);
}));

test("generated source links round-trip punctuation in canonical filenames", () => fixture(async (root, write) => {
  await write("notes/quartz (trial).md", "# Quartz ledger trial\n\nQuartz ledger trial retries use a durable key.");
  const result = await synthesize(root);
  const content = await readFile(path.join(root, result.files[0]), "utf8");
  assert.match(content, /quartz%20%28trial%29\.md/);
  const lint = await processMemory(root, { mode: "lint", apply: true });
  assert.equal(lint.issues.some(issue => issue.code === "PAGE_SOURCE_BROKEN"), false);
}));

test("synthesis refuses stale hash on existing or absent destination", () => fixture(async (root) => {
  await assert.rejects(synthesize(root, { ifMatch: "sha256:stale" }), /hash is stale/);
  await synthesize(root);
  const before = await readFile(path.join(root, "pages/quartz-ledger.md"), "utf8");
  await assert.rejects(synthesize(root, { ifMatch: "sha256:stale" }), /hash is stale/);
  assert.equal(await readFile(path.join(root, "pages/quartz-ledger.md"), "utf8"), before);
}));

test("synthesis and lint reject symlink destinations and ancestor directories", () => fixture(async (root, write) => {
  const outside = path.join(root, "untouched.txt");
  await writeFile(outside, "do not change");
  await symlink(outside, path.join(root, "pages/quartz-ledger.md"));
  await assert.rejects(synthesize(root), /Unsafe processing destination/);
  assert.equal(await readFile(outside, "utf8"), "do not change");
  await rm(path.join(root, "pages"), { recursive: true });
  await mkdir(path.join(root, "elsewhere"));
  await symlink(path.join(root, "elsewhere"), path.join(root, "pages"));
  await assert.rejects(synthesize(root), /Unsafe processing destination/);
  await mkdir(path.join(root, ".jumpybrain"), { recursive: true });
  await symlink(path.join(root, "elsewhere"), path.join(root, ".jumpybrain/reports"));
  await assert.rejects(processMemory(root, { mode: "lint", apply: true }), /Unsafe processing destination/);
}));

test("Boolean apply is explicit in API and CLI, including false and malformed values", () => fixture(async (root) => {
  for (const apply of [false, undefined, "false", "true", 1]) await assert.rejects(synthesize(root, { apply }), /Re-run with --apply/);
  const calls = [];
  const transport = { processMemory: async (_root, options) => {
    calls.push(options.apply);
    if (options.apply !== true) throw new Error("not applied");
    return { mode: "lint", applied: true, files: [], summary: [] };
  } };
  for (const spelling of [["--apply", "false"], ["--apply=false"]]) {
    await assert.rejects(runMemoryCommand("process", parseArgs(["process", "--root", root, "--mode", "lint", ...spelling]), transport), /not applied/);
    assert.equal(calls.at(-1), false);
  }
  const count = calls.length;
  for (const spelling of [["--apply", "yes"], ["--apply", "0"], ["--apply=maybe"], ["--apply", "true", "--apply", "false"]]) {
    await assert.rejects(async () => runMemoryCommand("process", parseArgs(["process", "--root", root, "--mode", "lint", ...spelling]), transport), /--apply/);
  }
  assert.equal(calls.length, count);
  for (const spelling of [["--apply"], ["--apply", "true"], ["--apply=true"]]) {
    await runMemoryCommand("process", parseArgs(["process", "--root", root, "--mode", "lint", ...spelling]), transport);
    assert.equal(calls.at(-1), true);
  }
}));

async function fakeIndex(root, rows, script = "") {
  const { bin: binary } = await installFakeQmd(root);
  await writeFile(binary, `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nif (['search', 'query'].includes(args[0])) { ${script}\nconst collection = args[args.indexOf('-c') + 1];\nconsole.log(JSON.stringify(${JSON.stringify(rows)}.map(row => ({...row, file: 'qmd://' + collection + '/' + row.file}))));\n} else console.log('[]');\n`);
  await chmod(binary, 0o755);
  process.env.JUMPYBRAIN_QMD_BIN = binary;
  process.env.JUMPYBRAIN_QMD_EMBED = "0";
  await buildQmdIndex(root, await readMarkdownDocuments(root));
}
async function withQmd(run) {
  const saved = { JUMPYBRAIN_QMD_BIN: process.env.JUMPYBRAIN_QMD_BIN, JUMPYBRAIN_QMD_EMBED: process.env.JUMPYBRAIN_QMD_EMBED };
  try { await run(); } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test("direct and QMD-expanded synthesis both enforce since and exclude dream primary sources", () => withQmd(() => fixture(async (root, write) => {
  await write("notes/old.md", "# Old quartz ledger\n\nQuartz ledger obsolete mechanism.", { updated_at: "2020-01-01" });
  await write("notes/dream.md", "# Quartz ledger dream\n\nQuartz ledger dream-only claim.", { dream: true });
  // These contain only one topic token, so QMD (not direct all-token selection) adds them.
  await write("notes/qmd-current.md", "# Related\n\nLedger has a recent bounded mechanism.", { updated_at: "2026-02-01" });
  await write("notes/qmd-old.md", "# Related\n\nLedger has an obsolete backend mechanism.", { updated_at: "2020-01-01" });
  await write("notes/qmd-dream.md", "# Related\n\nLedger has a dreamed backend mechanism.", { dream: true });
  const files = ["notes/old.md", "notes/dream.md", "notes/qmd-current.md", "notes/qmd-old.md", "notes/qmd-dream.md"];
  await fakeIndex(root, files.map(file => ({ file, score: 0.99, line: 8, snippet: "quartz ledger mechanism" })));
  await synthesize(root, { since: "2025-01-01" });
  const content = await readFile(path.join(root, "pages/quartz-ledger.md"), "utf8");
  assert.match(content, /recent bounded mechanism/);
  assert.doesNotMatch(content, /obsolete|dream-only|dreamed backend/);
  assert.match(content, /notes\/quartz.md/);
  assert.doesNotMatch(content, /notes\/old.md|notes\/dream.md|notes\/qmd-old.md|notes\/qmd-dream.md/);
})));

test("a destination changed during QMD expansion is never overwritten", () => withQmd(() => fixture(async (root, write) => {
  await write("pages/quartz-ledger.md", "# Prior owned map", { id, type: "page", topic: "quartz ledger", source: "jumpybrain-process" });
  const file = path.join(root, "pages/quartz-ledger.md");
  const concurrent = "# Human concurrent revision\n\nKeep this newer revision.\n";
  await fakeIndex(root, [], `fs.writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(concurrent)});`);
  await assert.rejects(synthesize(root), /changed after preflight/);
  assert.equal(await readFile(file, "utf8"), concurrent);
})));
