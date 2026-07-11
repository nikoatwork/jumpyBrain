import assert from "node:assert/strict";
import test from "node:test";

import { parseFrontmatter } from "../dist/core/canonical/markdown-store.js";
import { renderMarkdownDocument } from "../dist/core/writing/markdown-file.js";
import { generateMemoryDocumentId, isValidMemoryDocumentId } from "../dist/core/writing/metadata.js";
import { assertProperty, fc, safeFrontmatterKey, safeScalarString } from "./property-helpers.js";

const frontmatterValue = fc.oneof(
  safeScalarString,
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.boolean(),
  fc.array(safeScalarString, { maxLength: 5 }),
);

const frontmatterObject = fc.dictionary(safeFrontmatterKey, frontmatterValue, { maxKeys: 8 });

const markdownBody = fc.string({ maxLength: 300 });

function expectedRenderedBody(body) {
  return `\n${body.trimEnd()}\n`;
}

test("rendered supported frontmatter parses back with current coercions", () => {
  assertProperty(fc.property(frontmatterObject, markdownBody, (fields, body) => {
    const markdown = renderMarkdownDocument(Object.entries(fields), body);
    const parsed = parseFrontmatter(markdown);

    assert.deepEqual(parsed.frontmatter, { ...fields });
    assert.equal(parsed.body, expectedRenderedBody(body));
    assert.equal(parsed.bodyStartLine, Object.keys(fields).length + 3);
  }));
});

test("memory document ID helpers generate and validate mem_<uuid> IDs", () => {
  const id = generateMemoryDocumentId();

  assert.match(id, /^mem_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(isValidMemoryDocumentId(id), true);
  assert.equal(isValidMemoryDocumentId(id.toUpperCase()), false);
  assert.equal(isValidMemoryDocumentId(id.replace(/^mem_/, "")), false);
  assert.equal(isValidMemoryDocumentId(`mem_${"0".repeat(32)}`), false);
});

test("content without a valid frontmatter fence parses as body-only Markdown", () => {
  const nonOpeningFence = fc
    .string({ maxLength: 300 })
    .filter((content) => (content.split(/\r?\n/)[0]?.trim() ?? "") !== "---");

  const unclosedOpeningFence = fc
    .array(fc.string({ maxLength: 80 }).filter((line) => line.trim() !== "---"), { maxLength: 8 })
    .map((lines) => ["---", ...lines].join("\n"));

  assertProperty(fc.property(fc.oneof(nonOpeningFence, unclosedOpeningFence), (content) => {
    const parsed = parseFrontmatter(content);

    assert.deepEqual(parsed.frontmatter, {});
    assert.equal(parsed.body, content);
    assert.equal(parsed.bodyStartLine, 1);
  }));
});
