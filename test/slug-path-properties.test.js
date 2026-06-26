import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { normalizeRelative } from "../dist/canonical/markdown-store.js";
import { slug } from "../dist/writing/markdown-file.js";
import { assertProperty, fc, safePathSegment } from "./property-helpers.js";

const fallback = "fallback-slug";
const alphaNumericOrStablePunctuation = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._".split(""),
);
const unsluggableChar = fc.constantFrom(" ", "\t", "\n", "!", "@", "#", "$", "%", "^", "&", "*", "+", "=", "/", "\\", "é", "💾");

test("slug returns bounded lowercase filesystem-safe identifiers for sluggable input", () => {
  const sluggableInput = fc
    .tuple(fc.string({ maxLength: 80 }), alphaNumericOrStablePunctuation, fc.string({ maxLength: 80 }))
    .map((parts) => parts.join(""));

  assertProperty(fc.property(sluggableInput, (value) => {
    const result = slug(value, fallback);

    assert.notEqual(result, "");
    assert.ok(result.length <= 80, `slug too long: ${result.length}`);
    assert.match(result, /^[a-z0-9._-]+$/);
    assert.equal(result, result.toLowerCase());
  }));
});

test("slug returns the fallback for whitespace-only or unsluggable input", () => {
  const noSlugInput = fc.oneof(
    fc.stringMatching(/^\s*$/).filter((value) => value.length <= 40),
    fc.array(unsluggableChar, { minLength: 1, maxLength: 40 }).map((chars) => chars.join("")),
  );

  assertProperty(fc.property(noSlugInput, (value) => {
    assert.equal(slug(value, fallback), fallback);
  }));
});

test("normalizeRelative returns slash-separated relative child paths", () => {
  const childSegments = fc.array(safePathSegment, { minLength: 1, maxLength: 5 });

  assertProperty(fc.property(childSegments, (segments) => {
    const root = path.join(path.sep, "tmp", "jumpybrain-root");
    const absolute = path.join(root, ...segments);
    const relative = normalizeRelative(root, absolute);

    assert.equal(relative, segments.join("/"));
    assert.equal(path.isAbsolute(relative), false);
    assert.equal(relative.startsWith(".."), false);
    assert.equal(relative.includes("\\"), false);
  }));
});
