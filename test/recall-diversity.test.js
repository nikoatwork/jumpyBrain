import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { groupResultsByFile, diversifyResults } from "../dist/adapters/qmd/qmd-ranking.js";
import { searchQmdIndex } from "../dist/adapters/qmd/index.js";
import { searchMemory } from "../dist/runtime/index.js";
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from "../dist/server/index.js";

function hit(file, score, snippet, lineStart, lineEnd = lineStart, metadata = {}) {
  return { id: `${file}:${lineStart}:${score}`, score, snippet,
    provenance: { file, lineStart, lineEnd, metadata },
    scoreBreakdown: { qmdScore: score, finalScore: score, driver: "fixture" } };
}
const files = (hits) => hits.map((result) => result.provenance.file);

test("file grouping collapses overlapping contained excerpts, retains the richer actual source and best score", () => {
  const best = hit("decisions/one.md", 1, "Async dispatch remains experimental...", 10, 12);
  const wider = hit("decisions/one.md", 0.8, "Async dispatch remains experimental; automatic publication is not decided.", 10, 15);
  const qualification = hit("decisions/one.md", 0.6, "A separate review requires explicit approval before launch.", 40, 42);
  const more = hit("decisions/one.md", 0.5, "Later rollout uses a reversible pilot.", 80, 82);
  const input = [best, wider, qualification, more];
  const before = structuredClone(input);
  for (const depth of ["normal", "shallow"]) {
    const [result] = groupResultsByFile(input, depth);
    assert.equal(result.id, best.id);
    assert.equal(result.score, best.score);
    assert.deepEqual(result.scoreBreakdown, best.scoreBreakdown);
    assert.equal(result.snippet, wider.snippet);
    assert.deepEqual(result.provenance, wider.provenance);
    assert.deepEqual(result.passages, [{ snippet: qualification.snippet, provenance: qualification.provenance }]);
    assert.equal(result.omittedPassages, 1, "redundant overlapping windows do not inflate omissions");
    assert.ok(!result.snippet.includes("Later rollout"), "never join separated evidence with an invented continuous range");
  }
  assert.deepEqual(input, before, "grouping must not mutate ranked candidates");
  assert.strictEqual(groupResultsByFile(input, "deep"), input);
});

test("range overlap alone never suppresses new qualifications, even on one long truncated line", () => {
  const yes = hit("notes/one.md", 1, "Deployment was approved for the internal pilot only.", 7, 12);
  const no = hit("notes/one.md", 0.9, "Deployment was not approved for external customers.", 10, 15);
  const [result] = groupResultsByFile([yes, no], "normal");
  assert.equal(result.snippet, yes.snippet);
  assert.equal(result.passages[0].snippet, no.snippet);
  assert.equal(result.omittedPassages, undefined);
  assert.equal(groupResultsByFile([{ ...yes, provenance: { ...yes.provenance, lineEnd: 7 } },
    { ...no, provenance: { ...no.provenance, lineStart: 7, lineEnd: 7 } }], "normal")[0].passages.length, 1);
});

test("a wider overlap collapses two contained windows but a shared short bridge cannot erase distinct evidence", () => {
  const one = hit("notes/a.md", 1, "Alpha decision.", 1, 2);
  const two = hit("notes/a.md", 0.9, "Beta qualification.", 3, 4);
  const wider = hit("notes/a.md", 0.8, "Alpha decision. Beta qualification.", 1, 4);
  assert.equal(groupResultsByFile([one, two, wider], "normal")[0].passages, undefined);
  const left = hit("notes/a.md", 1, "Approved pilot. Shared discussion.", 1, 4);
  const right = hit("notes/a.md", 0.9, "Shared discussion. Not approved rollout.", 3, 6);
  const bridge = hit("notes/a.md", 0.8, "Shared discussion.", 3, 4);
  assert.equal(groupResultsByFile([left, right, bridge], "normal")[0].passages.length, 1);
});

test("canonical file identity, not basename or metadata title, defines grouping; disjoint locations stay distinct", () => {
  const a = hit("notes/same.md", 1, "Identical label", 1);
  const b = hit("archive/same.md", 0.9, "Identical label", 1);
  const repeated = hit("notes/same.md", 0.8, "Identical label", 90);
  const output = groupResultsByFile([a, b, repeated], "normal");
  assert.deepEqual(files(output), [a.provenance.file, b.provenance.file]);
  assert.equal(output[0].passages[0].provenance.lineStart, 90);
  assert.ok(!Object.hasOwn(output[1], "passages"));
  assert.ok(!Object.hasOwn(output[1], "omittedPassages"));
});

function fixedPool(chunkRank, fileRank) {
  const preceding = Array.from({ length: fileRank - 1 }, (_, index) =>
    hit(`notes/topic-${index}.md`, 1 - index / 100, `Independent relevant topic ${index}.`, 1));
  const duplicates = Array.from({ length: chunkRank - fileRank }, (_, index) =>
    hit(preceding[index % preceding.length].provenance.file, 0.6 - index / 100, `Distinct detail ${index}.`, 10 + index * 10));
  const target = hit("findings/target.md", 0.1, "The missing relevant finding.", 1);
  return [...preceding, ...duplicates, target];
}

