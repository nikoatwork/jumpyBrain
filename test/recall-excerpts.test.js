import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { selectEvidenceExcerpt } from "../dist/core/retrieval-policy/excerpts.js";
import { excerptFromQmdWindow, neighborSnippetFromOriginal, snippetFromOriginalBody } from "../dist/adapters/qmd/qmd-snippets.js";
import { manifestPath, searchQmdIndex } from "../dist/adapters/qmd/qmd-driver.js";

const compact = (text) => text.replace(/\s+/gu, " ").trim();
const terms = (...words) => words.map((text) => ({ text, weight: 2 }));
function select(lines, anchor, options = {}) {
  return selectEvidenceExcerpt(lines, { bodyStartLine: 1, lineStart: anchor, lineEnd: anchor, ...options });
}
function assertWholeSource(result, lines) {
  assert.ok(result.lineStart >= 1 && result.lineEnd <= lines.length && result.lineStart <= result.lineEnd);
  assert.equal(result.snippet.replace(/ \[ancestor context omitted; expand source\]$/, ""), compact(lines.slice(result.lineStart - 1, result.lineEnd).join("\n")), "whole excerpts must describe exactly their cited source range apart from explicit scope warnings");
}
async function documentFixture(t, lines, bodyStartLine = 1) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jumpy-excerpts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const document = { absolutePath: path.join(root, "note.md"), relativePath: "note.md", bodyStartLine, frontmatter: {} };
  await writeFile(document.absolutePath, lines.join("\n"));
  return document;
}

test("structural excerpts exclude long metadata prefixes and retain the actual late body match", () => {
  const metadata = ["---", ...Array.from({ length: 90 }, (_, i) => `field_${i}: calibration metadata`), "---"];
  const lines = [...metadata, "# Background", "Routine archive detail. ".repeat(80), "", "## Unusual finding", "Calibration requires a second observer.", "It is not authorized for unattended use.", "", "## Elsewhere", "Unrelated."];
  const result = selectEvidenceExcerpt(lines, { bodyStartLine: metadata.length + 1, lineStart: 1, lineEnd: lines.length, terms: terms("observer") });
  assert.match(result.snippet, /second observer/);
  assert.match(result.snippet, /not authorized/);
  assert.doesNotMatch(result.snippet, /field_\d|Elsewhere/);
  assertWholeSource(result, lines);
});

for (const heading of ["## Unexpected taxonomy 🐙", "### 2028 / 仕様", "Unfamiliar section\n------------------"]) {
  test(`arbitrary heading boundaries preserve qualifications: ${heading.split("\n")[0]}`, () => {
    const lines = ["# Other", "Unrelated preface.", ...heading.split("\n"), "Valve calibration is provisional.", "Do not use it above ten bar.", "", "# Different subject", "Do not conflate this separate decision."];
    const anchor = lines.indexOf("Valve calibration is provisional.") + 1;
    const result = select(lines, anchor, { terms: terms("calibration") });
    assert.match(result.snippet, /provisional/);
    assert.match(result.snippet, /Do not use it above ten bar/);
    assert.doesNotMatch(result.snippet, /Different subject|separate decision/);
    assert.match(result.snippet, /Unrelated preface/, "the apparent preface structurally governs this subsection, so retain it rather than assuming it is unrelated");
    assertWholeSource(result, lines);
  });
}

test("heading-free paragraphs include immediate qualifications without consuming an oversized unrelated preface", () => {
  const lines = ["Old inventory detail. ".repeat(100), "", "The valve calibration passed the bench trial.", "", "However, field operation is not approved until a second observer signs off.", "", "Unrelated archive appendix. ".repeat(100)];
  const result = select(lines, 3, { terms: terms("calibration"), maxChars: 260 });
  assert.match(result.snippet, /passed the bench trial/);
  assert.match(result.snippet, /not approved until a second observer/);
  assert.doesNotMatch(result.snippet, /Old inventory|Unrelated archive/);
  assertWholeSource(result, lines);
});

