import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseFrontmatter } from "../dist/core/frontmatter.js";
import { dreamBoostFor, isDreamDocument, isSourceFocusedQuery } from "../dist/core/retrieval-policy/index.js";
import { buildQmdIndex, searchQmdIndex } from "../dist/adapters/qmd/index.js";
import { dateStats, diversifyResults, documentTime, dreamRelevance, temporalBoostFor } from "../dist/adapters/qmd/qmd-ranking.js";
import { neighborSnippetFromOriginal, snippetFromOriginalBody } from "../dist/adapters/qmd/qmd-snippets.js";

const document = (file, frontmatter = {}) => ({ relativePath: file, absolutePath: `/missing/${file}`, bodyStartLine: 1, frontmatter });
const prose = "Harbor migration connects fleet scheduling, cargo routing, crew readiness, operational limits, weather checks, berth assignments and port safety. Additional evidence remains accessible through the linked notes.";

function result(file, snippet, dream = false) {
  return { id: file + snippet, score: 1, snippet, provenance: { file, lineStart: 1, lineEnd: 2, metadata: { dream } } };
}

test("dream classifier requires a parsed boolean, independently of directory", () => {
  for (const value of ['true', 'false', '"true"', '"false"', "'true'", '1', '["true"]']) {
    const parsed = parseFrontmatter(`---\ndream: ${value}\n---\n[[dream]]`);
    assert.equal(isDreamDocument(document("notes/map.md", parsed.frontmatter)), value === "true", value);
  }
  assert.equal(isDreamDocument(document("pages/dream.md")), false);
});

test("dream preference is relevance-gated, depth-calibrated, and disabled for evidence queries", () => {
  const map = document("pages/map.md", { dream: true });
  assert.ok(Math.abs(dreamBoostFor(map, "normal", "harbor migration", 1) - 0.45) < 1e-8);
  assert.ok(Math.abs(dreamBoostFor(map, "shallow", "harbor migration", 1) - 0.2) < 1e-8);
  assert.equal(dreamBoostFor(map, "deep", "harbor migration", 1), 0);
  assert.equal(dreamBoostFor(map, "normal", "harbor migration", 0), 0);
  assert.equal(dreamRelevance("harbor migration", "Unrelated recipes for fruit pies", {}, 1), 0);
  assert.equal(dreamRelevance("harbor migration", prose, {}, 0.1), 0);
  for (const query of ['harbor 2022', 'original harbor migration', 'exact harbor migration', '"harbor migration"', 'notes/harbor.md']) {
    assert.equal(isSourceFocusedQuery(query), true, query);
    assert.equal(dreamBoostFor(map, "shallow", query, 1), 0, query);
  }
});

test("dream write timestamps cannot masquerade as evidence dates", () => {
  const undated = { dream: true, created_at: "2026-05-01", updated_at: "2026-06-01" };
  assert.equal(documentTime(undated), undefined);
  assert.equal(temporalBoostFor("latest harbor migration", undated, { min: 0, max: Date.now() }), 0);
  const historical = { ...undated, date: "2022-04-21" };
  assert.equal(documentTime(historical), Date.UTC(2022, 3, 21));
  assert.deepEqual(dateStats([document("pages/map.md", undated), document("notes/raw.md", { date: "2022-04-21" })]), { min: Date.UTC(2022, 3, 21), max: Date.UTC(2022, 3, 21) });
});

test("diversity removes repeated maps/near-verbatim echoes, not distinct raw evidence or citations", () => {
  const inputs = [
    result("pages/map.md", prose + " See [source](../notes/raw.md).", true),
    result("pages/map.md", "A second chunk about another port.", true),
    result("pages/copy.md", prose + " See [source](../notes/raw.md).", true),
    result("notes/echo.md", prose + " See [source](../notes/raw.md)."),
    result("notes/one-detail.md", prose + " See [source](../notes/raw.md). 7"),
    result("notes/raw.md", "Harbor migration port 8181 failed on node 7; restore checksum 2fa6 before retrying."),
    result("notes/raw.md", "The distinct backup evidence records a 17 minute delay and the rollback captain."),
  ];
  assert.deepEqual(diversifyResults(inputs, "normal").map((hit) => hit.provenance.file), ["pages/map.md", "notes/one-detail.md", "notes/raw.md", "notes/raw.md"]);
  assert.equal(diversifyResults(inputs, "deep").length, inputs.length);
});

