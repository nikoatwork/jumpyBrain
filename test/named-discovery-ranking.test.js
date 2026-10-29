import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installFakeQmd } from "./fake-qmd-helper.js";
import { parseFrontmatter } from "../dist/core/frontmatter.js";
import { resolveTemporalQuery } from "../dist/core/retrieval-policy/temporal.js";
import { buildQmdIndex, searchQmdIndex } from "../dist/adapters/qmd/index.js";

const files = results => results.map(result => result.provenance.file);
const query = "Explain Marigold purpose coordinator and the accepted operating limits for a new colleague";

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jb-named-discovery-"));
  const saved = { JUMPYBRAIN_QMD_BIN: process.env.JUMPYBRAIN_QMD_BIN, JUMPYBRAIN_QMD_EMBED: process.env.JUMPYBRAIN_QMD_EMBED };
  try {
    const { bin, model } = await installFakeQmd(root);
    // Fixed backend lists isolate adapter admission and ordering from lexical
    // matching. They deliberately omit named canonical sources in each case.
    await writeFile(bin, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync('named-rows.json', 'utf8'));
const collection = args[args.indexOf('-c') + 1];
const count = Number(args[args.indexOf('-n') + 1]);
console.log(JSON.stringify(rows.slice(0, count).map(row => ({...row, file:'qmd://' + collection + '/' + row.file}))));
`);
    await chmod(bin, 0o755);
    process.env.JUMPYBRAIN_QMD_BIN = bin;
    process.env.JUMPYBRAIN_QMD_EMBED = "0";
    const documents = [];
    const put = async (file, title, body = "The recorded arrangement remains qualified and subject to review.", metadata = {}) => {
      const absolutePath = path.join(root, file);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      const fm = { title, date: "2026-10-01", ...metadata };
      const content = `---\n${Object.entries(fm).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n${body}\n`;
      await writeFile(absolutePath, content);
      const parsed = parseFrontmatter(content);
      documents.push({ absolutePath, relativePath: file, ...parsed });
      return { file, score: 0.7, snippet: body, line: parsed.bodyStartLine };
    };
    const index = async (rows = [], semantic = false) => {
      await writeFile(path.join(root, "named-rows.json"), JSON.stringify(rows));
      await buildQmdIndex(root, documents, { indexing: semantic ? { mode: "semantic", model } : { mode: "lexical" } });
    };
    await run({ root, put, index, search: (text = query, limit = 100, options = {}) => searchQmdIndex(root, text, limit, options) });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
}

test("named discovery admits missing canonical evidence with its permission boundary intact", async () => fixture(async ({ put, index, search }) => {
  const background = await put("notes/background.md", "Volunteer arrangements");
  const purpose = await put("notes/purpose.md", "Marigold purpose", "Marigold gives isolated residents a supervised workshop. Priya coordinates it.");
  const scope = await put("decisions/scope.md", "Marigold operating limits", "Marigold permits supervised hand-tool work only; powered machinery is NOT approved.");
  await index([background]);
  const hits = await search();
  assert.deepEqual(new Set(files(hits)), new Set([purpose.file, scope.file, background.file]));
  assert.equal(hits.at(-1).provenance.file, background.file);
  for (const file of [purpose.file, scope.file]) assert.equal(hits.find(hit => hit.provenance.file === file).scoreBreakdown.qmdScore, 0);
  const permission = hits.find(hit => hit.provenance.file === scope.file);
  assert.match(permission.snippet, /powered machinery is NOT approved/);
  assert.equal(permission.provenance.metadata.title, "Marigold operating limits");
  assert.ok(permission.provenance.lineEnd >= permission.provenance.lineStart);
}));

test("eight metadata supplements are path-bounded and do not evict any original candidate", async () => fixture(async ({ put, index, search }) => {
  const original = await put("notes/z-original.md", "Unrelated original");
  for (let n = 11; n >= 0; n--) await put(`notes/named-${String(n).padStart(2, "0")}.md`, `Marigold record ${n}`);
  await index([original]);
  const hits = await search();
  const added = files(hits).filter(file => file !== original.file);
  assert.deepEqual(added, Array.from({ length: 8 }, (_, n) => `notes/named-${String(n).padStart(2, "0")}.md`));
  assert.equal(hits.length, 9);
  assert.equal(hits.find(hit => hit.provenance.file === original.file).scoreBreakdown.qmdScore, 1, "the original rank-one fusion score survives");
}));

test("named ordering stable-partitions only the first forty grouped results", async () => fixture(async ({ put, index, search }) => {
  const rows = [];
  for (let n = 0; n < 44; n++) rows.push({ ...await put(`notes/background-${String(n).padStart(2, "0")}.md`, `Background ${n}`), score: 1 - n / 1000 });
  const present = await put("notes/present.md", "Marigold existing decision");
  const missing = await put("notes/missing.md", "Marigold absent introduction");
  rows.splice(20, 0, { ...present, score: 0.9805 });
  await index(rows);
  const hits = await search();
  assert.equal(hits[0].provenance.file, present.file);
  assert.deepEqual(files(hits).filter(file => file !== present.file && file !== missing.file), rows.filter(row => row.file !== present.file).map(row => row.file));
  assert.equal(hits.at(-1).provenance.file, missing.file, "new evidence below rank forty is admitted but cannot leap over the frozen ordering pool");
  assert.equal(hits.length, 46);
}));

test("multiple named subjects bypass discovery while shared aliases preserve both qualified sources", async () => fixture(async ({ put, index, search }) => {
  const original = await put("notes/original.md", "Background");
  const first = await put("notes/archive.md", "Marigold archive", "The archive permits local listening only; online publication is excluded.", { aliases: "Conduit" });
  const second = await put("notes/watch.md", "Kingfisher watch", "The watch reports observations only; evacuation authority is excluded.", { aliases: ["Conduit"] });
  await put("notes/archive-two.md", "Marigold catalogue");
  await put("notes/watch-two.md", "Kingfisher gauge");
  await index([original]);
  assert.deepEqual(files(await search("Explain Marigold and Kingfisher coordinator responsibilities")), [original.file]);
  assert.deepEqual(files(await search("Explain marigold coordinator responsibilities")), [original.file], "literal capitalization remains part of the frozen recognition rule");
  const ambiguous = await search("Explain Conduit responsibilities and the remaining authority restrictions");
  assert.deepEqual(new Set(files(ambiguous)), new Set([first.file, second.file, original.file]));
  assert.match(ambiguous.find(hit => hit.provenance.file === first.file).snippet, /online publication is excluded/);
  assert.match(ambiguous.find(hit => hit.provenance.file === second.file).snippet, /evacuation authority is excluded/);
}));

test("literal constraints, exact navigation and explicit temporal retrieval retain existing admission", async () => fixture(async ({ put, index, search }) => {
  const title = await put("notes/title.md", "Marigold purpose");
  await put("notes/other.md", "Marigold operating limits");
  await index();
  for (const text of ['Marigold "operating limits"', "Marigold -approved", "Marigold NOT approved", "Marigold src/procedure.ts"]) {
    assert.deepEqual(await search(text), [], text);
  }
  assert.deepEqual(files(await search("Marigold purpose")), [title.file]);
  const temporal = { interval: resolveTemporalQuery({ from: "2026-10-01", to: "2026-10-01" }), coverage: {} };
  assert.deepEqual(await search("Marigold absentword", 100, { temporal }), [], "the existing temporal token backfill must not become a named-subject supplement");
}));

test("semantic-ready policy keeps missing files absent and original score ordering", async () => fixture(async ({ put, index, search }) => {
  const background = await put("notes/background.md", "Background");
  const named = await put("notes/existing.md", "Marigold existing record");
  await put("notes/missing.md", "Marigold missing introduction");
  await index([{ ...background, score: 1 }, { ...named, score: 0.2 }], true);
  const hits = await search();
  assert.deepEqual(files(hits), [background.file, named.file]);
  assert.equal(hits[0].scoreBreakdown.qmdScore, 1);
  assert.equal(hits[1].scoreBreakdown.qmdScore, 0.5, "the existing lexical reciprocal-rank floor is unchanged");
}));