test("nested list evidence retains its parent and sibling qualifiers as one unit", () => {
  const lines = ["# Oversized inventory", "Unrelated preface. ".repeat(100), "", "- Calibration is provisionally approved:", "  - Only for the enclosed bench trial.", "    - External use is not approved.", "  - A second observer must attend.", "", "- Unrelated appendix. " + "Inventory detail. ".repeat(100)];
  const result = select(lines, 5, { terms: terms("bench"), maxChars: 260 });
  for (const evidence of ["provisionally approved", "enclosed bench trial", "External use is not approved", "second observer must attend"]) assert.ok(result.snippet.includes(evidence));
  assertWholeSource(result, lines);
});

for (const fence of ["```", "~~~~"]) {
  test(`fenced code with hash headings is not split into invented sections (${fence})`, () => {
    const lines = ["# Procedure", "Unrelated introduction. ".repeat(100), "", `${fence}sh`, "# calibration is a code comment", "printf 'trial only'", fence, "", "Never run this against production.", "", "# Other", "Unrelated."];
    const result = select(lines, 5, { terms: terms("calibration"), maxChars: 240 });
    assert.ok(result.snippet.includes(`${fence}sh`));
    assert.match(result.snippet, /printf 'trial only'/);
    assert.match(result.snippet, /Never run this against production/);
    assert.equal(result.snippet.split(fence).length - 1, 2, "retain both fence boundaries");
    assertWholeSource(result, lines);
  });
}

test("oversized long lines retain late matches, mark incompleteness, and respect the total character bound", () => {
  const lines = ["# Trial", "ordinary prelude ".repeat(600) + "QUARTZ verdict: external launch is not approved. " + "trailing detail ".repeat(20), "# Next"];
  for (const maxChars of [100, 180, 1000]) {
    const result = select(lines, 2, { terms: terms("quartz"), maxChars });
    assert.match(result.snippet, /QUARTZ/);
    assert.match(result.snippet, /partial|expand/i);
    assert.ok(result.snippet.length <= maxChars, `${result.snippet.length} exceeds ${maxChars}`);
    assert.equal(result.lineStart, 2);
    assert.equal(result.lineEnd, 2);
  }
});

test("presentation whitespace does not alter canonical source coordinates", () => {
  const lines = ["", " ", "## Odd heading", "", "\tValve calibration\tremains provisional.  ", "  No production use.\t", "", "  ", "# Next", "Other"];
  const result = select(lines, 5, { terms: terms("calibration") });
  assert.match(result.snippet, /Valve calibration remains provisional/);
  assert.match(result.snippet, /No production use/);
  assert.equal(result.lineStart, 3);
  assert.equal(result.lineEnd, 6);
  assertWholeSource(result, lines);
});

test("links preserve URLs and distinct same-basename targets rather than rewriting evidence", () => {
  const links = "[bench](../bench/report.md) [field](../field/report.md) [[bench/report]] [[field/report]] https://example.test/a/report.md?scope=bench#limits";
  const lines = ["# Calibration", "Calibration is provisional; consult " + links, "No external authorization."];
  const result = select(lines, 2, { terms: terms("calibration") });
  assert.ok(result.snippet.includes(links));
  assertWholeSource(result, lines);
});

test("URL keyword repetition does not outrank the actual statement", () => {
  const lines = ["# Index", "[catalog](https://example.test/calibration/observer/approval)", "# Finding", "Calibration observer approval is still pending."];
  const result = selectEvidenceExcerpt(lines, { bodyStartLine: 1, lineStart: 1, lineEnd: lines.length, terms: terms("calibration", "observer", "approval") });
  assert.match(result.snippet, /still pending/);
  assertWholeSource(result, lines);
});

test("canonical adapter repair searches beyond a long metadata prefix", async (t) => {
  const metadata = ["---", ...Array.from({ length: 150 }, (_, i) => `field_${i}: calibration`), "---"];
  const lines = [...metadata, "# Background", "Routine material.", "# Finding", "Calibration is not approved without an observer."];
  const document = await documentFixture(t, lines, metadata.length + 1);
  const result = await snippetFromOriginalBody(document, "calibration observer");
  assert.match(result.snippet, /not approved without an observer/);
  assert.doesNotMatch(result.snippet, /field_\d/);
  assertWholeSource(result, lines);
});

