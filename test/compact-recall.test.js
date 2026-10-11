import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compactSearchMemory } from "../dist/app/local-memory/compact.js";
import { compactWrittenDate, excerptMatchesSource, packCompactRecall, serializeCompactRecall } from "../dist/core/retrieval-policy/compact.js";
import { expandCanonicalMemoryDocument } from "../dist/core/canonical/expansion.js";
import { hashMemoryDocumentContent, readMarkdownDocuments } from "../dist/core/canonical/markdown-store.js";
import { manifestPath } from "../dist/adapters/qmd/qmd-driver.js";
import { installFakeQmd } from "./fake-qmd-helper.js";

const envelope = { query: "approval", depth: "normal", readiness: { freshness: "fresh", modes: ["lexical"], embedding: "disabled" }, retrieval: { status: "complete", warnings: [] } };
const id = "mem_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const id2 = "mem_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const passage = (text = "Approved only in sandbox. NOT approved for production.") => ({
  filePath: "notes/trial.md", pathBasis: "canonical_root", startLine: 1, endLine: 2, text,
  scope: "excerpt", partial: true, date: { basis: "unknown" }, expansion: { available: false, reason: "missing_id" },
});
const bytes = (packet) => Buffer.byteLength(serializeCompactRecall(packet), "utf8");

test("compact budgets include LF, JSON escaping, Unicode, all passages and diagnostics", () => {
  const candidates = Array.from({ length: 8 }, (_, i) => ({ passages: [passage(`${i}: ` + '🐙 \" \\ \n '.repeat(18)), passage("Only in sandbox; NOT approved for production.")], omittedPassages: 2 }));
  for (const maxBytes of [1024, 1600, 8192, 65536]) {
    for (const diagnostics of [false, true]) {
      const packet = packCompactRecall(envelope, candidates, { maxBytes, diagnostics });
      assert.ok(bytes(packet) <= maxBytes);
      assert.equal(serializeCompactRecall(packet), JSON.stringify(packet) + "\n");
      assert.deepEqual(packet, packCompactRecall(envelope, candidates, { maxBytes, diagnostics }));
      assert.equal(packet.omitted.passages, 32 - packet.passages.length);
      assert.equal(Boolean(packet.diagnostics), diagnostics);
      for (const returned of packet.passages) assert.ok(candidates.some(c => c.passages.some(p => p.text === returned.text)), "never slice a qualification or Unicode code point to fit");
    }
  }
});

test("minimum/empty/default caps, invalid budgets and an oversized required envelope", () => {
  for (const maxBytes of [1024, 65536, undefined]) {
    const packet = packCompactRecall(envelope, [], { maxBytes });
    assert.equal(packet.maxBytes, maxBytes ?? 8192);
    assert.deepEqual(packet.omitted, { results: 0, passages: 0 });
    assert.ok(bytes(packet) <= packet.maxBytes);
    assert.equal(packet.partial, true);
  }
  for (const maxBytes of [0, 1023, 65537, 1024.1, NaN, Infinity, null, "8192"]) {
    assert.throws(() => packCompactRecall(envelope, [], { maxBytes }), { code: "invalid_budget" });
  }
  for (const largeEnvelope of [{ ...envelope, query: "🦋".repeat(500) }, { ...envelope, retrieval: { status: "partial", warnings: ["x".repeat(2000)] } }]) {
    assert.throws(() => packCompactRecall(largeEnvelope, [], { maxBytes: 1024 }), { code: "budget_too_small" });
  }
});

test("huge metadata is excluded by default and counted when diagnostics are explicitly requested", () => {
  const input = { ...passage(), diagnostics: { hitId: "qmd-not-a-document-id", score: 0.5, metadata: { arbitrary: "🐙".repeat(40000) } } };
  const plain = packCompactRecall(envelope, [{ passages: [input] }], { maxBytes: 1024 });
  assert.equal(plain.passages.length, 1);
  assert.equal(plain.passages[0].diagnostics, undefined);
  const diagnostic = packCompactRecall(envelope, [{ passages: [input] }], { maxBytes: 65536, diagnostics: true });
  assert.equal(diagnostic.passages.length, 0);
  assert.deepEqual(diagnostic.omitted, { results: 1, passages: 1 });
  assert.equal(diagnostic.diagnostics.budgetOmittedPassages, 1);
  assert.ok(bytes(diagnostic) <= diagnostic.maxBytes);
});

