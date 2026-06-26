import assert from "node:assert/strict";
import test from "node:test";

import { resolveCliTarget } from "../dist/cli/targets.js";
import { assertProperty, fc, safeScalarString } from "./property-helpers.js";

const nonEmptyString = safeScalarString.filter((value) => value.trim().length > 0);

test("remote CLI target flags take precedence over local root", () => {
  assertProperty(fc.property(nonEmptyString, nonEmptyString, (url, root) => {
    assert.deepEqual(resolveCliTarget({ root, "target-url": url }), { kind: "remote", url: url.trim() });
    assert.deepEqual(resolveCliTarget({ root, "remote-url": url }), { kind: "remote", url: url.trim() });
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
  assert.deepEqual(resolveCliTarget({}, { allowDiscovery: true }), { kind: "local" });

  assertProperty(fc.property(nonEmptyString, (root) => {
    assert.deepEqual(resolveCliTarget({ root }, { allowDiscovery: true }), { kind: "local", root: root.trim() });
  }));
});
