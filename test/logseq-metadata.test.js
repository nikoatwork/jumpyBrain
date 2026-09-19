import test from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../dist/core/canonical/markdown-store.js";
import { parseLogseqEnvelope, planLogseqDocument } from "../dist/core/migration/index.js";

const now = "2026-04-01T12:34:56.000Z";
const bodies = [
  Buffer.from('---\r\ntitle: source metadata\r\n---\r\n- id:: source-block\r\n\tUnicode 🐐\r\n'),
  Buffer.from("- no final newline\r\n\tproperty:: value"),
  Buffer.from([0xff, 0x00, 0x0d, 0x0a, 0x80]),
  Buffer.alloc(0),
];

for (const [sourcePath, title] of [
  ["pages/A%22quote%22.md", 'A"quote"'],
  ["pages/A%5Cfolder%5Cname.md", "A\\folder\\name"],
  ['pages/A"literal".md', 'A"literal"'],
  ["pages/日本語%20🐐.md", "日本語 🐐"],
  ["journals/2024_02_29.md", "2024-02-29"],
]) {
  test(`Logseq canonical metadata matches planned envelope: ${sourcePath}`, () => {
    for (const body of bodies) {
      const { entry, output } = planLogseqDocument({ sourcePath, body, now });
      assert.equal(entry.title, title);
      const expected = {
        id: entry.id,
        type: entry.type,
        title,
        source: "logseq-migration",
        source_path: entry.sourcePath,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
        ...(entry.date ? { date: entry.date } : {}),
      };
      const envelope = parseLogseqEnvelope(output);
      assert.deepEqual({ ...envelope.metadata }, expected);
      assert.deepEqual(parseFrontmatter(output.toString("utf8")).frontmatter, expected);
      assert.deepEqual(envelope.body, body);
      assert.deepEqual(output.subarray(output.length - body.length), body);
    }
  });
}

test("canonical frontmatter decodes JSON strings without coercing quoted scalars", () => {
  for (const value of ['A"quote"', "A\\folder\\name", "日本語 🐐", "line\n\ttab", "true", "42", "", "[one]"]) {
    assert.equal(parseFrontmatter(`---\ntitle: ${JSON.stringify(value)}\n---\n`).frontmatter.title, value);
  }
  assert.equal(parseFrontmatter('---\ntitle: "\\u65e5\\u672c"\n---\n').frontmatter.title, "日本");
});

test("canonical frontmatter retains forgiving legacy simple and malformed quotes", () => {
  for (const [raw, expected] of [
    ['"simple title"', "simple title"],
    ["'single quoted'", "single quoted"],
    [String.raw`'literal\ntext'`, String.raw`literal\ntext`],
    [String.raw`"invalid\qescape"`, String.raw`invalid\qescape`],
    ['"unescaped "inner" quotes"', 'unescaped "inner" quotes'],
    ['"unfinished', '"unfinished'],
    ["'unfinished", "'unfinished"],
    ['plain"quote', 'plain"quote'],
    ['"', ""],
    ["''", ""],
  ]) {
    assert.equal(parseFrontmatter(`---\ntitle: ${raw}\n---\n`).frontmatter.title, expected, raw);
  }
  assert.deepEqual(parseFrontmatter(`---\ntags: ['one', "two", plain]\nenabled: true\ncount: 42\n---\n`).frontmatter,
    { tags: ["one", "two", "plain"], enabled: true, count: 42 });
});

test("canonical body normalization remains separate from raw Logseq envelope preservation", () => {
  const body = "- first\r\n\tproperty:: value\r\n";
  const parsed = parseFrontmatter(`---\r\ntitle: "A\\\\folder"\r\n---\r\n${body}`);
  assert.equal(parsed.frontmatter.title, "A\\folder");
  assert.equal(parsed.body, "- first\n\tproperty:: value\n");
  assert.equal(parsed.bodyStartLine, 4);
  assert.equal(parsed.lineEnding, "\r\n");
  assert.equal(parseFrontmatter(body).body, body);
});
