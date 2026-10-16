import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalLinkTargetLookup, extractCanonicalLinks, resolveCanonicalLinkTarget } from "../dist/core/canonical/links.js";

const id = "mem_12345678-1234-1234-1234-123456789012";
const resolve = (lookup, target, kind = "markdown-link", source = "pages/source.md") =>
  resolveCanonicalLinkTarget(source, target, kind, lookup);

test("path-only graph callers retain aliases, anchors, root-first lookup and ambiguous basenames", () => {
  const lookup = buildCanonicalLinkTargetLookup([
    { relativePath: "notes/ledger.md" },
    { relativePath: "findings/shared.md" },
    { relativePath: "decisions/shared.md" },
    { relativePath: "root.md" },
    { relativePath: "pages/root.md" },
    { relativePath: "notes/root-priority.md" },
    { relativePath: "pages/notes/root-priority.md" },
  ]);
  assert.deepEqual(extractCanonicalLinks("[[Ledger|Record]] [[Ledger#Claim]] [record](../notes/ledger.md#claim)"), [
    { kind: "wiki-link", target: "Ledger" },
    { kind: "wiki-link", target: "Ledger" },
    { kind: "markdown-link", target: "../notes/ledger.md" },
  ]);
  assert.equal(resolve(lookup, "LEDGER", "wiki-link"), "notes/ledger.md");
  assert.equal(resolve(lookup, "missing/ledger", "wiki-link"), "notes/ledger.md");
  assert.equal(resolve(lookup, "shared", "wiki-link"), undefined);
  assert.equal(resolve(lookup, "findings/shared", "wiki-link"), "findings/shared.md");
  assert.equal(resolve(lookup, "shared", "markdown-link", "findings/source.md"), "findings/shared.md");
  assert.equal(resolve(lookup, "root.md"), "pages/root.md");
  assert.equal(resolve(lookup, "notes/root-priority.md"), "notes/root-priority.md");
  assert.equal(resolve(lookup, "../notes/ledger.md"), "notes/ledger.md");
  assert.equal(resolve(lookup, "/notes/ledger.md"), "notes/ledger.md");
});

test("valid canonical frontmatter IDs resolve for Markdown, wiki and metadata callers", () => {
  const lookup = buildCanonicalLinkTargetLookup([
    { relativePath: "notes/ledger.md", frontmatter: { id } },
    { relativePath: "notes/legacy.md" },
    { relativePath: "notes/invalid.md", frontmatter: { id: "not-a-memory-id" } },
    { relativePath: "notes/nonstring.md", frontmatter: { id: 42 } },
  ]);
  for (const reference of extractCanonicalLinks(`[record](${id}) [[${id}|Record]]`)) {
    assert.equal(resolve(lookup, reference.target, reference.kind), "notes/ledger.md");
  }
  assert.equal(resolve(lookup, id), "notes/ledger.md");
  assert.equal(resolve(lookup, "not-a-memory-id"), undefined);
  assert.equal(resolve(lookup, "42"), undefined);
  assert.equal(resolve(lookup, "legacy", "wiki-link"), "notes/legacy.md");
});

test("duplicate IDs and ID/path collisions remain ambiguous without source-relative fallback", () => {
  const duplicate = buildCanonicalLinkTargetLookup([
    { relativePath: "notes/one.md", frontmatter: { id } },
    { relativePath: "notes/two.md", frontmatter: { id } },
    { relativePath: `pages/${id}.md` },
  ]);
  assert.equal(duplicate.has(id), true);
  assert.equal(duplicate.get(id), undefined);
  for (const target of [id, id.toUpperCase(), `${id}.md`]) {
    assert.equal(resolve(duplicate, target), undefined);
    assert.equal(resolve(duplicate, target, "wiki-link"), undefined);
  }
  assert.equal(resolve(duplicate, "../notes/one.md"), "notes/one.md");
  const collision = buildCanonicalLinkTargetLookup([
    { relativePath: "notes/one.md", frontmatter: { id } },
    { relativePath: `pages/${id}.md` },
  ]);
  assert.equal(resolve(collision, id), undefined);
  const repeated = buildCanonicalLinkTargetLookup([
    { relativePath: "notes/one.md", frontmatter: { id } },
    { relativePath: "notes/one.md", frontmatter: { id } },
  ]);
  assert.equal(resolve(repeated, id), "notes/one.md");
});

test("full, collapsed and shortcut references use actual case/whitespace-normalized definitions", () => {
  const content = [
    "[Record][ Ledger   Source ] [ledger source][] [LEDGER SOURCE] [S1] [undefined][absent]",
    "",
    '[ledger source]: ../notes/copper%20ledger.md#claim "Record title"',
    "[unused]: ../notes/unused.md",
  ].join("\n");
  const references = extractCanonicalLinks(content);
  assert.deepEqual(references, Array(3).fill({ kind: "markdown-link", target: "../notes/copper ledger.md" }));
  const lookup = buildCanonicalLinkTargetLookup([{ relativePath: "notes/copper ledger.md" }]);
  for (const reference of references) assert.equal(resolve(lookup, reference.target, reference.kind), "notes/copper ledger.md");
  assert.deepEqual(extractCanonicalLinks("[S1] [S2][] [source][S3]"), []);
  assert.deepEqual(extractCanonicalLinks("[S1]\n\n[S1]: ../notes/ledger.md"), [{ kind: "markdown-link", target: "../notes/ledger.md" }]);
});