test("fixed ranked pools isolate Q4-type slot recovery from Q1 ranking misses (not a corpus reproduction)", () => {
  for (const [chunkRank, fileRank, limit, recovered] of [[15, 10, 10, true], [11, 9, 10, true], [31, 19, 8, false]]) {
    const pool = fixedPool(chunkRank, fileRank);
    assert.equal(pool.length, chunkRank);
    assert.equal(files(pool.slice(0, limit)).includes("findings/target.md"), false);
    const grouped = groupResultsByFile(pool, "normal");
    assert.equal(files(grouped).indexOf("findings/target.md") + 1, fileRank);
    assert.equal(files(grouped.slice(0, limit)).includes("findings/target.md"), recovered);
    assert.deepEqual(files(grouped), [...new Set(files(pool))], "no file relevance reranking or extra candidates");
  }
});

test("grouping cannot restore candidates absent from the fixed pool", () => {
  const full = fixedPool(15, 10);
  assert.ok(!files(groupResultsByFile(full.slice(0, 14), "normal")).includes("findings/target.md"));
});

test("maps retain distinct second passages and cannot suppress a raw file's unique qualification", () => {
  const prose = "Harbor migration connects fleet scheduling cargo routing crew readiness operational limits weather checks berth assignments and port safety.";
  const map = hit("pages/map.md", 1, prose, 1, 3, { dream: true });
  const mapExtra = hit("pages/map.md", 0.9, "The fallback route requires an independent safety review.", 40);
  const echo = hit("notes/raw.md", 0.8, prose, 1, 3);
  const qualifier = hit("notes/raw.md", 0.7, "The external rollout is not approved; only the pilot may proceed.", 50);
  const copy = hit("notes/echo.md", 0.6, prose, 1, 3);
  const output = diversifyResults(groupResultsByFile([map, mapExtra, echo, qualifier, copy], "normal"), "normal");
  assert.deepEqual(files(output), [map.provenance.file, echo.provenance.file]);
  assert.equal(output[0].passages[0].snippet, mapExtra.snippet);
  assert.equal(output[1].passages[0].snippet, qualifier.snippet);
});


test("cross-file map diversity never loses added or rearranged qualifications", () => {
  const shared = "The dispatch review covers safety controls recipient consent monitoring rollback and operator readiness. ";
  for (const [firstDream, secondDream] of [[true, true], [true, false], [false, true]]) {
    const approved = hit("notes/first.md", 1, shared + "The pilot is approved.", 1, 2, { dream: firstDream });
    const qualified = hit("notes/second.md", 0.9, shared + "The pilot is approved. External sharing is not decided.", 1, 2, { dream: secondDream });
    assert.equal(diversifyResults([approved, qualified], "normal").length, 2, "neither maps nor raw notes may lose new evidence");
    const negationA = { ...approved, snippet: shared + "Approve the pilot, not publication." };
    const negationB = { ...qualified, snippet: shared + "Approve publication, not the pilot." };
    assert.equal(diversifyResults([negationA, negationB], "normal").length, 2, "equal token sets do not imply equal claims");
    const echo = { ...qualified, snippet: approved.snippet };
    assert.equal(diversifyResults([approved, echo], "normal").length, 1);
  }
});

test("omitted candidate evidence prevents cross-file suppression", () => {
  const prose = "The dispatch review covers safety controls recipient consent monitoring rollback and operator readiness.";
  const map = hit("pages/map.md", 1, prose, 1, 2, { dream: true });
  const raw = hit("notes/raw.md", 0.9, prose, 1, 2);
  for (const input of [[{ ...map, omittedPassages: 1 }, raw], [map, { ...raw, omittedPassages: 1 }]]) {
    assert.equal(diversifyResults(input, "normal").length, 2);
  }
});

