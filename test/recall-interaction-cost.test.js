import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { expandMemoryDocument, readMarkdownDocuments } from "../dist/runtime/index.js";
import { serializeCompactRecall } from "../dist/core/retrieval-policy/compact.js";
import { serializeExpansion } from "../dist/core/canonical/expansion.js";
import { manifestPath } from "../dist/adapters/qmd/qmd-driver.js";
import { installFakeQmd } from "./fake-qmd-helper.js";

// Tiny evidence/output regressions, not an agent benchmark. Required clauses
// decide whether this test policy follows up; they never supply navigation.
// Count output only (including stderr), not requests, latency or hidden inputs.
const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const id = "mem_82000000-0000-4000-8000-000000000001";
const utf8 = text => Buffer.byteLength(text, "utf8");
const covered = (text, clauses) => clauses.every(clause => text.includes(clause));

// Optional measurement-only external installation. No dependency, install,
// external write, tokenizer estimate or token-based acceptance gate.
let tokenizer;
if (process.env.JUMPYBRAIN_ACCOUNTING_TOKENIZER) {
  const directory = path.resolve(process.env.JUMPYBRAIN_ACCOUNTING_TOKENIZER);
  const metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  assert.equal(metadata.name, "js-tiktoken");
  const { getEncoding } = createRequire(import.meta.url)(directory);
  tokenizer = { name: `js-tiktoken ${metadata.version} / cl100k_base`, encoding: getEncoding("cl100k_base") };
}

function report(t, name, interactions, extra = {}) {
  const costs = Object.fromEntries(Object.entries(interactions).map(([format, packets]) => {
    const packetBytes = packets.map(p => utf8(p.stdout) + utf8(p.stderr));
    const packetTokens = tokenizer && packets.map(p => tokenizer.encoding.encode(p.stdout).length
      + tokenizer.encoding.encode(p.stderr).length);
    return [format, { packets: packets.length, packetBytes, totalBytes: packetBytes.reduce((a, b) => a + b, 0),
      ...(packetTokens ? { packetTokens, totalTokens: packetTokens.reduce((a, b) => a + b, 0) } : {}) }];
  }));
  t.diagnostic(JSON.stringify({ case: name, costs, ...extra,
    tokenAccounting: tokenizer?.name ?? "not measured: no external named tokenizer configured; no estimate" }));
  return costs;
}

// Encoded text value includes its JSON quotes/escaping. Everything else is
// framing/metadata, including the trailing LF; this is an accounting partition,
// not a claim that provenance is waste or that bytes are tokens.
function partition(t, label, output, packet, texts) {
  assert.equal(output.stderr, "");
  assert.equal(output.stdout, JSON.stringify(packet) + "\n");
  assert.ok(utf8(output.stdout) <= packet.maxBytes);
  const evidenceBytes = texts.reduce((n, text) => n + utf8(JSON.stringify(text)), 0);
  const framingAndMetadataBytes = utf8(output.stdout) - evidenceBytes;
  assert.ok(framingAndMetadataBytes > 0);
  assert.equal(evidenceBytes + framingAndMetadataBytes, utf8(output.stdout));
  t.diagnostic(JSON.stringify({ label, serializedBytes: utf8(output.stdout), evidenceBytes, framingAndMetadataBytes }));
}

