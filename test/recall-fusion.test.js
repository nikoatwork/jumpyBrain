import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { qmdLexQueries, searchWithQmdCli } from "../dist/adapters/qmd/qmd-query.js";

// Deliberately test-only alternatives. Do not add a second production ranking
// policy merely to run an ablation. All methods receive identical ordered rows.
function rrf(lists, { deduplicateLists = false } = {}) {
  const scores = new Map();
  const seen = new Set();
  for (const { rows, weight = 1 } of lists) {
    const signature = JSON.stringify(rows.map((row) => row.file));
    if (deduplicateLists && seen.has(signature)) continue;
    seen.add(signature);
    for (const [rank, row] of rows.entries()) scores.set(row.file, (scores.get(row.file) ?? 0) + weight / (60 + rank + 1));
  }
  return [...scores].sort((a, b) => b[1] - a[1]).map(([file]) => file);
}

function normalizedUpstream(lists) {
  const scores = new Map();
  for (const { rows, weight = 1 } of lists) {
    const maximum = Math.max(0, ...rows.map((row) => row.score));
    for (const row of rows) scores.set(row.file, Math.max(scores.get(row.file) ?? 0, maximum ? row.score / maximum * weight : 0));
  }
  return scores;
}

const row = (file, snippet, score = 0) => ({ file: `notes/${file}.md`, snippet, score, line: 1 });
async function fixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-recall-fusion-"));
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  try {
    const binary = path.join(root, "fake-qmd.cjs");
    await writeFile(binary, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const lists = JSON.parse(fs.readFileSync('lists.json', 'utf8'));
const rows = lists[args[0] === 'query' ? 'mixed' : args[1]] || [];
const collection = args[args.indexOf('-c') + 1];
console.log(JSON.stringify(rows.slice(0, Number(args[args.indexOf('-n')+1])).map(row => ({...row, file:'qmd://'+collection+'/'+row.file}))));
`);
    await chmod(binary, 0o755);
    process.env.JUMPYBRAIN_QMD_BIN = binary;
    await callback(async (query, lists, options = {}) => {
      const variants = qmdLexQueries(query).slice(0, options.dreamsOnly ? 2 : 8);
      assert.ok(variants.length >= lists.length, "fixture needs enough actual generated variants");
      await writeFile(path.join(root, "lists.json"), JSON.stringify(Object.fromEntries(variants.map((variant, i) => [variant, lists[i]?.rows ?? []]).concat([["mixed", options.mixed ?? []]]))));
      return searchWithQmdCli(root, query, options.limit ?? 40, options);
    });
  } finally {
    if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous;
    await rm(root, { recursive: true, force: true });
  }
}

test("zero-score candidate fusion retains max reciprocal rank, upstream score calibration and query/dream weights", async () => fixture(async (search) => {
  const query = "OAuth callback state validation";
  const a = row("callback", "Check the callback state against the stored nonce.");
  const b = row("cookies", "Cookie flags are a separate concern.");
  const c = row("tokens", "Token refresh happens after validation.");
  let found = await search(query, [{ rows: [a, b, c] }]);
  assert.deepEqual(found.map((candidate) => candidate.score), [1, 0.5, 1 / 3]);
  assert.deepEqual([...normalizedUpstream([{ rows: [a, b, c] }]).values()], [0, 0, 0], "normalizing a zero list adds no relevance information");
  found = await search(query, [{ rows: [a, { ...b, score: 0.8 }, c] }], { mixed: [c, b] });
  assert.deepEqual(found.map((candidate) => [candidate.file, candidate.score]), [[a.file, 1], [c.file, 0.9], [b.file, 0.8]]);
  const dreams = await search(query, [{ rows: [a, b, c] }], { dreamsOnly: true });
  assert.deepEqual(dreams.map((candidate) => candidate.score), [0.5, 0.25, 0.5 / 3]);
}));

test("per-list upstream normalization changes relevance gaps without establishing cross-mode comparability", async () => fixture(async (search) => {
  const query = "invoice refund settlement deadline";
  const a = row("pending", "Cancel the invoice while it is still pending.", 0.1);
  const b = row("settled", "Refund a settled invoice within seven business days.", 0.09);
  const c = row("ledger", "The ledger records whether an invoice is settled.", 0.9);
  const lists = [{ rows: [a, b] }, { rows: [c, { ...b, score: 0.8 }] }];
  const found = await search(query, lists);
  const normalized = normalizedUpstream(lists);
  assert.equal(found.find((candidate) => candidate.file === b.file).score, 0.8);
  assert.ok(Math.abs(normalized.get(b.file) - 0.9) < 1e-12);
  assert.equal(normalized.get(a.file), 1, "a weak list leader gets the same maximum as a strong one");
  assert.equal(normalized.get(c.file), 1);
}));

test("duplicated variants do not accumulate evidence or increase the fixed candidate cutoff", async () => fixture(async (search) => {
  const query = "greenhouse drip valve pressure";
  const a = row("valve", "Use the specified valve pressure for drip irrigation.");
  const b = row("guide", "A long general guide mentions many greenhouse components.");
  const once = await search(query, [{ rows: [a, b] }]);
  const repeated = await search(query, [{ rows: [a, b] }, { rows: [a, b] }, { rows: [a, b] }]);
  assert.deepEqual(repeated, once, "max fusion is invariant to correlated duplicate lists");
  assert.equal((await search(query, [{ rows: [a, b] }], { limit: 1 })).length, 1);
}));

test("fixed-pool cross-topic RRF ablation has tradeoffs, not evidence for replacing calibrated max fusion", async () => fixture(async (search) => {
  const scenarios = [
    {
      query: "OAuth callback state validation",
      target: row("nonce-check", "Reject the callback unless state equals the one-time nonce stored before authorization."),
      distractor: row("auth-catalog", "OAuth callback state validation cookies login refresh scopes tokens browser headers."),
      consensus: false,
    },
    {
      query: "greenhouse drip valve pressure",
      target: row("pressure-setting", "The tested drip valve requires 1.5 bar; higher pressure damages the emitter."),
      distractor: row("garden-catalog", "Greenhouse drip valve pressure fertilizer tomatoes humidity seeds lighting irrigation."),
      consensus: false,
    },
    {
      query: "release rollback database compatibility",
      target: row("rollback-decision", "Rollback is safe only while the old and new database schemas both accept writes."),
      distractor: row("deployment-catalog", "Release rollback database compatibility pipelines dashboards replicas backups branches."),
      consensus: true,
    },
    {
      query: "invoice refund settlement deadline",
      target: row("refund-rule", "Refund the settled invoice within seven business days; pending invoices must be cancelled instead."),
      distractor: row("billing-catalog", "Invoice refund settlement deadline receipts taxation credit balance transfer accounting."),
      consensus: true,
    },
  ];
  const wins = { current: 0, rrf: 0, deduplicatedRrf: 0 };
  for (const scenario of scenarios) {
    // Relevance labels are explicit in the fixture: the target answers the
    // query; the keyword catalog does not. Length/repetition is never a label.
    // The full-phrase specialist versus consensus tradeoff is held fixed;
    // there are no extra candidates, model calls, or backend score assumptions.
    const { query, target, distractor, consensus } = scenario;
    const x = row("neighbor-one", "An adjacent topic with no answer to the question.");
    const y = row("neighbor-two", "Another adjacent topic without the required condition.");
    const lists = consensus
      ? [{ rows: [distractor, target] }, { rows: [x, target] }, { rows: [y, target] }]
      : [{ rows: [target, distractor] }, { rows: [x, distractor] }, { rows: [y, distractor] }];
    const found = await search(query, lists);
    const fused = rrf(lists);
    const robust = rrf(lists, { deduplicateLists: true });
    assert.deepEqual(new Set(found.map((candidate) => candidate.file)), new Set(fused), "the ablation uses the same candidate pool");
    assert.equal(found[0].file === target.file, !consensus, query);
    assert.equal(fused[0] === target.file, consensus, query);
    assert.equal(robust[0] === target.file, consensus, "deduplicating identical lists does not remove correlations across different variants");
    wins.current += Number(found[0].file === target.file);
    wins.rrf += Number(fused[0] === target.file);
    wins.deduplicatedRrf += Number(robust[0] === target.file);
    // Repeating a correlated list cannot promote anything in production.
    assert.deepEqual(await search(query, [...lists, lists[0], lists[0], lists[0]]), found);
  }
  assert.deepEqual(wins, { current: 2, rrf: 2, deduplicatedRrf: 2 });
}));


test("QMD context-window coordinates override its distinct match-line anchor", async () => fixture(async (search) => {
  const snippet = "@@ -2,3 @@ (1 before, 0 after)\n\nDispatch approval is not decided.\n";
  const found = await search("dispatch approval", [{ rows: [{ ...row("context", snippet), line: 3 }] }]);
  assert.equal(found[0].lineStart, 2);
  assert.equal(found[0].lineEnd, 4);
  const plain = await search("dispatch approval", [{ rows: [{ ...row("plain", "Dispatch approval is not decided."), line: 3 }] }]);
  assert.equal(plain[0].lineStart, 3);
  assert.equal(plain[0].lineEnd, 3);
}));