async function fixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-dream-retrieval-"));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  const embed = process.env.JUMPYBRAIN_QMD_EMBED;
  try {
    const binary = path.join(root, "fake-qmd.cjs");
    await writeFile(binary, `#!${process.execPath}\nconst fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
if (['search', 'query'].includes(args[0])) {
  const collection = args[args.indexOf('-c') + 1];
  const rows = JSON.parse(fs.readFileSync('rows.json', 'utf8'))[collection] || [];
  const n = Number(args[args.indexOf('-n') + 1]);
  console.log(JSON.stringify(rows.slice(0, n).map(row => ({ ...row, file: 'qmd://' + collection + '/' + row.file }))));
} else console.log('[]');\n`);
    await chmod(binary, 0o755);
    process.env.JUMPYBRAIN_QMD_BIN = binary;
    process.env.JUMPYBRAIN_QMD_EMBED = "0";
    await callback(root);
  } finally {
    if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous;
    if (embed === undefined) delete process.env.JUMPYBRAIN_QMD_EMBED; else process.env.JUMPYBRAIN_QMD_EMBED = embed;
    await rm(root, { recursive: true, force: true });
  }
}

async function put(root, file, marker, body = prose) {
  const absolutePath = path.join(root, file);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const text = `---\ndream: ${marker}\ndate: 2022-04-21\n---\n${body}\n`;
  await writeFile(absolutePath, text);
  const parsed = parseFrontmatter(text);
  return { absolutePath, relativePath: file, frontmatter: parsed.frontmatter, bodyStartLine: parsed.bodyStartLine };
}

