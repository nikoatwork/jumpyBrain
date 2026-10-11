import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { qmdLexQueries, searchWithQmdCli, tokenize } from "../dist/adapters/qmd/qmd-query.js";
import { searchQmdIndex, manifestPath } from "../dist/adapters/qmd/qmd-driver.js";
import { withQmdOperation } from "../dist/adapters/qmd/qmd-execution.js";
import { readMarkdownDocuments } from "../dist/runtime/index.js";
import { resolveTemporalQuery } from "../dist/core/retrieval-policy/temporal.js";
import { installFakeQmd } from "./fake-qmd-helper.js";

const row = (name, snippet) => ({ file: `notes/${name}.md`, snippet, score: 0, line: 1 });
async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jb-keyword-relaxation-"));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  try {
    const { bin } = await installFakeQmd(root);
    // AND-faithful: every supplied token must occur, unlike OR-like lifecycle
    // fixtures. No stemming/synonym expansion can hide an absent-token failure.
    await writeFile(bin, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2), query = args[1], command = args[0];
const state = JSON.parse(fs.readFileSync('keyword-state.json', 'utf8'));
fs.appendFileSync('keyword-calls.jsonl', JSON.stringify({command, query})+'\\n');
if (state.failAll || (state.failQueries || []).includes(query)) process.exit(1);
if ((state.malformedQueries || []).includes(query)) { console.log('invalid JSON'); process.exit(0); }
const words = value => value.toLowerCase().split(/[^a-z0-9._/-]+/).map(word => word.replace(/^[._/]+|[._/]+$/g, '')).filter(Boolean);
const terms = words(query);
const negatives = terms.filter(term => term.startsWith('-')).map(term => term.slice(1));
const positives = terms.filter(term => !term.startsWith('-'));
const phrases = [...query.matchAll(/"([^"]+)"/g)].map(match => match[1].toLowerCase());
const rows = command === 'query' ? (state.semanticRows || []) : state.rows.filter(row => terms.length
  && positives.every(term => words(row.snippet).includes(term))
  && negatives.every(term => !words(row.snippet).includes(term))
  && phrases.every(phrase => row.snippet.toLowerCase().includes(phrase)));
