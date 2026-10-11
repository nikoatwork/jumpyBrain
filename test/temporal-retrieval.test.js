import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { evidenceDate, evidenceInInterval, resolveTemporalQuery } from "../dist/core/retrieval-policy/temporal.js";
import { readMarkdownDocuments, searchMemory, compactSearchMemory } from "../dist/runtime/index.js";
import { manifestPath } from "../dist/adapters/qmd/qmd-driver.js";
import { installFakeQmd } from "./fake-qmd-helper.js";

const interval = query => resolveTemporalQuery(query);
test("strict UTC bounds: inclusive leap days, exclusive instants, offsets and pinned relative days", () => {
  const leap = interval({ from: "2024-02-29", to: "2024-02-29" });
  assert.equal(leap.from, "2024-02-29T00:00:00.000Z");
  assert.equal(leap.toExclusive, "2024-03-01T00:00:00.000Z");
  const inside = value => evidenceInInterval({ basis: "declared", value }, leap);
  assert.equal(inside("2024-02-29"), true);
  assert.equal(inside("2024-03-01T01:59:59+02:00"), true);
  assert.equal(inside("2024-03-01T02:00:00+02:00"), false);
  assert.equal(inside("2024-02-28T23:59:59Z"), false);
  assert.equal(interval({ from: "2024-02-29T03:00:00+03:00", to: "2024-03-01T00:00:00Z" }).from, leap.from);
  assert.deepEqual(interval({ from: "t-1d", to: "t-0d", referenceDate: "2024-03-01" }),
    { ...interval({ from: "2024-02-29", to: "2024-03-01" }), referenceDate: "2024-03-01" });
  assert.equal(interval({ from: "0001-01-01", to: "9999-12-31" }).toExclusive, "+010000-01-01T00:00:00.000Z");
  assert.equal(interval({ order: "chronological" }).order, "chronological");
  for (const bad of [null, [], {}, { from: true }, { from: "2025-02-29" }, { to: "0000-01-01" },
    { from: "2024-02-30T00:00:00Z" }, { from: "2024-01-01T24:00:00Z" }, { from: "2024-01-01T00:00:00" },
    { from: "2024-01-01 00:00" }, { from: "2024-03-02", to: "2024-03-01" },
    { from: "2024-01-01", order: null }, { from: "2024-01-01T00:00:00.0001Z" },
    { from: "2024-03-01T00:00:00Z", to: "2024-03-01T00:00:00Z" }, { from: "t-1d" },
    { from: "t-1d", referenceDate: "2024-02-30" }, { from: "t-1d", referenceDate: "0001-01-01" },
    { to: "t-99999999999999999999d", referenceDate: "2024-03-01" }, { order: "latest" }, { unknown: true }]) {
    assert.throws(() => interval(bad), { code: "invalid_temporal" }, JSON.stringify(bad));
  }
});

