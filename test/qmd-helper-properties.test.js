import assert from "node:assert/strict";
import test from "node:test";

import { normalizeQmdLookupPath, qmdVirtualPathToRelative } from "../dist/qmd/qmd-cli.js";
import { assertProperty, fc, relativePathArbitrary } from "./property-helpers.js";

test("QMD virtual paths decode jumpyBrain collection relative paths", () => {
  assertProperty(fc.property(relativePathArbitrary, (relativePath) => {
    const virtualPath = `qmd://jumpybrain/${encodeURIComponent(relativePath)}`;

    assert.equal(qmdVirtualPathToRelative(virtualPath), relativePath);
  }));
});

test("QMD virtual paths from other prefixes are ignored", () => {
  const nonJumpyBrainPrefix = fc.constantFrom("", "qmd://other/", "file://", "https://example.test/", "qmd://jumpybrainx/");

  assertProperty(fc.property(nonJumpyBrainPrefix, relativePathArbitrary, (prefix, relativePath) => {
    assert.equal(qmdVirtualPathToRelative(`${prefix}${encodeURIComponent(relativePath)}`), undefined);
  }));
});

test("QMD lookup path normalization is lowercase and replaces underscores", () => {
  const mixedPath = fc
    .array(fc.constantFrom("Sessions", "Answer_ShareGPT", "Mixed_CASE", "plain", "Under_score"), { minLength: 1, maxLength: 5 })
    .map((segments) => `${segments.join("/")}.md`);

  assertProperty(fc.property(mixedPath, (file) => {
    const normalized = normalizeQmdLookupPath(file);

    assert.equal(normalized, normalized.toLowerCase());
    assert.equal(normalized.includes("_"), false);
  }));
});
