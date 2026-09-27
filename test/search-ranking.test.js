import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseFrontmatter } from "../dist/core/frontmatter.js";
import { buildQmdIndex, searchQmdIndex } from "../dist/adapters/qmd/index.js";
import * as ranking from "../dist/adapters/qmd/qmd-ranking.js";

const prose = "An entrepreneur evaluates customer demand and sustainable business opportunities through interviews and small experiments. Independent founders compare distribution options, operating costs, cash reserves and ownership goals.";
const doc = (frontmatter = {}, relativePath = "notes/example.md") => ({ frontmatter, relativePath });

async function fixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-title-ranking-"));
  const saved = { JUMPYBRAIN_QMD_BIN: process.env.JUMPYBRAIN_QMD_BIN, JUMPYBRAIN_QMD_EMBED: process.env.JUMPYBRAIN_QMD_EMBED };
  try {
    const binary = path.join(root, "fake-qmd.cjs");
    await writeFile(binary, `#!${process.execPath}\nconst fs = require('node:fs');
const args = process.argv.slice(2);
if (['search', 'query'].includes(args[0])) {
  const c = args[args.indexOf('-c') + 1];
  const n = Number(args[args.indexOf('-n') + 1]);
  const rows = JSON.parse(fs.readFileSync('rows.json', 'utf8'))[c] || [];
  console.log(JSON.stringify(rows.slice(0,n).map(row => ({...row, file: 'qmd://' + c + '/' + row.file}))));
} else console.log('[]');\n`);
    await chmod(binary, 0o755);
    process.env.JUMPYBRAIN_QMD_BIN = binary;
    process.env.JUMPYBRAIN_QMD_EMBED = "0";
    const documents = [];
    const put = async (file, metadata = {}, body = prose) => {
      const absolutePath = path.join(root, file);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      const text = `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n${body}\n`;
      await writeFile(absolutePath, text);
      const parsed = parseFrontmatter(text);
      const document = { absolutePath, relativePath: file, ...parsed };
      documents.push(document);
      return { file, score: 0.7, snippet: body, line: document.bodyStartLine };
    };
    const index = async (rows = [], dreams = []) => {
      await writeFile(path.join(root, "rows.json"), JSON.stringify({ jumpybrain: rows, "jumpybrain-dreams": dreams }));
      await buildQmdIndex(root, documents);
    };
    await callback({ root, put, index, search: (query = "entrepreneur", limit = 24, depth = "normal") => searchQmdIndex(root, query, limit, { depth }) });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
}

const files = (hits) => hits.map((hit) => hit.provenance.file);

test("ordinary search moves newer relevant evidence above a slightly stronger old hit, not strong evidence", async () => fixture(async ({ put, index, search }) => {
  const old = await put("notes/old.md", { date: "2020-01-01" });
  const recent = await put("notes/recent.md", { date: "2026-01-01" });
  const unrelated = await put("notes/unrelated.md", { date: "2026-01-01" }, "Recipes for apples, fruit pies, pastry crusts and sweet fillings. ".repeat(4));
  const undated = await put("notes/undated.md");
  await index([{ ...old, score: 1 }, { ...old, score: 0.7 }, { ...recent, score: 0.95 }, { ...unrelated, score: 0.8 }, undated]);
  const hits = await search();
  assert.deepEqual(files(hits), [recent.file, old.file, undated.file, unrelated.file]);
  assert.equal(hits[0].scoreBreakdown.temporalRelevance, 0.18);
  assert.equal(hits.find((hit) => hit.provenance.file === unrelated.file).scoreBreakdown.temporalRelevance, 0);
  assert.equal(hits.find((hit) => hit.provenance.file === undated.file).scoreBreakdown.temporalRelevance, 0);
  await index([{ ...old, score: 1 }, { ...recent, score: 0.7 }, { ...unrelated, score: 0.8 }]);
  assert.equal((await search())[0].provenance.file, old.file, "a 0.3 relevance gap exceeds the recency budget");
}));

