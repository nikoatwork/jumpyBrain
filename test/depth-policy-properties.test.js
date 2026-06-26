import assert from "node:assert/strict";
import test from "node:test";

import { depthPolicyFor, normalizeRetrievalDepth, RETRIEVAL_DEPTHS } from "../dist/retrieval/depth-policy.js";
import { assertProperty, fc, relativePathArbitrary, safeScalarString } from "./property-helpers.js";

const validDepth = fc.constantFrom(...RETRIEVAL_DEPTHS);
const pathBucket = fc.constantFrom("pages", "decisions", "preferences", "findings", "sessions", "notes", "misc");
const frontmatterType = fc.constantFrom("page", "decision", "preference", "finding", "session", "note", "custom");

function document(relativePath, frontmatter = {}) {
  return {
    absolutePath: `/tmp/${relativePath}`,
    relativePath,
    frontmatter,
    bodyStartLine: 1,
  };
}

test("retrieval depth normalization accepts only documented depth values", () => {
  assertProperty(fc.property(validDepth, (depth) => {
    assert.equal(normalizeRetrievalDepth(depth), depth);
  }));

  const invalidDepth = safeScalarString.filter((value) => value.length > 0 && !RETRIEVAL_DEPTHS.includes(value));
  assertProperty(fc.property(invalidDepth, (depth) => {
    assert.throws(() => normalizeRetrievalDepth(depth), /Use one of: shallow, normal, deep/);
  }));
});

test("frontmatter type takes precedence over path bucket", () => {
  assertProperty(fc.property(frontmatterType, pathBucket, relativePathArbitrary, (type, bucket, rest) => {
    const decision = depthPolicyFor(document(`${bucket}/${rest}`, { type: type.toUpperCase() }), "normal");

    assert.equal(decision.bucket, type);
  }));
});

test("shallow retrieval boosts pages and decisions above sessions", () => {
  assertProperty(fc.property(relativePathArbitrary, (rest) => {
    const page = depthPolicyFor(document(`pages/${rest}`), "shallow");
    const decision = depthPolicyFor(document(`decisions/${rest}`), "shallow");
    const session = depthPolicyFor(document(`sessions/${rest}`), "shallow");

    assert.ok(page.boost > session.boost);
    assert.ok(decision.boost > session.boost);
  }));
});

test("depthPolicyFor returns requested depth, non-empty bucket, and finite boost", () => {
  assertProperty(fc.property(validDepth, pathBucket, relativePathArbitrary, fc.option(frontmatterType), (depth, bucket, rest, type) => {
    const frontmatter = type === null ? {} : { type };
    const decision = depthPolicyFor(document(`${bucket}/${rest}`, frontmatter), depth);

    assert.equal(decision.depth, depth);
    assert.equal(typeof decision.bucket, "string");
    assert.ok(decision.bucket.length > 0);
    assert.equal(Number.isFinite(decision.boost), true);
  }));
});