async function fixture(t, body, query) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-interaction-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = "notes/evidence.md";
  const content = `---\nid: ${id}\ntype: note\ntitle: Evidence\ncreated_at: 2024-01-01\n---\n${body}`;
  await mkdir(path.join(root, "notes"));
  await writeFile(path.join(root, file), content);
  await mkdir(path.dirname(manifestPath(root)), { recursive: true });
  await writeFile(manifestPath(root), JSON.stringify({ version: 1, root, qmdCollection: "jumpybrain",
    generatedAt: new Date(0).toISOString(), documents: await readMarkdownDocuments(root) }));
  const { bin } = await installFakeQmd(root);
  // Fixture setup may use coordinates; follow-up policy below must not. Real
  // compiled search owns excerpt selection, citations and source verification.
  const row = { file: `qmd://jumpybrain/${file}`, score: 0.9, line: 8, snippet: body };
  await writeFile(bin, `#!${process.execPath}\nconsole.log(JSON.stringify(${JSON.stringify([row])}));\n`);
  await chmod(bin, 0o755);
  const run = async args => {
    try {
      const output = await execute(process.execPath, [cli, ...args, "--root", root], {
        env: { ...process.env, JUMPYBRAIN_QMD_BIN: bin }, maxBuffer: 1024 * 1024,
      });
      return { stdout: output.stdout, stderr: output.stderr };
    } catch (error) {
      if (typeof error.stdout !== "string" || typeof error.stderr !== "string") throw error;
      return { stdout: error.stdout, stderr: error.stderr, failed: true };
    }
  };
  const recall = async (flags = []) => {
    const output = await run(["recall", "--query", query, "--limit", "1", "--no-refresh", ...flags]);
    assert.equal(output.failed, undefined, output.stderr);
    assert.equal(output.stderr, "");
    return output;
  };
  return { root, content, run, recall };
}

function textCitation(output) {
  const citation = output.stdout.match(/^1\. (.+\.md):(\d+)-(\d+) score=/m);
  assert.ok(citation, "navigation must be visible in the text output");
  assert.ok(!path.isAbsolute(citation[1]));
  return { file: citation[1], startLine: Number(citation[2]), endLine: Number(citation[3]) };
}

function handle(output) {
  const packet = JSON.parse(output.stdout);
  assert.equal(packet.passages.length, 1);
  const passage = packet.passages[0];
  assert.equal(passage.expansion.available, true);
  assert.equal(passage.expansion.id, passage.documentId);
  return passage.expansion;
}

const expandArgs = (h, range, maxBytes = 1024) => ["expand", "--id", h.id, "--if-match", h.expectedContentHash,
  "--max-bytes", String(maxBytes), ...Object.entries(range).flatMap(([key, value]) => [key, String(value)])];

async function selective(t, run, initial, clauses) {
  const h = handle(initial);
  let range = { "--section-line": h.startLine }; // only visible anchor, no secret heading/qualification line
  const packets = [initial];
  let evidence = JSON.parse(initial.stdout).passages.map(p => p.text).join("\n");
  while (!covered(evidence, clauses)) {
    assert.ok(packets.length < 16, "bounded tiny fixture, not a broad navigation harness");
    const output = await run(expandArgs(h, range));
    assert.equal(output.failed, undefined, output.stderr);
    const packet = JSON.parse(output.stdout);
    assert.equal(output.stdout, serializeExpansion(packet));
    partition(t, "selective", output, packet, [packet.text]);
    assert.equal(packet.contentHash, h.expectedContentHash);
    if (range["--start-line"] !== undefined) assert.equal(packet.startLine, range["--start-line"]);
    packets.push(output);
    evidence += "\n" + packet.text;
    if (!covered(evidence, clauses)) {
      assert.equal(packet.partial, true, "no promise that a complete section answers arbitrary questions");
      assert.ok(packet.continuationLine > packet.endLine);
      range = { "--start-line": packet.continuationLine, "--end-line": packet.requestedEndLine };
    }
  }
  assert.ok(covered(evidence, clauses));
  return packets;
}

test("small-limit sufficient recall: compact can exceed text; exact whole-output cap includes metadata", async t => {
  const clauses = ["two spaces", "except in imported files"];
  const f = await fixture(t, 'Prefer two spaces, except in imported files. Snow: 雪 🦊; quote: "yes"; path: \\tmp.\n', "indentation");
  const text = await f.recall();
  const rich = await f.recall(["--json"]);
  const compact = await f.recall(["--compact", "--max-bytes", "1536"]);
  const packet = JSON.parse(compact.stdout);
  assert.equal(compact.stdout, serializeCompactRecall(packet));
  assert.equal(packet.passages.length, 1);
  assert.equal(packet.passages[0].partial, true, "sufficient labels do not imply complete source context");
  for (const output of [text, rich, compact]) assert.ok(covered(output.stdout, clauses));
  assert.ok(text.stdout.startsWith("Prior memory scan for:"), "include the text banner, not just snippets");
  assert.match(text.stdout, /Written date:/);
  assert.equal(JSON.parse(rich.stdout).mode, "recall");
  assert.equal(Object.hasOwn(JSON.parse(rich.stdout), "passages"), false);
  assert.ok(rich.stdout.includes('\n  "'), "rich baseline is the actual pretty JSON, not compact JSON");
  partition(t, "compact sufficient", compact, packet, packet.passages.map(p => p.text));
  assert.ok(utf8(compact.stdout) > utf8(text.stdout), "this short one-result counterexample is not a universal ratio");
  const costs = report(t, "sufficient", { text: [text], rich: [rich], compact: [compact] });
  assert.equal(costs.compact.totalBytes, utf8(serializeCompactRecall(packet)));
  // No follow-up: all required evidence clauses already appeared.
});