test("exact title survives body-heavy candidate cutoff and every depth/dream preference", async () => fixture(async ({ put, index, search }) => {
  const exact = await put("sessions/target.md", { title: "Entrepreneur", date: "2001-01-01" });
  const map = await put("pages/map.md", { title: "Business map", dream: true, confidence: "user-reviewed", date: "2026-01-01" });
  const raw = [];
  for (let n = 0; n < 45; n++) raw.push(await put(`notes/mention-${n}.md`));
  await index([{ ...map, score: 1 }, ...raw, exact], [{ ...map, score: 1 }]);
  for (const depth of ["normal", "shallow", "deep"]) {
    const hits = await search("entrepreneur", 1, depth); // Only 40 ordinary candidates.
    assert.equal(hits[0].provenance.file, exact.file);
    assert.equal(hits[0].scoreBreakdown.qmdScore, 0);
    assert.equal(hits[0].scoreBreakdown.titleMatchBoost, 4);
  }
}));

test("non-exact title coverage is a bounded preference, not an exact-navigation tier", async () => fixture(async ({ put, index, search }) => {
  const body = await put("notes/body.md", { title: "Customer calls" });
  const titled = await put("notes/handbook.md", { title: "Entrepreneur handbook" });
  await index([{ ...body, score: 1 }, { ...titled, score: 0.9 }]);
  const hits = await search();
  assert.equal(hits[0].provenance.file, titled.file);
  assert.equal(hits[0].scoreBreakdown.titleMatchBoost, 0.2);
  await index([{ ...body, score: 1 }, { ...titled, score: 0.6 }]);
  assert.equal((await search())[0].provenance.file, body.file);
}));

test("filename fallback and empty title-only pages are searchable without QMD hits", async () => fixture(async ({ put, index, search }) => {
  const fallback = await put("pages/entrepreneur.md", {}, "Independent business building.");
  await put("notes/other.md", { title: "Entrepreneur" }, "");
  await put("archive/entrepreneur.md", { title: "Something else" });
  await index();
  const hits = await search();
  assert.deepEqual(new Set(files(hits)), new Set([fallback.file, "notes/other.md"]));
  assert.equal((await search("entrepreneur.md"))[0].provenance.file, fallback.file);
}));

test("duplicate exact titles have deterministic path ties and bounded supplementation", async () => fixture(async ({ put, index, search, root }) => {
  for (let n = 29; n >= 0; n--) await put(`pages/${String(n).padStart(2, "0")}.md`, { title: "Entrepreneur" });
  await index();
  const expected = Array.from({ length: 24 }, (_, n) => `pages/${String(n).padStart(2, "0")}.md`);
  assert.deepEqual(files(await search("entrepreneur", 100)), expected);
  assert.deepEqual(files(await search("  ENTREPRENEUR  ", 100)), expected);
  await rm(path.join(root, expected[0]));
  assert.equal((await search())[0].provenance.file, expected[1], "a stale missing title supplement must not fail the query");
}));

test("title normalization preserves punctuation, uses filename only without a usable title, and bounds partial relevance", () => {
  for (const query of ["entrepreneur", "  ENTREPRENEUR ", "Ｅｎｔｒｅｐｒｅｎｅｕｒ"]) {
    assert.equal(ranking.isExactTitleMatch(query, doc({ title: "Entrepreneur" })), true);
  }
  assert.equal(ranking.isExactTitleMatch("startup ideas", doc({ title: " Startup\n ideas " })), true);
  assert.equal(ranking.isExactTitleMatch("C", doc({ title: "C++" })), false);
  assert.equal(ranking.isExactTitleMatch("", doc({ title: " " })), false);
  assert.equal(ranking.isExactTitleMatch("startup ideas.md", doc({}, "pages/startup-ideas.md")), true);
  assert.equal(ranking.isExactTitleMatch("entrepreneur", doc({ title: "Renamed" }, "pages/entrepreneur.md")), false);
  for (const title of [undefined, " ", 42]) assert.equal(ranking.isExactTitleMatch("entrepreneur", doc({ title }, "pages/entrepreneur.md")), true);
  assert.equal(ranking.titleMatchBoostFor("entrepreneur", doc({ title: "Entrepreneur handbook" })), 0.2);
  assert.equal(ranking.titleMatchBoostFor("entrepreneur", doc({ title: "Entrepreneurship" })), 0);
});

