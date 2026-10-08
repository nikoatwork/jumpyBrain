import assert from "node:assert/strict";
import test from "node:test";
import { selectEvidenceExcerpt } from "../dist/core/retrieval-policy/excerpts.js";
import { formatHumanResults } from "../dist/cli/formatting.js";

// Reproducible evidence-coverage ablation, NOT a model/agent benchmark. Labels
// name required literal facts/qualifications. A missing label triggers a simulated
// full-document expansion; this upper-bound fallback is not predicted behavior.
const cases = [
  {
    topic: "irrigation pressure", shape: "arbitrary headings",
    lines: ["# Inventory", "Routine catalogue entry. ".repeat(40), "# Field result", "Irrigation pressure must stay at 1.5 bar. Higher pressure damages the emitter."],
    query: ["irrigation", "pressure"], required: ["1.5 bar", "damages the emitter"],
  },
  {
    topic: "invoice refunds", shape: "heading-free prose",
    lines: ["Old account reference. ".repeat(50), "", "Refund a settled invoice within seven business days. Cancel pending invoices instead."],
    query: ["refund", "invoice"], required: ["seven business days", "Cancel pending invoices"],
  },
  {
    topic: "authorization state", shape: "nested list",
    lines: ["# Archive", "Routine release log. ".repeat(50), "# Security", "- Reject OAuth callbacks unless state equals the stored nonce.", "  - Never reuse a nonce after accepting the callback."],
    query: ["oauth", "nonce"], required: ["unless state equals", "Never reuse a nonce"],
  },
  {
    topic: "lab calibration", shape: "governing scope",
    lines: ["# Rules", "Laboratory use ONLY; field operation is prohibited.", "## Calibration", "Calibration requires an observer."],
    query: ["calibration"], required: ["field operation is prohibited", "requires an observer"],
  },
  {
    topic: "editor preference", shape: "already sufficient short preference",
    lines: ["Prefer spaces for indentation; use two spaces, except in imported files."],
    query: ["indentation"], required: ["two spaces", "except in imported files"],
  },
  {
    topic: "database rollout", shape: "cross-section expansion still necessary",
    lines: ["# Rollout", "Database rollout is approved for the pilot.", "# Review", "External rollout remains blocked until audit approval."],
    query: ["database"], required: ["approved for the pilot", "blocked until audit approval"],
  },
];

function presentAll(text, required) { return required.every((fact) => text.includes(fact)); }

test("cross-topic default evidence ablation records coverage and expansion characters, not promised agent savings", (t) => {
  const totals = { legacyCovered: 0, currentCovered: 0, legacyInitialChars: 0, currentInitialChars: 0, legacyWithFallbackChars: 0, currentWithFallbackChars: 0 };
  for (const [index, fixture] of cases.entries()) {
    const content = fixture.lines.join("\n");
    const compact = content.replace(/\s+/g, " ").trim();
    const legacy = compact.length <= 500 ? compact : compact.slice(0, 500) + "…";
    const current = selectEvidenceExcerpt(fixture.lines, { bodyStartLine: 1, lineStart: 1, lineEnd: fixture.lines.length,
      terms: fixture.query.map((text) => ({ text, weight: 2 })) });
    const file = `notes/evaluation-${index}.md`;
    const oldOutput = `1. ${file}:1-${fixture.lines.length} score=1\n   ${legacy}`;
    const newOutput = formatHumanResults([{ id: "fixture", score: 1, ...current,
      provenance: { file, lineStart: current.lineStart, lineEnd: current.lineEnd,
        metadata: { title: fixture.topic, type: "note", created_at: "2026-01-01" } } }]);
    const oldCovered = presentAll(legacy, fixture.required);
    const newCovered = presentAll(current.snippet, fixture.required);
    totals.legacyCovered += Number(oldCovered);
    totals.currentCovered += Number(newCovered);
    totals.legacyInitialChars += oldOutput.length;
    totals.currentInitialChars += newOutput.length;
    totals.legacyWithFallbackChars += oldOutput.length + (oldCovered ? 0 : content.length);
    totals.currentWithFallbackChars += newOutput.length + (newCovered ? 0 : content.length);
    assert.ok(current.snippet.length <= 1000);
    if (index < cases.length - 1) assert.ok(newCovered, fixture.shape);
    else assert.equal(newCovered, false, "section boundaries cannot promise to answer cross-section questions");
  }
  assert.ok(totals.currentCovered > totals.legacyCovered);
  // This set deliberately includes an already adequate hit that pays metadata
  // overhead, and an unresolved cross-section case. It is not a quality corpus.
  t.diagnostic(JSON.stringify({ cases: cases.length, ...totals, tokenAccounting: "characters only; chars/4 would be an estimate" }));
});