test("definitions do not create edges and first definitions win, including external targets", () => {
  assert.deepEqual(extractCanonicalLinks([
    "[record][ledger] [remote]",
    "[ledger]: ../notes/first.md",
    "[LEDGER]: ../notes/second.md",
    "[remote]: https://example.invalid/record.md",
    "[remote]: ../notes/second.md",
    "[unused]: ../notes/third.md",
  ].join("\n")), [{ kind: "markdown-link", target: "../notes/first.md" }]);
});

test("images, wiki embeds, URLs and inline labels cannot become reference shortcuts", () => {
  assert.deepEqual(extractCanonicalLinks([
    "![record](../notes/ledger.md) ![record][ledger] ![ledger][] ![ledger] ![[ledger]]",
    "[ledger](https://example.invalid/ledger.md) [ledger](//example.invalid/ledger.md)",
    "[ledger](mailto:record@example.invalid) [ledger](#claim) [ledger](%2F%2Fexample.invalid/ledger.md)",
    "[[https://example.invalid/ledger.md]] [[//example.invalid/ledger.md]]",
    "[ledger]: ../notes/ledger.md",
  ].join("\n")), []);
  assert.deepEqual(extractCanonicalLinks("[[ledger]]\n[ledger]: ../notes/other.md"), [{ kind: "wiki-link", target: "ledger" }]);
});

test("inline and reference destinations support URL encoding, angle brackets and titles", () => {
  const references = extractCanonicalLinks([
    '[record](../notes/copper%20ledger.md?view=raw#claim "Title")',
    '[record](<../notes/copper ledger.md> "Title")',
    "[record][ledger]",
    '[ledger]: <../notes/copper ledger.md> "Title"',
  ].join("\n"));
  assert.deepEqual(references, Array(3).fill({ kind: "markdown-link", target: "../notes/copper ledger.md" }));
});

test("unsafe traversal never resolves through normalization, root stripping or basename fallback", () => {
  const lookup = buildCanonicalLinkTargetLookup([{ relativePath: "notes/ledger.md" }]);
  for (const target of ["../notes/ledger.md", "../../notes/ledger.md", "/../notes/ledger.md", "notes/../../notes/ledger.md"]) {
    assert.equal(resolve(lookup, target, "wiki-link"), undefined, target);
  }
  for (const target of ["../../notes/ledger.md", "/../notes/ledger.md", "../../pages/../notes/ledger.md", "..\\..\\notes\\ledger.md"]) {
    assert.equal(resolve(lookup, target), undefined, target);
  }
  for (const kind of ["wiki-link", "markdown-link"]) {
    for (const target of ["//notes/ledger.md", "https://example.invalid/ledger.md", "file:/notes/ledger.md"]) {
      assert.equal(resolve(lookup, target, kind), undefined);
    }
  }
  for (const content of ["[record](%2E%2E/%2E%2E/notes/ledger.md)", "[record][ledger]\n[ledger]: ..%5C..%5Cnotes%5Cledger.md"]) {
    const [reference] = extractCanonicalLinks(content);
    assert.ok(reference);
    assert.equal(resolve(lookup, reference.target, reference.kind), undefined);
  }
  assert.equal(resolve(lookup, "../notes/ledger.md"), "notes/ledger.md");
  assert.equal(resolve(lookup, "../../notes/ledger.md", "markdown-link", "pages/nested/source.md"), "notes/ledger.md");
  assert.equal(resolve(lookup, "notes/../notes/ledger.md", "wiki-link"), "notes/ledger.md");
});

test('exact metadata titles resolve hashed filenames and block ambiguous fallbacks', () => {
  const second = 'mem_12345678-1234-1234-1234-123456789013';
  const docs = [{ relativePath: 'notes/dated-hash.md', frontmatter: { id, title: 'Café plan' } }];
  assert.equal(resolve(buildCanonicalLinkTargetLookup(docs), 'Ｃafé plan', 'wiki-link'), 'notes/dated-hash.md');
  docs.push({ relativePath: 'pages/café plan.md', frontmatter: { id: second, title: 'Other name' } });
  assert.equal(resolve(buildCanonicalLinkTargetLookup(docs), 'Café plan', 'wiki-link'), 'notes/dated-hash.md', 'title precedes coincidental filename');
  docs.push({ relativePath: 'notes/duplicate.md', frontmatter: { title: 'Café plan' } });
  assert.equal(resolve(buildCanonicalLinkTargetLookup(docs), 'Café plan', 'wiki-link'), undefined);
  const renamed = buildCanonicalLinkTargetLookup([{ relativePath: 'notes/dated-hash.md', frontmatter: { id, title: 'New name' } }]);
  assert.equal(resolve(renamed, 'New name', 'wiki-link'), 'notes/dated-hash.md');
  assert.equal(resolve(renamed, 'Café plan', 'wiki-link'), undefined);
  assert.equal(resolve(renamed, 'dated-hash', 'wiki-link'), 'notes/dated-hash.md');
});
