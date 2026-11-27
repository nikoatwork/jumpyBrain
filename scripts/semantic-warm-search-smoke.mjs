#!/usr/bin/env node
/** Opt-in only; never imported by npm test. Build dist first (npm run build).
 * JUMPYBRAIN_QMD_BIN=/absolute/path/qmd JUMPYBRAIN_SMOKE_MODEL=/absolute/local.gguf \
 *   node scripts/semantic-warm-search-smoke.mjs [--corpus /absolute/markdown/dir]
 * Proves the warm smart-search worker returns exactly the rows of the real
 * `qmd query <lex/vec lines> --json -n N --no-rerank -c jumpybrain` CLI, and the
 * same end-to-end search results, on a disposable brain with the real model.
 * Optional --corpus copies extra Markdown (e.g. this repo's docs) into the brain.
 * No install/download; network is denied to QMD in both paths. One JSON report.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const bin = process.env.JUMPYBRAIN_QMD_BIN;
const model = process.env.JUMPYBRAIN_SMOKE_MODEL;
assert.ok(bin && path.isAbsolute(bin) && model && path.isAbsolute(model),
  "Opt-in requires absolute JUMPYBRAIN_QMD_BIN and JUMPYBRAIN_SMOKE_MODEL; provision QMD 2.8.3 and GGUF first.");
assert.ok((await stat(model)).isFile(), "Model must already exist locally.");
const corpusFlag = process.argv.indexOf("--corpus");
const corpus = corpusFlag > 0 ? process.argv[corpusFlag + 1] : undefined;
assert.ok(!corpus || path.isAbsolute(corpus), "--corpus needs an absolute directory");
const { resolveQmdSdk } = await import("../dist/adapters/qmd/qmd-cli.js");
const pkgRoot = path.resolve(resolveQmdSdk(), "../..");
const digest = createHash("sha256");
for await (const chunk of createReadStream(model)) digest.update(chunk);
const modelHash = digest.digest("hex");
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-warm-semantic-")));
const root = path.join(temporary, "memory");
const report = { qmd: "2.8.3", node: process.version, platform: `${process.platform}/${process.arch}`, model: path.basename(model),
  corpus: corpus ? path.basename(corpus) : null, parity: { rowSets: 0, rows: 0, endToEnd: 0 }, timings: {} };
const savedNodeOptions = process.env.NODE_OPTIONS;
let release;
try {
  await mkdir(path.join(root, "notes"), { recursive: true });
  // Same local-only guard as semantic-index-smoke, applied to CLI and worker children.
  const guard = path.join(temporary, "offline-guard.mjs");
  await writeFile(guard, `
    import http from "node:http";
    import https from "node:https";
    import { syncBuiltinESMExports } from "node:module";
    const denied = () => { throw new Error("Smoke forbids network access"); };
    globalThis.fetch = denied;
    http.request = http.get = https.request = https.get = denied;
    syncBuiltinESMExports();
    const { LlamaCpp } = await import(${JSON.stringify(pathToFileURL(path.join(pkgRoot, "dist/llm.js")).href)});
    const ensure = LlamaCpp.prototype.ensureLlama;
    LlamaCpp.prototype.ensureLlama = function() { return ensure.call(this, false); };
  `);
  process.env.NODE_OPTIONS = `${savedNodeOptions ?? ""} --import=${pathToFileURL(guard).href}`.trim();
  for (const key of ["JUMPYBRAIN_QMD_EMBED", "QMD_EMBED_MODEL", "JUMPYBRAIN_SMART_SEARCH_IDLE_MS"]) delete process.env[key];
  const notes = {
    "heart.md": "---\ntitle: Clinic note\n---\nThe cardiologist prescribed daily aerobic exercise to strengthen cardiac health and lower hypertension.\n",
    "copper.md": "---\ntitle: Circuit note\n---\nCopper circuits transmit electrical signals through insulated wires.\n",
    "garden.md": "---\ntitle: Garden irrigation\n---\n# Watering plan\n\nDrip lines keep tomato beds moist during heat waves. Check pressure weekly.\n\n## Pumps\n\nThe rain barrel pump fails when the filter clogs.\n",
    "deploy.md": "---\ntitle: Deploy runbook\n---\nRoll back the schema migration before restoring the previous release. Verify backups first.\n",
    "travel.md": "---\ntitle: Trip planning\n---\nBook train tickets to Lisbon early; the coastal route is scenic and cheaper than flying.\n",
    "empty.md": "",
  };
  for (const [file, body] of Object.entries(notes)) await writeFile(path.join(root, "notes", file), body);
  if (corpus) await cp(corpus, path.join(root, "notes", "corpus"), { recursive: true, filter: source => !path.basename(source).startsWith(".") });
  const local = await import("../dist/app/local-memory/index.js");
  const { searchWithQmdCli, qmdLexQueries } = await import("../dist/adapters/qmd/qmd-query.js");
  const { runQmd } = await import("../dist/adapters/qmd/qmd-cli.js");
  const { withQmdOperation } = await import("../dist/adapters/qmd/qmd-execution.js");
  const warm = await import("../dist/adapters/qmd/qmd-warm.js");
  const indexStarted = performance.now();
  await local.indexMemory(root, { indexing: { mode: "semantic", model, modelHash } });
  report.timings.indexMs = Math.round(performance.now() - indexStarted);
  const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(root, ".jumpybrain/index.json"), "utf8"));
  const modelKey = JSON.stringify([manifest.embedding?.modelHash ?? null, manifest.modelStat ?? null]);
  const queries = [
    "physician recommends workouts for high blood pressure",
    "how do I water tomatoes when it is hot",
    "undo a database change before going back to the old version",
    "electrical wiring",
    "cheap scenic way to reach Portugal",
    "pump filter",
    "smart search model memory",
    "backend keeps search fast",
    "release checklist for the mac app",
    "where are access keys stored",
  ];
  const textFor = query => [...qmdLexQueries(query).slice(0, 8).map(lex => `lex: ${lex}`), `vec: ${query}`].join("\n");
  const time = async operation => { const started = performance.now(); const value = await operation(); return { value, ms: performance.now() - started }; };
  const cold = [], warmMs = [];
  release = warm.retainWarmSmartSearch();
  let first;
  for (const limit of [10, 40, 160]) {
    for (const query of queries) {
      const text = textFor(query);
      const cli = await time(() => withQmdOperation(root, "search", {}, () => runQmd(root, ["query", text, "--json", "-n", String(limit), "--no-rerank", "-c", "jumpybrain"], model)));
      const fromWorker = await time(() => withQmdOperation(root, "search", {}, () => warm.runWarmQmdQuery(root, { text, limit, collection: "jumpybrain", model, modelKey, idleMs: 0 })));
      assert.equal(typeof fromWorker.value, "string", "warm slot unavailable");
      const expected = cli.value.stdout.trim() === "No results found." ? [] : JSON.parse(cli.value.stdout);
      assert.deepEqual(JSON.parse(fromWorker.value), expected, `row mismatch for ${JSON.stringify(query)} at -n ${limit}`);
      report.parity.rowSets++; report.parity.rows += expected.length;
      cold.push(cli.ms);
      if (first === undefined) first = fromWorker.ms; else warmMs.push(fromWorker.ms);
    }
  }
  const [worker] = warm.warmSmartSearchForTests.workers();
  const rssKb = Number(execFileSync("ps", ["-o", "rss=", "-p", String(worker.pid)], { encoding: "utf8" }).trim());
  // End to end: the whole search (ranking, snippets, warnings) with and without the worker.
  for (const query of queries) {
    const hot = await local.searchMemory(root, query, 10, { refresh: false });
    await release(); release = undefined;
    const coldResult = await local.searchMemory(root, query, 10, { refresh: false });
    release = warm.retainWarmSmartSearch();
    assert.deepEqual(hot.results, coldResult.results, `end-to-end mismatch for ${JSON.stringify(query)}`);
    assert.deepEqual(hot.retrieval, coldResult.retrieval);
    assert.equal(hot.retrieval.warnings.includes("semantic_query_failed_lexical_fallback"), false);
    report.parity.endToEnd++;
  }
  // A semantic-only paraphrase must still be found through the worker.
  const paraphrase = await searchWithQmdCli(root, queries[0], 10, { semantic: false });
  assert.equal(paraphrase.some(row => row.file === "notes/heart.md"), false, "paraphrase control has lexical overlap");
  const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { n: sorted.length, medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]), minMs: Math.round(sorted[0]), maxMs: Math.round(sorted.at(-1)) }; };
  report.timings.coldCliQuery = stats(cold);
  report.timings.firstWarmQueryMs = Math.round(first);
  report.timings.warmQuery = stats(warmMs);
  report.workerRssMb = Math.round(rssKb / 1024);
  report.ok = true;
} finally {
  await release?.();
  if (savedNodeOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = savedNodeOptions;
  await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