test("adapter retrieval queries retain punctuation-bearing identifiers and negative evidence", async (t) => {
  const lines = ["# Intro", "Routine overview.", "# Finding", "OAuth/state is not approved; see schema.v2 and src/auth.ts before proceeding.", "# Elsewhere", "Unrelated."];
  const document = await documentFixture(t, lines);
  for (const query of ["OAuth/state?", "schema.v2", "src/auth.ts", "Is OAuth/state not approved?!"]) {
    const result = await snippetFromOriginalBody(document, query);
    assert.match(result.snippet, /OAuth\/state is not approved/, query);
    assertWholeSource(result, lines);
  }
});

test("empty and punctuation-only queries are bounded and do not invent evidence", async (t) => {
  const lines = ["", "# Summary", "The trial remains provisional.", "No external release.", ""];
  const document = await documentFixture(t, lines);
  for (const query of ["", "   ", "?!..."]) {
    const result = await snippetFromOriginalBody(document, query);
    assert.match(result.snippet, /trial remains provisional/);
    assert.match(result.snippet, /No external release/);
    assertWholeSource(result, lines);
  }
  const empty = await documentFixture(t, []);
  assert.equal((await snippetFromOriginalBody(empty, "")).snippet, "");
});

test("QMD fallback keeps leading blank-line offsets and trailing evidence lines", () => {
  const result = excerptFromQmdWindow("@@ -701,5 @@\n\n  \nCalibration is provisional.\nNo production use.\n", 701, "calibration");
  assert.equal(result.lineStart, 703);
  assert.equal(result.lineEnd, 704);
  assert.match(result.snippet, /No production use/);
  assert.doesNotMatch(result.snippet, /@@/);
});

test("canonical prefix bound never fabricates an excerpt from an incomplete trailing line", async (t) => {
  const lines = ["# Background", "x".repeat(128 * 1024), "Calibration beyond the prefix is not approved."];
  const document = await documentFixture(t, lines);
  const result = await neighborSnippetFromOriginal(document, 3, 3, "calibration");
  assert.equal(result.snippet, "", "caller must use QMD window when the canonical line is outside the prefix");
});

// Exercise private resultSnippet through the real driver, with deterministic QMD
// rows. No external QMD installation, embeddings, indexing, or models are used.
async function driverFixture(t, lines, rows) {
  const document = await documentFixture(t, lines);
  const root = path.dirname(document.absolutePath);
  const manifest = manifestPath(root);
  await mkdir(path.dirname(manifest), { recursive: true });
  await writeFile(manifest, JSON.stringify({ version: 1, root, generatedAt: new Date(0).toISOString(), qmdCollection: "jumpybrain", documents: [document] }));
  const binary = path.join(root, "fake-qmd.cjs");
  await writeFile(binary, `#!${process.execPath}\nconsole.log(JSON.stringify(${JSON.stringify(rows.map((row) => ({ ...row, file: "qmd://jumpybrain/note.md", score: 0.5 })))}));\n`);
  await chmod(binary, 0o755);
  const previous = process.env.JUMPYBRAIN_QMD_BIN;
  process.env.JUMPYBRAIN_QMD_BIN = binary;
  t.after(() => { if (previous === undefined) delete process.env.JUMPYBRAIN_QMD_BIN; else process.env.JUMPYBRAIN_QMD_BIN = previous; });
  return root;
}

test("driver retains backend evidence and window coordinates beyond 128 KiB", async (t) => {
  const lines = ["# Background", "x".repeat(128 * 1024), "", "Calibration is provisional.", "External use is not approved."];
  const root = await driverFixture(t, lines, [{ line: 4, snippet: "@@ -3,3 @@\n\nCalibration is provisional.\nExternal use is not approved." }]);
  const results = await searchQmdIndex(root, "calibration", 5, { depth: "deep" });
  assert.equal(results.length, 1);
  assert.match(results[0].snippet, /External use is not approved/);
  assert.equal(results[0].provenance.lineStart, 4);
  assert.equal(results[0].provenance.lineEnd, 5);
});

