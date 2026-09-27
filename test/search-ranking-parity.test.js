import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import vm from "node:vm";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from "../dist/server/index.js";
import { repoRoot } from "./source-graph-helpers.js";

const execFileAsync = promisify(execFile);
const documentId = (n) => `mem_91000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Execute the shipped palette functions, not a second implementation of its policy.
function browserNormalizer() {
  const script = graphPageHtml("parity-test").match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  function extract(name) {
    const start = script.indexOf("function " + name + "(");
    assert.ok(start >= 0, name);
    const body = script.indexOf("{", start);
    let depth = 0;
    for (let end = body; end < script.length; end++) {
      if (script[end] === "{") depth++;
      if (script[end] === "}" && --depth === 0) return script.slice(start, end + 1);
    }
    throw new Error("Unterminated " + name);
  }
  const context = vm.createContext({});
  vm.runInContext(["isValidMemoryDocumentId", "normalizeNoteResults"].map(extract).join("\n"), context);
  return (hits) => JSON.parse(JSON.stringify(context.normalizeNoteResults(hits)));
}

async function put(root, file, { id, title, date = "2026-01-01", body }) {
  const header = ["---", ...(id ? [`id: ${id}`] : []), `type: ${file.startsWith("pages/") ? "page" : "note"}`,
    `title: ${JSON.stringify(title)}`, `date: ${date}`, "---"];
  await writeFile(path.join(root, file), [...header, body, ""].join("\n"));
  return header.length + 1;
}

function displayHit(hit) {
  const { metadata, file } = hit.provenance;
  return { documentId: metadata.id || null, file, title: metadata.title, referenceTitle: metadata.title, snippet: hit.snippet };
}

test("local CLI and Cmd+K share title-first ranking; the palette only partitions, deduplicates, and caps", { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-search-parity-"));
  const savedEnv = { JUMPYBRAIN_QMD_BIN: process.env.JUMPYBRAIN_QMD_BIN, JUMPYBRAIN_QMD_EMBED: process.env.JUMPYBRAIN_QMD_EMBED };
  let server;
  try {
    const memory = createServerMemoryRuntime({ root });
    await memory.initializeMemoryRoot();
    const exactFile = "pages/entrepreneur.md";
    await put(root, exactFile, { id: documentId(1), title: "Entrepreneur", date: "2001-01-01",
      body: "# Entrepreneur\n\nA durable overview of independent business building, customer discovery, and sustainable ownership." });

    const rows = [];
    const legacyFile = "notes/legacy.md";
    const legacySnippet = "An entrepreneur was mentioned in this legacy notebook without a canonical document identity. " +
      "Keep this historical evidence searchable, but do not offer navigation until an operator assigns a valid memory ID.";
    rows.push({ file: legacyFile, score: 1, snippet: legacySnippet,
      line: await put(root, legacyFile, { title: "Legacy notebook", body: legacySnippet }) });
    for (let n = 0; n < 14; n++) {
      const file = `notes/field-${n}.md`;
      const snippet = `Field record ${n}: an entrepreneur discussed customer interviews and a concrete experiment numbered ${n}. ` +
        "This is incidental body evidence, not the named overview page; preserve its provenance and distinct observations for later inspection.";
      const second = "Separate follow-up: the entrepreneur chose a different supplier after reviewing warranty terms and inventory delays. " +
        "This later chunk provides independent operational detail and must not replace the first matching chunk in the note picker.";
      const line = await put(root, file, { id: documentId(n + 2), title: `Field record ${n}`,
        body: n === 0 ? [snippet, ...Array(30).fill(""), second].join("\n") : snippet });
      rows.push({ file, score: 0.95 - n * 0.02, snippet, line });
      if (n === 0) rows.push({ file, score: 0.92, snippet: second, line: line + 31 });
    }
    assert.ok(rows.every((row) => row.file !== exactFile), "QMD deliberately omits the exact-title page");
    const binary = path.join(root, "fake-qmd.cjs");
    await writeFile(binary, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('qmd-calls.jsonl', JSON.stringify(args) + '\\n');
if (args[0] === 'search' || args[0] === 'query') {
  const collection = args[args.indexOf('-c') + 1];
  const limit = Number(args[args.indexOf('-n') + 1]);
  const rows = ${JSON.stringify(rows)};
  console.log(JSON.stringify(collection === 'jumpybrain' ? rows.slice(0, limit).map(row => ({ ...row, file: 'qmd://' + collection + '/' + row.file })) : []));
} else if (args[0] === 'collection' || args[0] === 'update') console.log('[]');
else { console.error('Unexpected QMD operation: ' + args[0]); process.exit(1); }
`);
    await chmod(binary, 0o755);
    process.env.JUMPYBRAIN_QMD_BIN = binary;
    process.env.JUMPYBRAIN_QMD_EMBED = "0";
    await memory.indexMemory();
    server = await startJumpyBrainHttpServer({ root, apiKeys: ["parity-secret"], port: 0, autoIndex: false });

    // A synchronous CLI child would block this process's HTTP server event loop.
    const [cli, response] = await Promise.all([
      execFileAsync(process.execPath, [path.join(repoRoot, "dist/cli.js"), "search", "--root", root,
        "--query", "entrepreneur", "--limit", "24", "--depth", "normal", "--json"],
      { cwd: repoRoot, env: { ...process.env, JUMPYBRAIN_CLI_CONFIG: path.join(root, "no-cli-config.json") }, timeout: 20000 }),
      fetch(`${server.url}/memories/all/search`, {
        method: "POST", headers: { Authorization: "Bearer parity-secret", "Content-Type": "application/json" },
        body: JSON.stringify({ query: "entrepreneur", limit: 24, depth: "normal" }),
      }),
    ]);
    assert.equal(response.status, 200);
    const local = JSON.parse(cli.stdout);
    const remote = await response.json();
    assert.equal(local.query, "entrepreneur");
    assert.equal(remote.query, local.query);
    assert.equal(local.depth, "normal");
    assert.equal(remote.depth, local.depth);
    assert.deepEqual(remote.results, local.results, "HTTP must preserve the entire local backend result array, including score breakdowns");
    assert.ok(remote.results.length <= 24);

    const normalize = browserNormalizer();
    const valid = remote.results.filter((hit) => hit.provenance.metadata.id);
    const firstHits = new Map();
    for (const hit of valid) {
      if (!firstHits.has(hit.provenance.metadata.id)) firstHits.set(hit.provenance.metadata.id, hit);
    }
    const firstById = [...firstHits.values()];
    assert.ok(firstById.length > 12, "fixture must exercise the palette cap");
    const duplicates = valid.filter((hit) => hit.provenance.metadata.id === documentId(2));
    assert.equal(duplicates.length, 2, "distinct QMD chunks of one canonical note survive backend retrieval");
    assert.notEqual(duplicates[0].snippet, duplicates[1].snippet);
    const display = normalize(remote.results);
    assert.equal(display.length, 12);
    assert.deepEqual(display, firstById.slice(0, 12).map(displayHit), "usable notes keep backend order and first-hit snippets without client reranking");
    assert.deepEqual(normalize(local.results), display);
    assert.deepEqual(display.find((hit) => hit.documentId === documentId(2)), displayHit(duplicates[0]));

    const legacy = remote.results.find((hit) => hit.provenance.file === legacyFile);
    assert.ok(legacy, "backend retains ID-less evidence");
    assert.equal(legacy.provenance.metadata.id, undefined);
    assert.ok(display.every((hit) => hit.documentId), "ID-less rows cannot crowd out navigable notes");
    // A smaller response keeps unavailable rows, after all usable notes, even
    // when the unavailable hit precedes them and a duplicate chunk intervenes.
    const smaller = [legacy, duplicates[0], duplicates[1], firstById.find((hit) => hit.provenance.metadata.id !== documentId(2))];
    assert.deepEqual(normalize(smaller), [displayHit(smaller[1]), displayHit(smaller[3]), displayHit(legacy)]);

    const calls = (await readFile(path.join(root, "qmd-calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(calls.filter((args) => args[0] === "search").length >= 2, "both transports use the fake QMD executable");
    assert.ok(calls.every((args) => args[0] !== "embed"), "no real models or embeddings are needed");
    assert.equal(remote.results[0].provenance.file, exactFile, "exact Entrepreneur title wins even when QMD omits it and body-only mentions are newer");
    assert.equal(remote.results[0].provenance.metadata.id, documentId(1));
    assert.equal(display[0].documentId, documentId(1));
    assert.ok(remote.results.every((hit) => Number.isFinite(hit.scoreBreakdown.titleMatchBoost)));
    assert.ok(remote.results[0].scoreBreakdown.titleMatchBoost > 0);
    assert.ok(remote.results.filter((hit) => hit.provenance.file !== exactFile).every((hit) => hit.scoreBreakdown.titleMatchBoost === 0));
  } finally {
    if (server) await server.close();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
