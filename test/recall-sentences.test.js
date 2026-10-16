import assert from "node:assert/strict";
import test from "node:test";
import { selectEvidenceExcerpt } from "../dist/core/retrieval-policy/excerpts.js";
import { excerptMatchesSource } from "../dist/core/retrieval-policy/compact.js";

const PARTIAL = " … [partial excerpt; expand source]";
const compact = (text) => text.replace(/\s+/gu, " ").trim();
const prelude = "Ordinary background describes the earlier enclosed observation. ";
const tail = "Later inventory describes an unrelated historical observation. ";
const selected = "The QUARTZ observation remains provisional. Only the enclosed trial is authorized.";
function select(lines, anchor, maxChars = 1000, query = "quartz") {
  return selectEvidenceExcerpt(lines, { bodyStartLine: 1, lineStart: anchor, lineEnd: anchor,
    terms: [{ text: query, weight: 2 }], maxChars });
}
function evidence(result) {
  return result.snippet.replace(/ \[ancestor context omitted; expand source\]$/u, "")
    .replace(/ … \[partial excerpt; expand source\]$/u, "").replace(/^… /u, "");
}
function integrity(result, lines, maximum) {
  assert.ok(result.snippet.length <= maximum);
  assert.ok(excerptMatchesSource(result.snippet, result.lineStart, result.lineEnd, lines.join("\n")), "compact verifier accepts actual source and coordinates");
  assert.ok(compact(lines.slice(result.lineStart - 1, result.lineEnd).join("\n")).includes(evidence(result)), "unchanged contiguous source, apart from whitespace compaction and markers");
  assert.match(result.snippet, /partial excerpt; expand source/);
}
function oldSlice(line, maximum, query = "quartz") {
  const text = compact(line), match = text.toLowerCase().indexOf(query);
  const budget = maximum - PARTIAL.length - 2;
  let offset = Math.max(0, match - Math.floor(budget / 3));
  if (offset > 0) { const space = text.indexOf(" ", offset); if (space >= 0 && space < match) offset = space + 1; }
  let end = Math.min(text.length, offset + budget);
  if (end < text.length) { const space = text.lastIndexOf(" ", end); if (space > match) end = space; }
  return (offset ? "… " : "") + text.slice(offset, end) + PARTIAL;
}

test("late prose match prefers complete contiguous sentences and immediate qualification", () => {
  const lines = ["## Unusual classification 🐙", prelude.repeat(30) + selected + " " + tail.repeat(30)];
  const result = select(lines, 2, 180);
  assert.equal(evidence(result), selected);
  assert.equal(result.lineStart, 2);
  assert.equal(result.lineEnd, 2);
  assert.ok(result.snippet.startsWith("… "));
  integrity(result, lines, 180);
});

test("sentence preference preserves first selected occurrence, not a later easier repeated match", () => {
  const first = "The QUARTZ first observation is provisional.";
  const later = "The QUARTZ later observation is unrelated.";
  const lines = [prelude.repeat(25) + first + " " + tail.repeat(25) + later];
  const result = select(lines, 1, 140);
  assert.match(evidence(result), /first observation/);
  assert.doesNotMatch(evidence(result), /later observation/);
  integrity(result, lines, 140);
});

test("Unicode prose and compacted whitespace retain source identity under varied budgets", () => {
  const lines = ["", "Résumé observations describe naïve café visitors 🐙 today. ".repeat(30)
    + "The QUARTZ observation includes café and 東京 🐙 evidence.\tOnly the enclosed trial is authorized. " + tail.repeat(30)];
  for (const maximum of [100, 140, 180, 260, 1000]) {
    const result = select(lines, 2, maximum);
    assert.match(result.snippet, /QUARTZ/);
    assert.equal(result.lineStart, 2);
    assert.equal(result.lineEnd, 2);
    assert.match(evidence(result), /[.!?]$/u);
    assert.match(evidence(result), /^\p{Lu}/u);
    integrity(result, lines, maximum);
  }
});

test("sentence selection does not imply inclusion of distant qualifications", () => {
  const lines = [prelude.repeat(30) + selected + " " + tail.repeat(30) + "External use is not authorized."];
  const result = select(lines, 1);
  assert.match(result.snippet, /QUARTZ/);
  assert.doesNotMatch(result.snippet, /External use/);
  integrity(result, lines, 1000);
});