test("late qualification: complete interactions use visible citations/handles, selective continuations and full reads", async t => {
  const clauses = ["approved for the pilot", "NOT approved", "unless audit approval is recorded"];
  const body = "# Rollout\nDatabase rollout is approved for the pilot.\n"
    + Array.from({ length: 36 }, (_, i) => `Observer entry ${i}: measurements remain provisional; snow 雪.\n`).join("")
    + "External use is NOT approved unless audit approval is recorded.\n"
    + "# Archive\n" + "Unrelated historical inventory entry.\n".repeat(100);
  const f = await fixture(t, body, "database rollout");
  const text = await f.recall();
  const rich = await f.recall(["--json"]);
  const compact = await f.recall(["--compact", "--max-bytes", "4096"]);
  const packet = JSON.parse(compact.stdout);
  partition(t, "compact missing qualification", compact, packet, packet.passages.map(p => p.text));
  // Actual CLI boundary, including UTF-8, escaping, metadata and final LF.
  // These budgets retain the same number of digits in the serialized envelope.
  const exactBudget = utf8(compact.stdout);
  assert.ok(exactBudget >= 1024 && String(exactBudget).length === String(packet.maxBytes).length);
  const exact = await f.recall(["--compact", "--max-bytes", String(exactBudget)]);
  const below = await f.recall(["--compact", "--max-bytes", String(exactBudget - 1)]);
  assert.equal(utf8(exact.stdout), exactBudget);
  const exactPacket = JSON.parse(exact.stdout);
  partition(t, "exact whole-passage boundary", exact, exactPacket, exactPacket.passages.map(p => p.text));
  assert.equal(exactPacket.passages.length, 1);
  const omitted = JSON.parse(below.stdout);
  partition(t, "one byte below whole-passage boundary", below, omitted, []);
  assert.equal(omitted.passages.length, 0);
  assert.deepEqual(omitted.omitted, { results: 1, passages: 1 });
  assert.equal(covered(below.stdout, clauses), false, "a smaller capped packet is not matched evidence coverage");
  for (const output of [text, rich, compact]) {
    assert.ok(output.stdout.includes(clauses[0]));
    assert.equal(covered(output.stdout, clauses), false, "same missing evidence in all initial formats");
    assert.match(output.stdout, /partial excerpt; expand source/);
  }
  const citation = textCitation(text);
  // Text has a file citation, not a canonical ID/hash: capture an explicit
  // local raw-file reader's stdout, with no invented tool envelope. Host-specific
  // read-tool wrappers are outside this comparison, as are CLI request bytes.
  const textRead = await execute(process.execPath, ["--input-type=module", "-e",
    "import { readFile } from 'node:fs/promises'; process.stdout.write(await readFile(process.argv[1], 'utf8'));",
    path.join(f.root, citation.file)]);
  assert.equal(textRead.stderr, "");
  const richResult = JSON.parse(rich.stdout).results[0];
  const richId = richResult.provenance.metadata.id;
  assert.notEqual(richId, richResult.id, "QMD hit identity is not a document ID");
  const richRead = await f.run(["show", "--id", richId, "--json"]);
  const compactRead = await f.run(["show", "--id", handle(compact).id, "--json"]);
  for (const output of [richRead, compactRead]) {
    assert.equal(output.failed, undefined, output.stderr);
    assert.equal(output.stderr, "");
    assert.equal(JSON.parse(output.stdout).content, textRead.stdout);
    assert.equal(output.stdout, JSON.stringify(JSON.parse(output.stdout), null, 2) + "\n");
  }
  for (const output of [textRead, richRead, compactRead]) assert.ok(covered(output.stdout, clauses));
  const packets = await selective(t, f.run, compact, clauses);
  assert.ok(packets.length > 2, "qualification requires actual bounded continuation, not just one simulated read");
  const costs = report(t, "late qualification", {
    textFullFile: [text, textRead], richFullShow: [rich, richRead],
    compactFullShow: [compact, compactRead], compactSelective: packets,
  }, { neededClauses: clauses, exactRecallCap: exactBudget,
    oneByteBelow: { outputBytes: utf8(below.stdout), neededEvidenceCovered: false } });
  assert.equal(costs.compactSelective.totalBytes, packets.reduce((n, p) => n + utf8(p.stdout) + utf8(p.stderr), 0));
  // Padding is intentionally synthetic; this local comparison is not a savings gate.
  assert.ok(costs.compactSelective.totalBytes > costs.compactSelective.packetBytes[0]);
});

