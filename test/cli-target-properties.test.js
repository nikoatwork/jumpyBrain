import assert from "node:assert/strict";
import test from "node:test";

import { resolveCliTarget } from "../dist/cli/targets.js";
import { normalizeRemoteTargetOrigin } from "../scripts/remote-target-origin.mjs";
import { assertProperty, fc, safeScalarString } from "./property-helpers.js";

const nonEmptyString = safeScalarString.filter((value) => value.trim().length > 0);

test("incompatible explicit target selectors fail rather than silently overriding a destination", () => {
  assertProperty(fc.property(nonEmptyString, nonEmptyString, (url, root) => {
    for (const flag of ["target-url", "remote-url"]) assert.throws(() => resolveCliTarget({ root, [flag]: url }), /only one target selector/);
    assert.throws(() => resolveCliTarget({ "target-url": url, "remote-url": url }), /only one target selector/);
  }));
});

test("target-url and remote-url are equivalent remote selectors", () => {
  assertProperty(fc.property(nonEmptyString, (url) => {
    assert.deepEqual(resolveCliTarget({ "target-url": url }), resolveCliTarget({ "remote-url": url }));
  }));
});

test("target flags reject empty or valueless inputs with flag-specific errors", () => {
  const badValue = fc.constantFrom("", "   ", "\t\n", true, []);
  const flag = fc.constantFrom("target-url", "remote-url", "root");

  assertProperty(fc.property(flag, badValue, (key, value) => {
    assert.throws(() => resolveCliTarget({ [key]: value }), new RegExp(`--${key} (must not be empty|requires a value)`));
  }));
});

test("allowDiscovery returns local discovery only without explicit root or remote flags", () => {
  assert.deepEqual(resolveCliTarget({}, { allowDiscovery: true }), { kind: "local", source: "recipe-discovery" });

  assertProperty(fc.property(nonEmptyString, (root) => {
    assert.deepEqual(resolveCliTarget({ root }, { allowDiscovery: true }), { kind: "local", root: root.trim(), source: "flag" });
  }));
});

test("equivalent URL spellings share an origin while unrelated origins stay isolated", () => {
  const label = fc.string({ unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), minLength: 1, maxLength: 12 });
  const pathPart = fc.string({ unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"), minLength: 0, maxLength: 20 });
  assertProperty(fc.property(label, label, pathPart, (left, right, suffix) => {
    const host = `${left}.example`;
    assert.equal(normalizeRemoteTargetOrigin(`HTTPS://${host.toUpperCase()}:443/${suffix}?q=1#x`), `https://${host}`);
    assert.equal(normalizeRemoteTargetOrigin(`https://${host}/`), `https://${host}`);
    if (left !== right) assert.notEqual(normalizeRemoteTargetOrigin(`https://${left}.example`), normalizeRemoteTargetOrigin(`https://${right}.example`));
    assert.notEqual(normalizeRemoteTargetOrigin(`https://${host}:8443`), normalizeRemoteTargetOrigin(`https://${host}`));
  }));
});
