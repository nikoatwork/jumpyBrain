import assert from "node:assert/strict";
import test from "node:test";
import { selectEvidenceExcerpt } from "../dist/core/retrieval-policy/excerpts.js";
import { compactEvidenceLinks } from "../dist/cli/evidence-links.js";
import { formatHumanResults } from "../dist/cli/formatting.js";

for (const title of ["# OAuth callback state validation nonce", "OAuth callback state validation nonce\n====================================", "## OAuth callback state validation nonce"]) {
  test(`main heading is a fallback, not the excerpt match: ${title.split("\n")[0]}`, () => {
    const lines = [...title.split("\n"), "Unrelated background. ".repeat(100), "", "### Safety", "The nonce must not be reused."];
    const result = selectEvidenceExcerpt(lines, { bodyStartLine: 1, lineStart: 1, lineEnd: lines.length,
      terms: ["oauth", "callback", "state", "validation", "nonce"].map((text) => ({ text, weight: 2 })) });
    assert.match(result.snippet, /nonce must not be reused/);
    assert.doesNotMatch(result.snippet, /Unrelated background/);
    assert.equal(result.lineEnd, lines.length);
  });
}

test("title-only notes and title-only backend windows retain their fallback without global matching", () => {
  for (const lines of [["# Heading only"], ["Heading only", "============"]]) {
    assert.match(selectEvidenceExcerpt(lines, { bodyStartLine: 1, lineStart: 1, lineEnd: lines.length }).snippet, /Heading only/);
  }
  const lines = ["# Topic", "", "## Remote section", "A different candidate's evidence."];
  const result = selectEvidenceExcerpt(lines, { bodyStartLine: 1, lineStart: 1, lineEnd: 1, terms: [{ text: "evidence", weight: 2 }] });
  assert.doesNotMatch(result.snippet, /different candidate/);
});

test("short links and literal backtick code remain exact", () => {
  const long = "https://example.test/" + "component/".repeat(20) + "report.md?scope=review#limits";
  const prose = "[short](../notes/report.md) https://example.test/a `" + long + "` ```sh curl " + long + " ```";
  assert.deepEqual(compactEvidenceLinks(prose), { text: prose, shortened: false });
  assert.deepEqual(compactEvidenceLinks("`unclosed " + long), { text: "`unclosed " + long, shortened: false });
});

test("long labeled and bare URLs are compact with identity hints, without losing labels", () => {
  const prefix = "https://example.test/" + "shared-component/".repeat(10);
  const a = prefix + "bench/" + "nested/".repeat(10) + "report.md?scope=review#limits";
  const b = prefix + "field/" + "nested/".repeat(10) + "report.md?scope=review#limits";
  const result = compactEvidenceLinks(`[Bench](${a}) [Field](${b}) ${a}`);
  assert.equal(result.shortened, true);
  assert.ok(result.text.length < 260);
  assert.match(result.text, /\[Bench\]\(https:\/\/example.test/);
  assert.match(result.text, /\[Field\]/);
  const hints = [...result.text.matchAll(/~([a-f0-9]{8})/g)].map((match) => match[1]);
  assert.equal(hints.length, 3);
  assert.notEqual(hints[0], hints[1], "same-basename links with identical ends must remain distinguishable");
  assert.equal(hints[0], hints[2], "the same destination gets a stable identity hint");
  const relative = compactEvidenceLinks(`[source](../notes/${"folder/".repeat(30)}decision.md)`);
  assert.equal(relative.shortened, true);
});

test("plain primary and secondary excerpts abbreviate links with one warning; source and JSON stay exact", () => {
  const url = "https://example.test/" + "component/".repeat(30) + "decision.md";
  const provenance = { file: "notes/long-source-path.md", lineStart: 12, lineEnd: 14 };
  const results = [{ id: "hit", score: 1, snippet: `[decision](${url})`, provenance,
    passages: [{ snippet: `A qualification: ${url}`, provenance: { ...provenance, lineStart: 30, lineEnd: 32 } }] }];
  const before = JSON.stringify(results);
  const output = formatHumanResults(results);
  assert.doesNotMatch(output, new RegExp("component/".repeat(30)));
  assert.match(output, /notes\/long-source-path.md:12-14/);
  assert.match(output, /notes\/long-source-path.md:30-32/);
  assert.equal(output.split("Links abbreviated").length, 2);
  assert.match(output, /--json/);
  assert.equal(JSON.stringify(results), before);
});