test("whole passage packing skips oversized evidence, preserves later evidence order and omission counts", () => {
  const packet = packCompactRecall(envelope, [
    { passages: [passage("x".repeat(3000)), passage("Second passage: provisional; NEVER use unattended.")], omittedPassages: 3 },
    { passages: [passage("Third passage.")] },
  ], { maxBytes: 1100 });
  assert.deepEqual(packet.passages.map(p => p.text), ["Second passage: provisional; NEVER use unattended.", "Third passage."]);
  assert.deepEqual(packet.omitted, { results: 0, passages: 4 });
});

test("written dates match human formatting validation/precedence without event-date inference", () => {
  assert.deepEqual(compactWrittenDate({ created_at: "2024-02-29", createdAt: "2025-01-01", date: "2020-01-01" }), { basis: "written", value: "2024-02-29", field: "created_at" });
  assert.deepEqual(compactWrittenDate({ created_at: "2023-02-29", createdAt: "2025-01-01T12:00:00Z" }), { basis: "written", value: "2025-01-01T12:00:00Z", field: "createdAt" });
  for (const created_at of ["2025-02-30", "2025-01-01\n", "2025-01-01T12:00:00", "0000-01-01", 20250101]) assert.deepEqual(compactWrittenDate({ created_at }), { basis: "unknown" });
  assert.deepEqual(compactWrittenDate({ date: "2020-01-01", updated_at: "2025-01-01" }), { basis: "unknown" });
});

test("source verification respects exact coordinates, existing markers, and long-line excerpts", () => {
  assert.ok(excerptMatchesSource("Allowed in sandbox. NOT production.", 2, 3, "# Rule\nAllowed in sandbox.\nNOT production.\n"));
  assert.ok(!excerptMatchesSource("Allowed in sandbox.", 2, 3, "# Rule\nAllowed in sandbox.\nNOT production.\n"));
  assert.ok(!excerptMatchesSource("Allowed in sandbox. NOT production.", 1, 2, "# Rule\nAllowed in sandbox.\nNOT production.\n"));
  assert.ok(excerptMatchesSource("… Trial only … [partial excerpt; expand source] [ancestor context omitted; expand source]", 1, 1, "Start Trial only more context"));
  assert.ok(!excerptMatchesSource("Trial only … [partial excerpt; expand source]", 1, 1, "Start Trial only more context"));
  assert.ok(!excerptMatchesSource("Trial only", 1, 10, "Trial only"));
});