const c = args[args.indexOf('-c')+1], n = Number(args[args.indexOf('-n')+1]);
const output = () => console.log(rows.length ? JSON.stringify(rows.slice(0,n).map(row => ({...row, file:'qmd://'+c+'/'+row.file}))) : 'No results found.');
if ((state.delayQueries || []).includes(query)) setTimeout(output, 5000); else output();
`);
    await chmod(bin, 0o755);
    process.env.JUMPYBRAIN_QMD_BIN = bin;
    const configure = async (rows = [], extra = {}) => {
      await writeFile(path.join(root, "keyword-state.json"), JSON.stringify({ rows, ...extra }));
      await writeFile(path.join(root, "keyword-calls.jsonl"), "");
    };
    const calls = async () => (await readFile(path.join(root, "keyword-calls.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    const search = async (query, options = {}) => {
      const outcome = { status: "complete", warnings: [] };
      const results = await searchWithQmdCli(root, query, 3, { semantic: false, outcome, ...options });
      return { results, outcome, calls: await calls() };
    };
    const generation = async (notes) => {
      await mkdir(path.join(root, "notes"), { recursive: true });
      for (const note of notes) await writeFile(path.join(root, note.file), `---\ndate: ${note.date}\n${note.title ? `title: ${note.title}\n` : ""}---\n${note.snippet}\n`);
      await mkdir(path.dirname(manifestPath(root)), { recursive: true });
      await writeFile(manifestPath(root), JSON.stringify({ version: 1, root, qmdCollection: "jumpybrain", generatedAt: "2026-01-01T00:00:00Z", documents: await readMarkdownDocuments(root) }));
    };
    await run({ root, configure, calls, search, generation });
  } finally {
    if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous;
    await rm(root, { recursive: true, force: true });
  }
}
const names = packet => packet.results.map(candidate => candidate.file);
const relaxed = packet => packet.outcome.warnings.includes("keyword_query_relaxed");

test("AND strict success has precedence; an absent term relaxes only after successful empty discovery", async () => fixture(async ({ configure, search }) => {
  const target = row("dispatch", "Dispatch approval is provisional, NOT authorized for production.");
  const distractor = row("catalog", "Dispatch catalog lists vehicle names.");
  await configure([target, distractor]);
  const strict = await search("dispatch approval");
  assert.deepEqual(names(strict), [target.file]);
  assert.equal(relaxed(strict), false);
  assert.deepEqual(strict.calls.map(call => call.query), qmdLexQueries("dispatch approval"));
  await configure([target, distractor]);
  const fallback = await search("dispatch unicorn");
  assert.deepEqual(names(fallback), [target.file, distractor.file]);
  assert.equal(fallback.outcome.status, "partial");
  assert.equal(relaxed(fallback), true);
  assert.deepEqual(fallback.calls.map(call => call.query), ["dispatch unicorn", "dispatch", "unicorn"]);
  assert.match(fallback.results[0].snippet, /NOT authorized/);
}));

test("single words, plurals, short acronyms and one-letter domain terms remain searchable", async () => fixture(async ({ configure, search }) => {
  for (const query of ["AI", "DNS", "R", "C", "apples", "quartz"]) {
    await configure([row("short", `${query} evidence stays qualified.`)]);
    const result = await search(query);
    assert.deepEqual(names(result), ["notes/short.md"], query);
    assert.equal(result.calls.length, 1, query);
    assert.equal(relaxed(result), false, query);
  }
  for (const query of ["AI phantom", "DNS phantom", "R phantom"]) {
    await configure([row("short", `${query.split(" ")[0]} evidence stays qualified.`)]);
    const result = await search(query);
    assert.deepEqual(names(result), ["notes/short.md"], query);
    assert.equal(relaxed(result), true, query);
    assert.ok(result.calls.length <= 8);
  }
  assert.deepEqual(tokenize("a an the AI R"), ["ai", "r"]);
  assert.deepEqual(tokenize("I'm checking my friend's DNS"), ["friend", "dns"]);
}));

test("stopword-only, low-value singleton and unrelated no-answer queries do not invent evidence", async () => fixture(async ({ configure, search }) => {
  for (const query of ["the and with", "nebula phantom", "missing advice"]) {
    await configure([row("other", "Bread recipes offer advice on flour.")]);
    const result = await search(query);
    assert.deepEqual(result.results, [], query);
    if (query === "the and with") assert.equal(relaxed(result), false);
    assert.ok(!result.calls.some(call => call.query === "advice"));
  }
}));

test("quotes, negatives, Boolean operators and exact identifiers pass through without weakening", async () => fixture(async ({ configure, search }) => {
  for (const query of ['"dispatch approval" unicorn', "dispatch -approval", "dispatch NOT approval", "dispatch without approval", "dispatch no approval", "dispatch Not approval", "dispatch WITHOUT approval", "dispatch OR approval", "src/qmd-query.ts unicorn", "mem_abc123 unicorn", "API/v2 phantom", "clientSecret phantom", "C++ phantom", "note:dispatch phantom"]) {
    await configure([row("other", "Dispatch evidence unrelated to the exact constraint.")]);
    assert.deepEqual(qmdLexQueries(query), [query]);
    const result = await search(query);
    assert.equal(relaxed(result), false, query);
    assert.deepEqual(result.calls.map(call => call.query), [query]);
  }
}));

test("strict partial/total backend failures and malformed output never activate relaxation", async () => fixture(async ({ configure, search }) => {
  for (const extra of [{ failAll: true }, { malformedQueries: ["dispatch phantom"] }]) {
    await configure([row("target", "Dispatch evidence.")], extra);
    await assert.rejects(search("dispatch phantom"), /no backend query succeeded/);
  }
  await configure([row("target", "Dispatch evidence.")], { failQueries: ["beta gamma"] });
  const partial = await search("alpha beta gamma");
  assert.equal(relaxed(partial), false);
  assert.ok(partial.outcome.warnings.includes("lexical_query_failed"));
  assert.ok(partial.calls.every(call => call.query.includes(" ")));
  await configure([row("target", "Dispatch evidence.")], { failQueries: ["dispatch"] });
  const failedFallback = await search("dispatch phantom");
  assert.equal(relaxed(failedFallback), true);
  assert.ok(failedFallback.outcome.warnings.includes("lexical_query_failed"));
  assert.deepEqual(failedFallback.results, []);
}));

test("semantic success prevents unnecessary relaxation; fallback never adds another model call", async () => fixture(async ({ configure, search }) => {
  const target = row("target", "Dispatch evidence.");
  await configure([target], { semanticRows: [target] });
  const semantic = await search("dispatch phantom", { semantic: true });
  assert.equal(relaxed(semantic), false);
  assert.deepEqual(semantic.calls.map(call => call.command), ["search", "query"]);
  await configure([target]);
  const fallback = await search("dispatch phantom", { semantic: true });
  assert.equal(relaxed(fallback), true);
  assert.equal(fallback.calls.filter(call => call.command === "query").length, 1);
  await configure([target], { failQueries: ["lex: dispatch phantom\nvec: dispatch phantom"] });
  const failed = await search("dispatch phantom", { semantic: true });
  assert.equal(relaxed(failed), false);
  assert.ok(failed.outcome.warnings.includes("semantic_query_failed_lexical_fallback"));
}));

test("semantic discovery cannot bypass a constrained lexical rejection", async () => fixture(async ({ configure, search }) => {
  const rejected = row("rejected", "Dispatch requires approval.");
  for (const query of ["dispatch -approval", '"dispatch approval"', "mem_abc123 phantom"]) {
    await configure([], { semanticRows: [rejected] });
    const result = await search(query, { semantic: true });
    assert.deepEqual(result.results, [], query);
    assert.ok(result.outcome.warnings.includes("query_constraints_lexical_only"));
    assert.ok(result.calls.every(call => call.command === "search"));
    assert.equal(relaxed(result), false);
  }
}));

test("ordinary calls stay within eight, max fusion/candidate caps stay unchanged, dreams never relax", async () => fixture(async ({ configure, search }) => {
  await configure([]);
  const long = await search("alpha beta gamma delta epsilon zeta eta theta iota");
  assert.equal(long.calls.length, 8);
  assert.equal(relaxed(long), false);
  assert.deepEqual(long.calls.map(call => call.query), qmdLexQueries("alpha beta gamma delta epsilon zeta eta theta iota").slice(0, 8));
  await configure(Array.from({ length: 20 }, (_, i) => row(`note-${i}`, "Alpha beta gamma delta epsilon zeta.")));
  const strict = await search("alpha beta gamma delta epsilon zeta");
  assert.equal(strict.results.length, 3);
  assert.deepEqual(strict.results.map(candidate => candidate.score), [1, 0.5, 1 / 3]);
  assert.equal(relaxed(strict), false);
  await configure([row("dream", "Dispatch evidence.")]);
  const dream = await search("dispatch phantom", { dreamsOnly: true });
  assert.equal(relaxed(dream), false);
  assert.equal(dream.calls.length, 1);
}));

test("temporal driver relaxes out-of-range strict hits while retaining interval, source and provenance policy", async () => fixture(async ({ root, configure, calls, generation }) => {
  const recent = { ...row("recent", "Vega calibration is approved."), date: "2025-01-01" };
  const historical = { ...row("historical", "Vega remains provisional, NOT production approved."), date: "2020-01-01" };
  const unrelated = { ...row("unrelated", "Bread recipes and culinary instructions."), date: "2020-01-01" };
  await configure([recent, historical, unrelated]);
  await generation([recent, historical, unrelated]);
  const outcome = { status: "complete", warnings: [] };
  const temporal = { interval: resolveTemporalQuery({ from: "2020-01-01", to: "2020-01-01" }), coverage: {} };
  const result = await searchQmdIndex(root, "Vega calibration", 3, { depth: "deep", outcome, temporal, recover: false });
  assert.deepEqual(result.map(hit => hit.provenance.file), [historical.file]);
  assert.equal(result[0].provenance.evidenceDate.value, "2020-01-01");
  assert.match(result[0].snippet, /NOT production approved/);
  assert.ok(outcome.warnings.includes("keyword_query_relaxed"));
  assert.deepEqual((await calls()).map(call => call.query), [...qmdLexQueries("Vega calibration").slice(0, 6), "calibration", "vega"]);
}));

test("temporal backfill never bypasses backend exclusions or quoted phrase constraints", async () => fixture(async ({ root, configure, generation }) => {
  const rejected = { ...row("rejected", "Dispatch requires immediate approval."), title: "dispatch -approval", date: "2020-01-01" };
  await configure([rejected]);
  await generation([rejected]);
  for (const query of ["dispatch -approval", '"dispatch approval"']) {
    const outcome = { status: "complete", warnings: [] };
    const temporal = { interval: resolveTemporalQuery({ from: "2020-01-01", to: "2020-01-01" }), coverage: {} };
    assert.deepEqual(await searchQmdIndex(root, query, 3, { depth: "deep", outcome, temporal, recover: false }), [], query);
    assert.ok(!outcome.warnings.includes("keyword_query_relaxed"));
    assert.equal(temporal.coverage.backfilledDocuments, 0);
  }
}));

test("eligible exact-title navigation and an empty temporal manifest suppress unnecessary fallback", async () => fixture(async ({ root, configure, calls, generation }) => {
  const target = { ...row("target", "Dispatch evidence stays qualified."), title: "dispatch unicorn", date: "2020-01-01" };
  await configure([target]);
  await generation([target]);
  const outcome = { status: "complete", warnings: [] };
  const result = await searchQmdIndex(root, "dispatch unicorn", 3, { depth: "deep", outcome, recover: false });
  assert.deepEqual(result.map(hit => hit.provenance.file), [target.file]);
  assert.ok(!outcome.warnings.includes("keyword_query_relaxed"));
  assert.deepEqual((await calls()).map(call => call.query), ["dispatch unicorn"]);
  await configure([target]);
  const temporal = { interval: resolveTemporalQuery({ from: "2030-01-01", to: "2030-01-01" }), coverage: {} };
  const scoped = await searchQmdIndex(root, "dispatch phantom", 3, { depth: "deep", outcome, temporal, recover: false });
  assert.deepEqual(scoped, []);
  assert.ok(!outcome.warnings.includes("keyword_query_relaxed"));
  assert.deepEqual((await calls()).map(call => call.query), ["dispatch phantom"]);
}));

test("relaxation shares the enclosing deadline rather than renewing its budget", async () => fixture(async ({ root, configure, search }) => {
  await configure([], { delayQueries: ["dispatch"] });
  await assert.rejects(withQmdOperation(root, "search", { timeoutMs: 250 }, () => search("dispatch phantom")), { code: "execution_timeout" });
}));

test("frozen small AND ablation reports evidence, adjacent-topic noise and ordinary subprocess cost", async t => fixture(async ({ configure, search }) => {
  const rows = [row("dispatch", "Dispatch approval remains provisional."), row("catalog", "Dispatch catalog lists vehicles."), row("ai", "AI evidence is qualified."), row("dns", "DNS evidence is qualified."), row("quartz", "Quartz evidence is qualified."), row("piano", "Piano lessons for beginners.")];
  const cases = [
    ["dispatch approval", ["notes/dispatch.md"]],
    ["dispatch unicorn", ["notes/dispatch.md"]],
    ["AI phantom", ["notes/ai.md"]],
    ["DNS ghost", ["notes/dns.md"]],
    ["quartz", ["notes/quartz.md"]],
    ["nebula phantom", []],
    ["missing advice", []],
    ["astronomy piano", []], // Explicit no-answer label: partial topic != answer.
  ];
  const totals = { baseline: { evidence: 0, noise: 0, calls: 0 }, fallback: { evidence: 0, noise: 0, calls: 0 } };
  for (const [query, evidence] of cases) for (const [mode, allowRelaxation] of [["baseline", false], ["fallback", true]]) {
    await configure(rows);
    const result = await search(query, { allowRelaxation });
    const found = names(result);
    totals[mode].evidence += found.filter(file => evidence.includes(file)).length;
    totals[mode].noise += found.filter(file => !evidence.includes(file)).length;
    totals[mode].calls += result.calls.length;
    if (mode === "fallback" && query === "astronomy piano") assert.equal(relaxed(result), true);
  }
  assert.deepEqual(totals, { baseline: { evidence: 2, noise: 0, calls: 9 }, fallback: { evidence: 5, noise: 2, calls: 20 } });
  t.diagnostic(`Synthetic frozen 8-query, limit-3 lexical ablation: ${JSON.stringify(totals)}; not corpus-wide quality.`);
}));
