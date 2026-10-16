import assert from "node:assert/strict";
import test from "node:test";

import { validateWrapupBody, WRAPUP_REQUIRED_SECTIONS } from "../dist/core/writing/wrapup-policy.js";
import { assertProperty, fc, safeScalarString } from "./property-helpers.js";

const nonEmptySectionText = safeScalarString
  .filter((value) => value.trim().length > 0)
  .map((value) => `- ${value.trim()}`);

function wrapupBody(sectionBodies) {
  return WRAPUP_REQUIRED_SECTIONS
    .map((section) => [`## ${section}`, sectionBodies.get(section) ?? "- None captured."].join("\n"))
    .join("\n\n");
}

test("wrapup validation accepts all required non-empty sections", () => {
  assertProperty(fc.property(fc.array(nonEmptySectionText, { minLength: WRAPUP_REQUIRED_SECTIONS.length, maxLength: WRAPUP_REQUIRED_SECTIONS.length }), (texts) => {
    const bodies = new Map(WRAPUP_REQUIRED_SECTIONS.map((section, index) => [section, texts[index]]));
    const result = validateWrapupBody(wrapupBody(bodies));

    assert.equal(result.valid, true);
    assert.deepEqual(result.missingSections, []);
    assert.deepEqual(result.emptySections, []);
  }));
});

test("wrapup validation names missing required sections", () => {
  assertProperty(fc.property(fc.constantFrom(...WRAPUP_REQUIRED_SECTIONS), (missing) => {
    const body = WRAPUP_REQUIRED_SECTIONS
      .filter((section) => section !== missing)
      .map((section) => [`## ${section}`, "- Present"].join("\n"))
      .join("\n\n");
    const result = validateWrapupBody(body);

    assert.equal(result.valid, false);
    assert.deepEqual(result.missingSections, [missing]);
    assert.deepEqual(result.emptySections, []);
  }));
});

test("wrapup validation names required sections with empty bodies", () => {
  assertProperty(fc.property(fc.constantFrom(...WRAPUP_REQUIRED_SECTIONS), (emptySection) => {
    const bodies = new Map(WRAPUP_REQUIRED_SECTIONS.map((section) => [section, section === emptySection ? "   " : "- Present"]));
    const result = validateWrapupBody(wrapupBody(bodies));

    assert.equal(result.valid, false);
    assert.deepEqual(result.missingSections, []);
    assert.deepEqual(result.emptySections, [emptySection]);
  }));
});