async function fixture(t, files, rows) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-compact-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  const documents = await readMarkdownDocuments(root);
  const manifest = manifestPath(root);
  await mkdir(path.dirname(manifest), { recursive: true });
  await writeFile(manifest, JSON.stringify({ version: 1, root, generatedAt: new Date(0).toISOString(), qmdCollection: "jumpybrain", documents }));
  const { bin } = await installFakeQmd(root);
  await writeFile(bin, `#!${process.execPath}\nconsole.log(JSON.stringify(${JSON.stringify(rows.map(row => ({ score: 0.5, ...row, file: `qmd://jumpybrain/${row.file}` })))}));\n`);
  await chmod(bin, 0o755);
  const prior = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = bin;
  t.after(() => { if (prior === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = prior; });
  return root;
}
const note = (documentId, body, extra = "") => `---\n${documentId ? `id: ${documentId}\n` : ""}type: note\n${extra}---\n${body}\n`;

test("app returns source-backed canonical expansion tokens, qualifications, and separate QMD diagnostics", async t => {
  const file = "notes/trial.md";
  const content = note(id, "# Trial\nCalibration is provisional.\nNOT approved for production.\n# Independent\nCalibration requires two observers.", "created_at: 2024-02-29\n");
  const root = await fixture(t, { [file]: content }, [
    { file, line: 7, snippet: "@@ -6,3 @@\n# Trial\nCalibration is provisional.\nNOT approved for production." },
    { file, line: 10, snippet: "@@ -9,2 @@\n# Independent\nCalibration requires two observers." },
  ]);
  const packet = await compactSearchMemory(root, "calibration", 5, { diagnostics: true });
  assert.equal(packet.kind, "recall");
  assert.equal(packet.passages.length, 2);
  assert.notEqual(packet.readiness.freshness, "fresh");
  assert.equal(packet.retrieval.status, "partial");
  assert.match(packet.passages[0].text, /NOT approved/);
  for (const p of packet.passages) {
    assert.equal(p.documentId, id);
    assert.notEqual(p.diagnostics.hitId, id);
    assert.equal(p.expansion.available, true);
    assert.equal(p.expansion.expectedContentHash, hashMemoryDocumentContent(content));
    assert.equal(p.filePath, file);
    assert.equal(p.date.basis, "written");
    const expanded = await expandCanonicalMemoryDocument(root, p.expansion);
    assert.equal(expanded.startLine, p.startLine);
    assert.equal(expanded.endLine, p.endLine);
    assert.equal(expanded.contentHash, p.expansion.expectedContentHash);
  }
  assert.equal(await readFile(path.join(root, file), "utf8"), content);
  assert.ok(bytes(packet) <= packet.maxBytes);
});

test("IDless, invalid and duplicate IDs stay searchable but never acquire a guessed unique identity", async t => {
  const files = {
    "notes/idless.md": note(null, "Calibration is NOT approved."),
    "notes/invalid.md": note("not-canonical", "Calibration is NOT approved."),
    "notes/duplicate-a.md": note(id, "Calibration is NOT approved."),
    "notes/duplicate-b.md": note(id, "Calibration is NOT approved."),
  };
  const root = await fixture(t, files, Object.keys(files).map(file => ({ file, line: 5, snippet: "Calibration is NOT approved." })));
  const packet = await compactSearchMemory(root, "calibration", 10, { depth: "deep" });
  assert.equal(packet.passages.length, 4);
  for (const p of packet.passages) {
    assert.equal(p.documentId, undefined);
    assert.equal(p.expansion.available, false);
    assert.equal(p.expansion.reason, p.filePath.includes("idless") ? "missing_id" : p.filePath.includes("invalid") ? "invalid_id" : "duplicate_id");
    assert.equal(await readFile(path.join(root, p.filePath), "utf8"), files[p.filePath]);
  }
});

test("stale backend excerpts beyond repair bound cannot be validated by a current-source hash", async t => {
  const file = "notes/large.md";
  const content = note(id, "x".repeat(128 * 1024) + "\nCalibration is NOT approved.");
  const root = await fixture(t, { [file]: content }, [{ file, line: 6, snippet: "@@ -6,1 @@\nCalibration is approved." }]);
  const packet = await compactSearchMemory(root, "calibration", 5, { depth: "deep" });
  assert.equal(packet.passages.length, 1);
  assert.match(packet.passages[0].text, /Calibration is approved/);
  assert.deepEqual(packet.passages[0].expansion, { available: false, reason: "source_changed" });
  assert.equal(JSON.stringify(packet).includes(hashMemoryDocumentContent(content)), false);
});

test("a valid ID on another file never redirects expansion to the wrong canonical source", async t => {
  const file = "notes/original.md";
  const root = await fixture(t, { [file]: note(id, "Calibration is provisional."), "notes/other.md": note(id2, "Calibration is provisional.") }, [{ file, line: 5, snippet: "Calibration is provisional." }]);
  // Keep the indexed metadata ID while swapping current canonical identities.
  await writeFile(path.join(root, file), note(id2, "Calibration is provisional."));
  await writeFile(path.join(root, "notes/other.md"), note(id, "Calibration is provisional."));
  const packet = await compactSearchMemory(root, "calibration", 1, { depth: "deep" });
  assert.equal(packet.passages[0].documentId, undefined);
  assert.deepEqual(packet.passages[0].expansion, { available: false, reason: "source_mismatch" });
});


test("app enforces caps with huge frontmatter without leaking it into normal recall", async t => {
  const file = "notes/metadata.md";
  const content = note(id, "Calibration is provisional; NOT approved for production.", `arbitrary: ${"🐙".repeat(20000)}\n`);
  const root = await fixture(t, { [file]: content }, [{ file, line: 6, snippet: "Calibration is provisional; NOT approved for production." }]);
  const plain = await compactSearchMemory(root, "calibration", 5, { maxBytes: 1024 });
  assert.equal(plain.passages.length, 1);
  assert.ok(bytes(plain) <= 1024);
  assert.equal(plain.passages[0].expansion.available, true);
  assert.equal(JSON.stringify(plain).includes("arbitrary"), false);
  const diagnostic = await compactSearchMemory(root, "calibration", 5, { maxBytes: 65536, diagnostics: true });
  assert.equal(diagnostic.passages.length, 0);
  assert.equal(diagnostic.omitted.passages, 1);
  assert.ok(bytes(diagnostic) <= 65536);
});

test("compact written dates follow verified current source metadata rather than a stale manifest", async t => {
  const file = "notes/current-date.md";
  const content = note(id, "Calibration is provisional.", "created_at: 2024-01-01\n");
  const root = await fixture(t, { [file]: content }, [{ file, line: 6, snippet: "Calibration is provisional." }]);
  const updated = content.replace("2024-01-01", "2025-02-02");
  await writeFile(path.join(root, file), updated);
  const packet = await compactSearchMemory(root, "calibration", 5);
  assert.equal(packet.passages[0].date.value, "2025-02-02");
  assert.equal(packet.passages[0].expansion.available, true);
  assert.equal(packet.passages[0].expansion.expectedContentHash, hashMemoryDocumentContent(updated));
});

test("app rejects invalid budgets before invoking search", async () => {
  await assert.rejects(compactSearchMemory("/nonexistent/unused", "query", 5, { maxBytes: 1023 }), { code: "invalid_budget" });
});

test("a repaired current excerpt receives the current hash; later edits require refreshed expansion", async t => {
  const file = "notes/current.md";
  const root = await fixture(t, { [file]: note(id, "Calibration is approved.") }, [{ file, line: 5, snippet: "Calibration is approved." }]);
  const current = note(id, "Calibration is NOT approved.");
  await writeFile(path.join(root, file), current);
  const packet = await compactSearchMemory(root, "calibration", 5);
  const p = packet.passages[0];
  assert.match(p.text, /NOT approved/);
  assert.equal(p.expansion.expectedContentHash, hashMemoryDocumentContent(current));
  await writeFile(path.join(root, file), note(id, "Calibration requires a new trial."));
  await assert.rejects(expandCanonicalMemoryDocument(root, p.expansion), { code: "precondition_failed" });
});

test("retrieval-only subroots preserve canonical expansion paths rather than guessing from a hit ID", async t => {
  const file = "notes/subroot.md";
  const root = await fixture(t, { [file]: note(id, "Calibration is NOT approved.") }, [{ file: "subroot.md", line: 5, snippet: "Calibration is NOT approved." }]);
  const sourceRoot = path.join(root, "notes");
  const manifestFile = manifestPath(root);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.sourceRoot = sourceRoot;
  manifest.documents = await readMarkdownDocuments(sourceRoot);
  await writeFile(manifestFile, JSON.stringify(manifest));
  await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ schemaVersion: 1, canonical: "markdown", derivedDir: ".jumpybrain", memoryDirs: ["notes", "findings", "decisions", "preferences", "sessions", "pages"], indexRoot: "notes" }));
  const packet = await compactSearchMemory(root, "calibration", 5);
  assert.equal(packet.passages[0].filePath, file);
  assert.equal(packet.passages[0].expansion.available, true);
});


test("the exact byte boundary counts optional diagnostics and the final LF", () => {
  const candidates = [{ passages: [passage("🐙\\\"\n".repeat(100))] }];
  const complete = packCompactRecall(envelope, candidates, { maxBytes: 4096, diagnostics: true });
  const exactBudget = bytes(complete);
  assert.ok(exactBudget >= 1024 && exactBudget < 4096);
  const exact = packCompactRecall(envelope, candidates, { maxBytes: exactBudget, diagnostics: true });
  assert.equal(bytes(exact), exactBudget);
  assert.equal(exact.passages.length, 1);
  const below = packCompactRecall(envelope, candidates, { maxBytes: exactBudget - 1, diagnostics: true });
  assert.equal(below.passages.length, 0);
  assert.equal(below.omitted.passages, 1);
});