test("driver does not replace a useful headed backend window with an unrelated earlier match", async (t) => {
  const lines = ["# Bench", "Calibration approved for the enclosed bench trial.", "", "# Field", "Calibration is not approved for field operation."];
  const root = await driverFixture(t, lines, [{ line: 5, snippet: "@@ -4,2 @@\n# Field\nCalibration is not approved for field operation." }]);
  const results = await searchQmdIndex(root, "calibration", 5, { depth: "deep" });
  assert.equal(results.length, 1);
  assert.match(results[0].snippet, /not approved for field operation/);
  assert.ok(results[0].provenance.lineStart >= 4, "repair stays near the backend evidence instead of globally selecting another hit");
});


test("canonical neighbor repair does not move the match into a following unrelated heading", async (t) => {
  const lines = ["# Field", "Calibration approval is denied for field operation.", "", "# Bench", "Calibration approval status: the enclosed bench trial is approved."];
  const document = await documentFixture(t, lines);
  const result = await neighborSnippetFromOriginal(document, 2, 2, "calibration approval status");
  assert.match(result.snippet, /denied for field operation/);
  assert.doesNotMatch(result.snippet, /bench trial is approved/);
  assertWholeSource(result, lines);
});

test("pathological unmatched Markdown brackets stay bounded without losing the match", () => {
  for (const prefix of ["[".repeat(64000), "[a](".repeat(16000)]) {
    const result = select([prefix + " QUARTZ is not approved."], 1, { terms: terms("quartz") });
    assert.match(result.snippet, /QUARTZ/);
    assert.match(result.snippet, /partial excerpt/);
    assert.ok(result.snippet.length <= 1000);
  }
});

test("subsection evidence retains governing parent scope or explicitly reports its omission", () => {
  const lines = ["# Deployment rules", "Allowed ONLY in the sandbox environment:", "", "## Configuration", "Set publication_mode = automatic."];
  const result = select(lines, 5, { terms: terms("publication_mode") });
  assert.match(result.snippet, /ONLY in the sandbox/);
  assertWholeSource(result, lines);
  const oversized = [...lines];
  oversized[1] += " Background context.".repeat(100);
  const partial = select(oversized, 5, { terms: terms("publication_mode") });
  assert.match(partial.snippet, /ancestor context omitted; expand source/);
  assert.ok(partial.snippet.length <= 1000);
});

test("backend fallback preserves genuine diff hunk headers and every source offset", () => {
  const lines = ["```diff", "@@ -1,2 +1,2 @@", "-Approved", "+Not approved", "```"];
  const result = excerptFromQmdWindow("@@ -701,5 @@\n" + lines.join("\n"), 701, "approved");
  assert.equal(result.snippet, compact(lines.join("\n")));
  assert.equal(result.lineStart, 701);
  assert.equal(result.lineEnd, 705);
});

test("a QMD window straddling the canonical prefix retains its later qualification", async (t) => {
  const suffix = "\n# Deployment\nPublication is approved.\n";
  const padding = "x".repeat(128 * 1024 - suffix.length);
  const qualification = "Only in the sandbox; production publication is NOT approved.";
  const lines = [padding + suffix.slice(0, -1), qualification];
  const root = await driverFixture(t, lines, [{ line: 3, snippet: "@@ -2,3 @@\n# Deployment\nPublication is approved.\n" + qualification }]);
  const results = await searchQmdIndex(root, "publication", 5, { depth: "deep" });
  assert.match(results[0].snippet, /production publication is NOT approved/);
  assert.equal(results[0].provenance.lineEnd, 4);
});

test("driver fallback treats source: in ordinary prose as evidence, not discarded metadata", async (t) => {
  const lines = ["# Background", "Calibration overview for an older unrelated trial.", "x".repeat(128 * 1024), "Calibration source: vendor manual; external use is not approved."];
  const root = await driverFixture(t, lines, [{ line: 4, snippet: "@@ -4,1 @@\nCalibration source: vendor manual; external use is not approved." }]);
  const results = await searchQmdIndex(root, "calibration", 5, { depth: "deep" });
  assert.equal(results.length, 1);
  assert.match(results[0].snippet, /external use is not approved/);
  assert.equal(results[0].provenance.lineStart, 4);
  assert.equal(results[0].provenance.lineEnd, 4);
});