test("normal/shallow file limits and additional evidence are identical across adapter/runtime/HTTP; deep/source limits remain chunks", { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-recall-diversity-"));
  const saved = { JUMPYBRAIN_QMD_BIN: process.env.JUMPYBRAIN_QMD_BIN, JUMPYBRAIN_QMD_EMBED: process.env.JUMPYBRAIN_QMD_EMBED };
  let server;
  try {
    const memory = createServerMemoryRuntime({ root });
    await memory.initializeMemoryRoot();
    const passages = [
      "Dispatch approval allows an internal pilot with explicit operator confirmation. The team will evaluate operational readiness and customer demand before considering broader distribution; this is a reversible experiment, not a launch commitment.",
      "Dispatch approval for automatic sharing is not decided. Security reviewers require recipient controls, auditability and a separate consent decision before publication; the pilot cannot be treated as permission for broad external access.",
      "Dispatch approval depends on rollback drills and error budgets. The next review will examine monitoring alerts, customer impact and fallback procedures before allowing any extension of the limited internal pilot to another team.",
    ];
    const body = passages.join("\n".repeat(30));
    await writeFile(path.join(root, "notes/dispatch.md"), "---\nsession_id: dispatch-session\n---\n" + body + "\n");
    const other = "Dispatch approval also depends on a separate capacity review. Operators must evaluate queue limits and peak throughput before increasing traffic; the capacity finding is relevant even when one decision contributes multiple matching passages.";
    await writeFile(path.join(root, "notes/capacity.md"), other + "\n");
    const rows = passages.map((snippet, i) => ({ file: "notes/dispatch.md", line: 4 + i * 30, snippet, score: 0 }));
    rows.push({ file: "notes/capacity.md", line: 1, snippet: other, score: 0 });
    const binary = path.join(root, "fake-qmd.cjs");
    await writeFile(binary, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
console.log(JSON.stringify(['search','query'].includes(args[0]) ? ${JSON.stringify(rows)}.slice(0, Number(args[args.indexOf('-n')+1])).map(row => ({...row, metadata: { source: 'backend-private' }, provenance: { file: '/backend-private/source.md' }, passages: [{ snippet: 'backend-private' }], file:'qmd://jumpybrain/'+row.file})) : []));
`);
    await chmod(binary, 0o755);
    process.env.JUMPYBRAIN_QMD_BIN = binary;
    process.env.JUMPYBRAIN_QMD_EMBED = "0";
    await memory.indexMemory();
    server = await startJumpyBrainHttpServer({ root, apiKeys: ["diversity-secret"], port: 0, autoIndex: false });
    for (const depth of ["normal", "shallow"]) {
      const adapter = await searchQmdIndex(root, "dispatch approval", 2, { depth });
      const runtime = await searchMemory(root, "dispatch approval", 2, { depth });
      const response = await fetch(`${server.url}/memories/all/search`, {
        method: "POST", headers: { Authorization: "Bearer diversity-secret", "Content-Type": "application/json" },
        body: JSON.stringify({ query: "dispatch approval", limit: 2, depth }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(runtime.results, adapter);
      const packet = await response.json();
      assert.deepEqual(packet.results, JSON.parse(JSON.stringify(adapter)));
      assert.equal(packet.root, "remote:all");
      assert.ok(!JSON.stringify(packet).includes(root), "no server-local path is returned in primary or additional evidence");
      assert.ok(!JSON.stringify(packet).includes("backend-private"), "upstream provenance and grouping fields are not trusted");
      for (const passage of [adapter[0], ...adapter[0].passages]) {
        assert.equal(passage.provenance.file, "notes/dispatch.md");
        assert.equal(passage.provenance.session_id, "dispatch-session");
        assert.equal(passage.provenance.sessionId, "dispatch-session");
        assert.equal(passage.provenance.metadata.session_id, "dispatch-session");
      }
      assert.deepEqual(files(adapter), ["notes/dispatch.md", "notes/capacity.md"]);
      assert.equal(adapter[0].scoreBreakdown.qmdScore, 1, "zero upstream scores retain rank fallback");
      assert.match(adapter[0].passages[0].snippet, /not decided/);
      assert.equal(adapter[0].passages[0].provenance.lineStart, 34);
      assert.equal(adapter[0].omittedPassages, 1);
      assert.equal(adapter[1].passages, undefined);
    }
    for (const [query, depth] of [["dispatch approval", "deep"], ["original dispatch approval", "normal"], ["original dispatch approval", "shallow"]]) {
      const chunks = await searchQmdIndex(root, query, 2, { depth });
      assert.deepEqual(files(chunks), ["notes/dispatch.md", "notes/dispatch.md"]);
      assert.ok(chunks.every((result) => !result.passages && !result.omittedPassages));
      const response = await fetch(`${server.url}/memories/all/recall`, {
        method: "POST", headers: { Authorization: "Bearer diversity-secret", "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 2, depth }),
      });
      assert.equal(response.status, 200);
      const packet = await response.json();
      assert.equal(packet.mode, "recall");
      assert.equal(packet.root, "remote:all");
      assert.deepEqual(packet.results, JSON.parse(JSON.stringify(chunks)));
    }
    // Additional provenance comes from the same freshly indexed canonical
    // metadata as the primary, never an upstream row or retained group cache.
    await writeFile(path.join(root, "notes/dispatch.md"), "---\nsession_id: refreshed-session\n---\n" + body + "\n");
    await memory.indexMemory();
    const [refreshed] = await searchQmdIndex(root, "dispatch approval", 2);
    assert.equal(refreshed.sessionId, "refreshed-session");
    assert.equal(refreshed.session_id, "refreshed-session");
    for (const passage of [refreshed, ...refreshed.passages]) {
      assert.equal(passage.provenance.session_id, "refreshed-session");
      assert.equal(passage.provenance.sessionId, "refreshed-session");
      assert.equal(passage.provenance.metadata.session_id, "refreshed-session");
    }
    const calls = (await readFile(path.join(root, "calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(calls.filter((args) => ["search", "query"].includes(args[0])).every((args) => args[args.indexOf("-n") + 1] === "40"), "candidate budget is unchanged, not enlarged to obtain diversity");
  } finally {
    if (server) await server.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