test("evidence provenance does not confuse edit/import/written dates, invalid declarations, or multi-period synthesis", () => {
  assert.deepEqual(evidenceDate("notes/a.md", { date: "2020-02-29", created_at: "2026-01-01", updated_at: "2026-02-01" }), { basis: "declared", value: "2020-02-29" });
  assert.deepEqual(evidenceDate("sessions/2020_02_29-import.md", { created_at: "2026-01-01" }), { basis: "filename", value: "2020-02-29" });
  assert.deepEqual(evidenceDate("notes/2020-02-29.md", { type: "session" }), { basis: "filename", value: "2020-02-29" });
  for (const metadata of [{}, { created_at: "2026-01-01" }, { createdAt: "2026-01-01" }, { updated_at: "2026-01-01" }]) {
    assert.equal(evidenceDate("notes/2020-02-29.md", metadata).basis, "unknown");
  }
  for (const date of ["", "impossible", "2023-02-29", "2020-01-01T12:00:00", true]) {
    assert.deepEqual(evidenceDate("sessions/2020-02-29.md", { date, created_at: "2026-01-01" }), { basis: "unknown", reason: "invalid" });
  }
  for (const metadata of [{ dream: true }, { source: "jumpybrain-process" }]) {
    assert.deepEqual(evidenceDate("sessions/2020-02-29.md", metadata), { basis: "unknown", reason: "synthesis" });
  }
  assert.equal(evidenceDate("sessions/2023-02-29.md", {}).reason, "invalid");
  assert.equal(evidenceInInterval({ basis: "unknown", reason: "missing" }, interval({ from: "2020-01-01" })), false);
  assert.equal(evidenceInInterval({ basis: "unknown", reason: "missing" }, interval({ order: "chronological" })), true);
});

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-temporal-retrieval-"));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  try {
    const { bin } = await installFakeQmd(root);
    await writeFile(bin, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);if(fs.existsSync('fail'))process.exit(1);const c=args[args.indexOf('-c')+1];const n=Number(args[args.indexOf('-n')+1]);const rows=JSON.parse(fs.readFileSync('rows.json'))[c]||[];console.log(JSON.stringify(rows.slice(0,n).map(r=>({...r,file:'qmd://'+c+'/'+r.file}))));`);
    await chmod(bin, 0o755); process.env.JUMPYBRAIN_QMD_BIN = bin;
    const put = async (file, metadata = {}, body = "Helios calibration remains provisional, NOT production approved.") => {
      const text = `---\n${Object.entries(metadata).map(([k,v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n${body}\n`;
      await mkdir(path.dirname(path.join(root,file)), { recursive: true }); await writeFile(path.join(root,file), text);
      return { file, score: 0.8, snippet: body, line: text.split("\n").length - 2 };
    };
    const index = async (rows = [], dreams = []) => {
      await mkdir(path.dirname(manifestPath(root)), { recursive: true });
      await writeFile(path.join(root,"rows.json"), JSON.stringify({ jumpybrain: rows, "jumpybrain-dreams": dreams }));
      await writeFile(manifestPath(root), JSON.stringify({ version: 1, root, qmdCollection: "jumpybrain", dreamCollection: "jumpybrain-dreams", generatedAt: "2026-01-01T00:00:00Z", documents: await readMarkdownDocuments(root) }));
    };
    await run({ root, put, index, search: (temporal, limit = 5, depth = "normal", query = "Helios calibration") => searchMemory(root, query, limit, { temporal, depth }) });
  } finally {
    if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous;
    await rm(root, { recursive: true, force: true });
  }
}
const files = packet => packet.results.map(r => r.provenance.file);

test("in-range evidence beyond original cutoff backfills before limit across depths, titles and dream supplements", async () => fixture(async ({ put,index,search }) => {
  const out = await put("notes/exact.md", { title: "Helios calibration", date: "2026-01-01" });
  const dream = await put("notes/dream.md", { dream: true, date: "2026-01-01" });
  const old = await put("notes/target.md", { date: "2020-02-29", updated_at: "2026-01-01" });
  const invalid = await put("notes/invalid.md", { date: "2020-02-30" });
  const written = await put("notes/created.md", { created_at: "2020-02-29" });
  const undatedDream = await put("sessions/2020-02-29-map.md", { dream: true, created_at: "2020-02-29" });
  const recent = [];
  for (let i=0;i<45;i++) recent.push(await put(`notes/new-${i}.md`, { date: "2026-01-01" }));
  await index([out, ...recent, old, invalid, written], [dream, undatedDream]);
  assert.equal(files(await search(undefined,1))[0], out.file);
  for (const depth of ["normal", "shallow", "deep"]) {
    const result = await search({ from: "2020-02-29", to: "2020-02-29" },1,depth);
    assert.deepEqual(files(result), [old.file]);
    assert.equal(result.temporal.coverage.backfilledDocuments,1);
    assert.equal(result.temporal.coverage.excludedInvalid,1);
    assert.equal(result.temporal.coverage.excludedUndated,2);
    assert.equal(result.results[0].provenance.evidenceDate.value,"2020-02-29");
    assert.equal(result.retrieval.status,"partial");
  }
}));

test("chronology sorts a relevance-selected set, preserves declared conflicts and undated items last", async () => fixture(async ({ put,index,search }) => {
  const older = await put("notes/a.md", { date: "2020-01-01", conflicts_with: ["notes/z.md"] });
  const newer = await put("notes/z.md", { date: "2025-01-01", supersedes: "notes/a.md", dream: true });
  const tie = await put("notes/b.md", { date: "2020-01-01" });
  const undated = await put("notes/undated.md");
  const weak = await put("notes/weak.md", { date: "2010-01-01" }, "Irrelevant kitchen facts.");
  await index([newer, older, tie, undated, { ...weak, score: 0 }]);
  const relevance = await search({ from: "2000-01-01" },3);
  const chronological = await search({ from: "2000-01-01", order: "chronological" },3);
  assert.deepEqual(new Set(files(chronological)),new Set(files(relevance)));
  assert.deepEqual(files(chronological),[older.file,tie.file,newer.file]);
  assert.deepEqual(chronological.results[0].provenance.metadata.conflicts_with,["notes/z.md"]);
  assert.equal(chronological.results[2].provenance.metadata.supersedes,"notes/a.md");
  assert.deepEqual(files(await search({ order:"chronological" },4)),[older.file,tie.file,newer.file,undated.file]);
}));

test("bounded discovery reports exhausted budget, unrelated backfill is not evidence, and backend failure is not no-answer", async () => fixture(async ({ root,put,index,search }) => {
  for(let i=0;i<70;i++) await put(`notes/${String(i).padStart(3,"0")}.md`, { date:"2020-01-01" }, "Bread recipes and culinary instructions.");
  await put("notes/zzz-target.md", { date:"2020-01-01" });
  await index();
  const result = await search({ from:"2020-01-01",to:"2020-01-01" });
  assert.deepEqual(result.results,[]);
  assert.equal(result.temporal.coverage.backfillBudget,64);
  assert.equal(result.temporal.coverage.backfilledDocuments,64);
  assert.equal(result.temporal.coverage.unvisitedDocuments,7);
  assert.ok(result.retrieval.warnings.includes("temporal_candidate_budget_exhausted"));
  await writeFile(path.join(root,"fail"),"1");
  await assert.rejects(search({ from:"2020-01-01" }),/no backend query succeeded/);
}));

test("lexical backfill cannot match a different topic through a generic shared word", async () => fixture(async ({ put,index,search }) => {
  await put("pages/other.md", { title: "Orchard status map", date: "2020-01-01", dream: true }, "Orchard status map: provisional context only.");
  await put("pages/target.md", { title: "Glacier status map", dream: true, created_at: "2020-01-01" }, "Glacier status map: sources span multiple years.");
  await index();
  const result = await search({ from: "2020-01-01", to: "2020-01-01" }, 5, "normal", "Glacier status map");
  assert.deepEqual(result.results, []);
  assert.equal(result.temporal.coverage.backfilledDocuments, 1);
}));

test("metadata changes and malformed headers never return stale relationships or filename-dated dreams", async () => fixture(async ({ root,put,index,search }) => {
  const temporal = { from: "2020-01-01", to: "2020-01-01" };
  for (const change of [{ conflicts_with: "Changed claim" }, { supersedes: "Changed predecessor" }, { title: "Changed title" },
    { id: "mem_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }, { extra: "new header line" }, { conflicts_with: undefined }]) {
    const metadata = { date: "2020-01-01", conflicts_with: "Original claim", supersedes: "Original predecessor", title: "Helios calibration" };
    const row = await put("notes/source.md", metadata);
    await index([row]);
    const changed = { ...metadata, ...change };
    for (const key of Object.keys(changed)) if (changed[key] === undefined) delete changed[key];
    await put("notes/source.md", changed);
    const result = await search(temporal);
    assert.deepEqual(result.results, [], JSON.stringify(change));
    assert.ok(result.retrieval.warnings.includes("source_changed"));
    const compact = await compactSearchMemory(root, "Helios calibration", 5, { temporal });
    assert.deepEqual(compact.passages, []);
    assert.ok(compact.retrieval.warnings.includes("source_changed"));
  }
  await rm(path.join(root,"notes/source.md"));
  await mkdir(path.join(root,"sessions"));
  const file = "sessions/2020-01-01.md";
  for (const opener of ["---", "---  ", "  ---"]) for (const large of [false, true]) {
    await writeFile(path.join(root,file), `${opener}\ndream: true\nHelios calibration\n${large ? "x".repeat(140000) : ""}`);
    await index([{file,score:1,snippet:"Helios calibration",line:3}]);
    const result = await search(temporal);
    assert.deepEqual(result.results, [], `${opener}/${large}`);
    assert.ok(result.retrieval.warnings.includes("source_changed"));
    assert.deepEqual((await compactSearchMemory(root,"Helios calibration",5,{temporal})).passages,[]);
  }
}));

test("source date edits and missing sources fail closed even for ID-less rich temporal results", async () => fixture(async ({ root,put,index,search }) => {
  const original = await put("notes/source.md", { date:"2020-01-01" });
  await index([original]);
  await put("notes/source.md", { date:"2026-01-01" });
  const stale = await search({ from:"2020-01-01",to:"2020-01-01" });
  assert.equal(stale.results.length,0);
  assert.ok(stale.retrieval.warnings.includes("source_changed"));
  await rm(path.join(root,"notes/source.md"));
  assert.ok((await search({ from:"2020-01-01" })).retrieval.warnings.includes("source_changed"));
}));