async function calls(root) {
  return (await readFile(path.join(root, "calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
}

const row = (file, score, snippet = prose, line = 5) => ({ file, score, snippet, line });

test("scoped supplemental candidates survive a raw-heavy cutoff, preserve originals, and have bounded cost", async () => fixture(async (root) => {
  const map = await put(root, "notes/map.md", "true"); // not restricted to pages/
  const ordinary = await put(root, "pages/ordinary.md", '"false"');
  const docs = [map, ordinary];
  for (let i = 0; i < 80; i++) docs.push(await put(root, `sessions/raw-${i}.md`, "false"));
  const raw = docs.slice(2).map((doc, i) => row(doc.relativePath, 0.7, `${prose} Distinct raw port record ${i} has diagnostic code x${i}.`));
  const bodyBefore = await readFile(map.absolutePath, "utf8");
  await writeFile(path.join(root, "rows.json"), JSON.stringify({ jumpybrain: raw, "jumpybrain-dreams": [row(map.relativePath, 0)] }));
  await buildQmdIndex(root, docs);
  assert.equal(await readFile(path.join(root, ".jumpybrain/qmd-dreams/notes/map.md"), "utf8"), bodyBefore);
  await assert.rejects(readFile(path.join(root, ".jumpybrain/qmd-dreams/pages/ordinary.md")), { code: "ENOENT" });
  const found = await searchQmdIndex(root, "harbor migration", 5);
  assert.equal(found[0].provenance.file, map.relativePath);
  assert.equal(found[0].provenance.metadata.dream, true);
  assert.equal(found[0].provenance.metadata.date, "2022-04-21");
  assert.ok(found[0].scoreBreakdown.dreamBoost > 0.4);
  assert.ok(found.some((hit) => hit.provenance.file.startsWith("sessions/")));
  assert.equal(await readFile(map.absolutePath, "utf8"), bodyBefore);
  const supplemental = (await calls(root)).filter((args) => args[0] === "search" && args.includes("jumpybrain-dreams"));
  assert.ok(supplemental.length > 0 && supplemental.length <= 2);
  assert.ok(supplemental.every((args) => Number(args[args.indexOf("-n") + 1]) <= 24));
  const before = (await calls(root)).length;
  const deep = await searchQmdIndex(root, "harbor migration", 5, { depth: "deep" });
  assert.ok(deep.every((hit) => hit.provenance.file.startsWith("sessions/")));
  assert.ok((await calls(root)).slice(before).every((args) => !args.includes("jumpybrain-dreams")));
  await searchQmdIndex(root, "harbor migration", 1000000);
  const searches = (await calls(root)).filter((args) => ["query", "search"].includes(args[0]));
  assert.ok(searches.every((args) => Number(args[args.indexOf("-n") + 1]) <= 160));
}));

test("unrelated supplemental maps are rejected, duplicates merge, and deep preserves same-file detail IDs", async () => fixture(async (root) => {
  const map = await put(root, "pages/a-long-shared-prefix-map.md", "true");
  const unrelated = await put(root, "pages/unrelated.md", "true");
  const raw = await put(root, "notes/a-long-shared-prefix-raw.md", "false");
  const details = [row(raw.relativePath, 0.9, prose + " Code AX17 uniquely identifies the first diagnostic.", 5), row(raw.relativePath, 0.8, prose + " Code BY92 uniquely identifies the second diagnostic.", 30)];
  await writeFile(path.join(root, "rows.json"), JSON.stringify({ jumpybrain: [...details, row(map.relativePath, 0.6)], "jumpybrain-dreams": [row(unrelated.relativePath, 1, "The pastry cookbook provides instructions for flaky apple pies and sugared fruit fillings. ".repeat(3)), row(map.relativePath, 0.6)] }));
  await buildQmdIndex(root, [map, raw, unrelated]);
  const normal = await searchQmdIndex(root, "harbor migration", 10);
  assert.equal(normal[0].provenance.file, map.relativePath);
  assert.equal(normal.filter((hit) => hit.provenance.file === map.relativePath).length, 1);
  assert.ok(!normal.some((hit) => hit.provenance.file === unrelated.relativePath));
  const deep = await searchQmdIndex(root, "harbor migration", 10, { depth: "deep" });
  assert.equal(deep[0].provenance.file, raw.relativePath);
  assert.equal(deep.filter((hit) => hit.provenance.file === raw.relativePath).length, 2);
  assert.equal(new Set(deep.map((hit) => hit.id)).size, deep.length);
  const historical = await searchQmdIndex(root, "exact harbor migration 2022", 10, { depth: "shallow" });
  assert.equal(historical[0].provenance.file, raw.relativePath);
  assert.ok(historical.every((hit) => hit.scoreBreakdown.dreamBoost === 0));
}));

test("legacy index without dreams preserves ordinary pages and raw fallback without extra queries", async () => fixture(async (root) => {
  const page = await put(root, "pages/ordinary.md", "false");
  const raw = await put(root, "notes/raw.md", "false");
  await writeFile(path.join(root, "rows.json"), JSON.stringify({ jumpybrain: [row(page.relativePath, 0.75), row(raw.relativePath, 0.65)] }));
  await buildQmdIndex(root, [page, raw]);
  const found = await searchQmdIndex(root, "harbor migration", 5);
  assert.equal(found[0].provenance.file, page.relativePath);
  assert.equal(found.length, 2);
  assert.ok((await calls(root)).every((args) => !args.includes("jumpybrain-dreams")));
}));

test("reindexing refreshes dream snapshots and legacy manifests need no supplemental collection", async () => fixture(async (root) => {
  let map = await put(root, "pages/map.md", "true");
  await writeFile(path.join(root, "rows.json"), JSON.stringify({ jumpybrain: [row(map.relativePath, 0.6)], "jumpybrain-dreams": [row(map.relativePath, 0.6)] }));
  await buildQmdIndex(root, [map]);
  const manifestPath = path.join(root, ".jumpybrain/index.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.dreamCollection; // Older derived indexes are still readable.
  await writeFile(manifestPath, JSON.stringify(manifest));
  const before = (await calls(root)).length;
  const old = await searchQmdIndex(root, "harbor migration", 5);
  assert.equal(old[0].provenance.metadata.dream, true);
  assert.ok(old[0].scoreBreakdown.dreamBoost > 0);
  assert.ok((await calls(root)).slice(before).every((args) => !args.includes("jumpybrain-dreams")));
  map = await put(root, "pages/map.md", "false");
  await buildQmdIndex(root, [map]);
  await assert.rejects(readFile(path.join(root, ".jumpybrain/qmd-dreams/pages/map.md")), { code: "ENOENT" });
  assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).dreamCollection, undefined);
  const ordinary = await searchQmdIndex(root, "harbor migration", 5);
  assert.equal(ordinary[0].scoreBreakdown.dreamBoost, 0);
}));

test("snippet repair reads only a bounded prefix and preserves later QMD locations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-dream-snippet-"));
  try {
    const file = path.join(root, "large.md");
    await writeFile(file, "Opening evidence\n" + "padding\n".repeat(20000) + "harbor migration beyond repair budget\n");
    const doc = { ...document("large.md"), absolutePath: file };
    const repaired = await snippetFromOriginalBody(doc, "harbor migration");
    assert.ok(!repaired.snippet.includes("beyond repair budget"));
    const later = await neighborSnippetFromOriginal(doc, 20002, 20002);
    assert.equal(later.snippet, "");
    assert.equal(later.lineStart, 20002);
  } finally { await rm(root, { recursive: true, force: true }); }
});