for (const [name, middle] of [
  ["no punctuation", "quartz observation " + "unbroken prose ".repeat(100)],
  ["punctuation-free long word", "quartz " + "x".repeat(64000)],
  ["overlong selected sentence", "The QUARTZ observation " + "has additional qualifications ".repeat(100) + "before approval."],
  ["abbreviation", "The QUARTZ observation uses approx. five samples."],
  ["initials", "The QUARTZ observation belongs to A. Smith."],
  ["decimal", "The QUARTZ observation uses 3.14 samples."],
  ["ellipsis", "The QUARTZ observation remains... provisional."],
  ["quoted sentence", 'The QUARTZ observation says "wait."'],
  ["lowercase sentence opening", "The QUARTZ observation is provisional. only trial use is authorized."],
  ["link destination", "The QUARTZ observation references [trial](https://example.test/v1.2/details)."],
  ["inline code", "The QUARTZ observation uses `trial.run()`."],
  ["emphasis", "The QUARTZ observation is *provisional*."],
]) {
  test(`${name} keeps the existing match-centered fallback`, () => {
    const line = prelude.repeat(30) + middle + " " + tail.repeat(30);
    const result = select([line], 1, 180);
    assert.equal(result.snippet, oldSlice(line, 180));
    assert.match(result.snippet, /quartz/i);
    integrity(result, [line], 180);
  });
}

for (const [name, prefix, suffix] of [
  ["list", "- ", ""], ["indented code", "    ", ""], ["blockquote", "> ", ""],
  ["fenced code", "", ""], ["wrapped paragraph", "", ""],
]) {
  test(`${name} is not reinterpreted as a single-line prose paragraph`, () => {
    const line = prefix + prelude.repeat(30) + selected + " " + tail.repeat(30) + suffix;
    const lines = name === "fenced code" ? ["```text", line, "```"]
      : name === "wrapped paragraph" ? ["Earlier continuation of this paragraph", line, "Later continuation"] : [line];
    const anchor = lines.indexOf(line) + 1;
    const result = select(lines, anchor, 180);
    assert.equal(result.snippet, oldSlice(line, 180));
    integrity(result, lines, 180);
  });
}

test("sentence slices retain partial and ancestor markers together within the default bound", () => {
  const lines = ["# Governing scope", prelude.repeat(30), "", "## Arbitrary subsection",
    prelude.repeat(30) + selected + " " + tail.repeat(30)];
  for (const maximum of [100, 140, 180, 1000]) {
    const result = select(lines, 5, maximum);
    assert.match(result.snippet, /QUARTZ/);
    assert.match(result.snippet, /partial excerpt; expand source\] \[ancestor context omitted; expand source\]$/u);
    assert.equal(result.lineStart, 5);
    assert.equal(result.lineEnd, 5);
    integrity(result, lines, maximum);
  }
});

test("oversized first sentence is not replaced with a later duplicate that fits", () => {
  const line = "The QUARTZ first observation " + "has further conditions ".repeat(100)
    + "before approval. The QUARTZ later observation is unrelated. " + tail.repeat(30);
  const result = select([line], 1, 180);
  assert.equal(result.snippet, oldSlice(line, 180));
  assert.match(result.snippet, /first observation/);
  integrity(result, [line], 180);
});

test("sentence slices at the start do not invent a leading omission", () => {
  const lines = [selected + " " + tail.repeat(30)];
  const result = select(lines, 1, 180);
  assert.equal(evidence(result), selected);
  assert.ok(!result.snippet.startsWith("… "));
  integrity(result, lines, 180);
});

for (const heading of [[], ["## Arbitrary classification"], ["Arbitrary classification", "------------------------"], ["## Arbitrary classification", ""]]) {
  test(`single-line prose permits an optional structural heading prefix: ${heading.join(" / ") || "none"}`, () => {
    const lines = [...heading, prelude.repeat(30) + selected + " " + tail.repeat(30)];
    const result = select(lines, lines.length, 180);
    assert.equal(evidence(result), selected);
    assert.equal(result.lineStart, lines.length);
    assert.equal(result.lineEnd, lines.length);
    integrity(result, lines, 180);
  });
}

test("question and exclamation boundaries preserve the selected sentence and contiguous qualification", () => {
  const passage = "Is the QUARTZ observation provisional? Only enclosed trial use is authorized!";
  const lines = [prelude.repeat(30) + passage + " " + tail.repeat(30)];
  const result = select(lines, 1, 140);
  assert.equal(evidence(result), passage);
  integrity(result, lines, 140);
});

test("multi-word selected terms retain the same occurrence and sentence", () => {
  const lines = [prelude.repeat(30) + selected + " " + tail.repeat(30)];
  const result = select(lines, 1, 180, "quartz observation");
  assert.equal(evidence(result), selected);
  integrity(result, lines, 180);
});