test("hash preconditions and indivisible long lines stop selective reads explicitly, without silent full fallback", async t => {
  const clauses = ["Longline trial is provisional", "NEVER use unattended"];
  const f = await fixture(t, "# Scope\nLongline trial is provisional. " + "🦊 ".repeat(15000)
    + "NEVER use unattended.\n", "longline");
  const initial = await f.recall(["--compact", "--max-bytes", "4096"]);
  const h = handle(initial);
  const recallPacket = JSON.parse(initial.stdout);
  partition(t, "compact oversized-line excerpt", initial, recallPacket, recallPacket.passages.map(p => p.text));
  assert.ok(initial.stdout.includes(clauses[0]));
  assert.equal(covered(initial.stdout, clauses), false);
  assert.match(initial.stdout, /partial excerpt; expand source/);
  const prefix = await f.run(expandArgs(h, { "--section-line": h.startLine }));
  assert.equal(prefix.failed, undefined, prefix.stderr);
  const partial = JSON.parse(prefix.stdout);
  partition(t, "long-line section prefix", prefix, partial, [partial.text]);
  assert.equal(partial.partial, true);
  assert.ok(partial.continuationLine > partial.endLine);
  const errors = [];
  for (const maxBytes of [1024, 65536]) {
    const range = { startLine: partial.continuationLine, endLine: partial.requestedEndLine };
    await assert.rejects(expandMemoryDocument(f.root, { ...h, ...range, maxBytes }), { code: "line_too_large" });
    const failed = await f.run(expandArgs(h, { "--start-line": range.startLine, "--end-line": range.endLine }, maxBytes));
    assert.equal(failed.failed, true);
    assert.equal(failed.stdout, "");
    assert.match(failed.stderr, /first requested whole source line cannot fit/i);
    errors.push(failed);
  }
  await assert.rejects(expandMemoryDocument(f.root, { id: h.id, startLine: h.startLine, endLine: h.endLine }),
    { code: "precondition_required" });
  const missing = await f.run(["expand", "--id", h.id, "--start-line", String(h.startLine)]);
  assert.equal(missing.failed, true);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /if-match/);
  // Mutation is a deliberate synthetic conflict; path comes from visible recall.
  const passage = JSON.parse(initial.stdout).passages[0];
  await writeFile(path.join(f.root, passage.filePath), f.content + "Changed after recall.\n");
  await assert.rejects(expandMemoryDocument(f.root, h), { code: "precondition_failed" });
  const stale = await f.run(expandArgs(h, { "--start-line": h.startLine, "--end-line": h.endLine }));
  assert.equal(stale.failed, true);
  assert.equal(stale.stdout, "");
  assert.match(stale.stderr, /stale.*refresh|refresh.*stale/i);
  assert.equal(covered([initial, prefix, ...errors, missing, stale].map(p => p.stdout + p.stderr).join("\n"), clauses), false,
    "explicit errors cannot be counted as recovered evidence");
  report(t, "long-line and preconditions (unsupported evidence, not matched-quality success)", {
    stoppedSelective: [initial, prefix, ...errors], missingHash: [initial, missing], staleHash: [initial, stale],
  });
});