test("date semantics exclude edits, missing/invalid dates and undated dreams", () => {
  assert.equal(ranking.documentTime({ date: "2020-01-01", created_at: "2025-01-01", updated_at: "2026-01-01" }), Date.UTC(2020, 0, 1));
  assert.equal(ranking.documentTime({ created_at: "2020-01-01", updated_at: "2026-01-01" }), Date.UTC(2020, 0, 1));
  for (const metadata of [{}, { updated_at: "2026-01-01" }, { date: "2026-02-30", created_at: "2026-01-01" }, { dream: true, created_at: "2026-01-01" }]) {
    assert.equal(ranking.documentTime(metadata), undefined);
  }
  for (const date of ["2026-02-30T00:00:00Z", "2026-02-30T12:30:00+05:00", "2026-02-30 12:30", "2026-01-01T24:00:00Z"]) {
    assert.equal(ranking.documentTime({ date }), undefined, date);
  }
  assert.equal(ranking.documentTime({ date: "2024-02-29T23:30:00-02:00" }), Date.UTC(2024, 2, 1, 1, 30));
  assert.equal(ranking.documentTime({ date: "2026-01-01 12:30" }), Date.UTC(2026, 0, 1, 12, 30));
  const stats = { min: Date.UTC(2020, 0, 1), max: Date.UTC(2026, 0, 1) };
  for (const metadata of [{}, { date: "invalid" }, { updated_at: "2026-01-01" }, { dream: true, created_at: "2026-01-01" }]) {
    assert.equal(ranking.temporalBoostFor("entrepreneur", metadata, stats, 1), 0);
  }
  assert.equal(ranking.temporalBoostFor("entrepreneur", { date: "2026-01-01" }, stats, 0), 0);
  assert.equal(ranking.temporalBoostFor("entrepreneur", { date: "2026-01-01" }, { min: stats.max, max: stats.max }, 1), 0);
  assert.equal(ranking.dreamRelevance("entrepreneur hiring pipeline", "entrepreneur", {}, 1), 0);
  assert.equal(ranking.dreamRelevance("entrepreneur", prose, {}, 0.1), 0);
});

test("historical and date-scoped queries do not inherit ordinary recency", async () => fixture(async ({ put, index, search }) => {
  const old = await put("notes/old.md", { date: "2020-01-01" });
  const fresh = await put("notes/new.md", { date: "2026-01-01" });
  await index([{ ...fresh, score: 1 }, { ...old, score: 1 }]);
  assert.equal((await search("first entrepreneur"))[0].provenance.file, old.file);
  assert.equal((await search("original entrepreneur"))[0].provenance.file, old.file);
  assert.equal((await search("entrepreneur before 2022-01-01"))[0].provenance.file, old.file);
  assert.equal((await search("entrepreneur after 2022-01-01"))[0].provenance.file, fresh.file);
  assert.equal((await search("latest entrepreneur"))[0].provenance.file, fresh.file);
  for (const query of ["historical entrepreneur", "entrepreneur 2020", "entrepreneur after the refactor", "entrepreneur during launch", "previous entrepreneur", "past entrepreneur", "old entrepreneur"]) {
    const hits = await search(query);
    assert.ok(hits.every((hit) => hit.scoreBreakdown.temporalRelevance === 0), query);
  }
}));
