import assert from "node:assert/strict";
import test from "node:test";

import {
  forbiddenLocalPackFiles,
  requiredLocalPackFiles,
  validateLocalPackFiles,
} from "../scripts/local-pack-manifest.mjs";
import { assertProperty, fc, safePathSegment } from "./property-helpers.js";

const knownFiles = new Set([...requiredLocalPackFiles, ...forbiddenLocalPackFiles]);
const extraPackFile = fc
  .array(safePathSegment, { minLength: 2, maxLength: 5 })
  .map((segments) => `package/${segments.join("/")}.js`)
  .filter((file) => !knownFiles.has(file));

test("local pack validation accepts required-file supersets without forbidden files", () => {
  assertProperty(fc.property(fc.array(extraPackFile, { maxLength: 8 }), (extras) => {
    assert.deepEqual(validateLocalPackFiles([...requiredLocalPackFiles, ...extras]), {
      required: requiredLocalPackFiles.length,
      stale: 0,
    });
  }));
});

test("local pack validation names missing required files", () => {
  assertProperty(fc.property(fc.constantFrom(...requiredLocalPackFiles), (missingFile) => {
    const files = requiredLocalPackFiles.filter((file) => file !== missingFile);

    assert.throws(() => validateLocalPackFiles(files), new RegExp(escapeRegExp(missingFile)));
  }));
});

test("local pack validation names forbidden stale files", () => {
  assertProperty(fc.property(fc.constantFrom(...forbiddenLocalPackFiles), (forbiddenFile) => {
    assert.throws(
      () => validateLocalPackFiles([...requiredLocalPackFiles, forbiddenFile]),
      new RegExp(escapeRegExp(forbiddenFile)),
    );
  }));
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
