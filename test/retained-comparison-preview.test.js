import assert from "node:assert/strict";
import test from "node:test";
import { retainedComparisonPreview } from "../dist/adapters/http-server/document-retained-versions.js";

test("retained comparison identifies separated removed and added passages without modifying either copy", () => {
  const before = "Title\n\nOriginal first\nuntouched middle\nOriginal last\n";
  const after = "Title\n\nReplacement first\nuntouched middle\nReplacement last\n";
  const preview = retainedComparisonPreview(before, after);
  assert.match(preview, /Retained passage:/);
  assert.match(preview, /Current saved passage:/);
  assert.match(preview, /Original/);
  assert.match(preview, /Replacement/);
  assert.doesNotMatch(preview, /untouched middle/);
  assert.match(preview, /Change 2/);
  assert.equal(before, "Title\n\nOriginal first\nuntouched middle\nOriginal last\n");
  assert.equal(after, "Title\n\nReplacement first\nuntouched middle\nReplacement last\n");
});

test("retained comparison distinguishes equal text and full insertion or deletion", () => {
  assert.equal(retainedComparisonPreview("same", "same"), "These versions contain the same text.");
  assert.match(retainedComparisonPreview("", "new note"), /Retained passage:\n\(nothing\)\nCurrent saved passage:\nnew note/);
  assert.match(retainedComparisonPreview("old note", ""), /Retained passage:\nold note\nCurrent saved passage:\n\(nothing\)/);
});

test("large recovery comparisons show bounded excerpts and explicitly retain full-copy review", () => {
  const preview = retainedComparisonPreview("a".repeat(1_600_000), "b".repeat(1_600_000));
  assert.ok(preview.length < 3000);
  assert.match(preview, /Large comparison/);
  assert.match(preview, /compare the full copies below/);
  assert.match(preview, /a{100}/);
  assert.match(preview, /b{100}/);
  assert.match(preview, /passage shortened/);
});

test("bounded recovery excerpts keep Unicode pairs intact at shared and shortened boundaries", () => {
  const preview = retainedComparisonPreview("prefix" + "🐐".repeat(100_000) + "suffix", "prefix" + "🐑".repeat(100_000) + "suffix");
  assert.ok(preview.isWellFormed());
  assert.ok(preview.length < 3000);
  assert.match(preview, /🐐/);
  assert.match(preview, /🐑/);
});
