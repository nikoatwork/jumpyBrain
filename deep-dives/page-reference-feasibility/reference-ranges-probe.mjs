// Disposable pure-scanner regressions. No app, Markdown roots, or index required.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: [new URL("./reference-ranges.ts", import.meta.url).pathname],
  bundle: true, format: "esm", platform: "node", write: false,
});
const { referenceRanges } = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
const titles = (source) => referenceRanges(source).map((range) => range.title);

for (const [name, source, expected] of [
  ["ordinary supported blocks", "# [[Heading]]\nText [[Alpha]]\n- [[Bullet]]\n  - [[Nested]]\n    - [[Deep]]", ["Heading", "Alpha", "Bullet", "Nested", "Deep"]],
  ["multiline inline code", "[[Before]] `first\n[[Code]]\nlast` [[After]]", ["Before", "After"]],
  ["exact run length", "``first\n` [[Code]] ```\nlast`` [[After]]", ["After"]],
  ["unclosed inline code fails closed", "[[Before]] `first\n[[Code]]\n\n[[Still inert]]", ["Before"]],
  ["fence-like lines within inline code", "``first\n```\n[[Code]]\n```\nlast`` [[After]]", ["After"]],
  ["escaped backtick opener", "\\` [[Visible]]", ["Visible"]],
  ["backslash does not escape inline closer", "`code\\` [[Visible]]", ["Visible"]],
  ["ordinary backtick fence", "```md\n[[Code]]\n````\n[[After]]", ["After"]],
  ["ordinary tilde fence", "~~~md\n[[Code]]\n~~~\n[[After]]", ["After"]],
  ["wrong fence closer", "````\n[[Code]]\n```\n[[Still code]]\n````\n[[After]]", ["After"]],
  ["escaped/malformed references", "\\[[Escape]] ![[Embed]] [[[Nested]]] [[Extra]]] [[alias|x]] [[path/file]] [[ padded ]]\n[[After]]", ["After"]],
  ["literal title backticks", "[[Title `literal`]]", ["Title `literal`"]],
  ["inline opener inside unmatched bracket group", "[text `first\n[[Code]]\nlast` [[After]]", ["After"]],
  ["inline opener inside complete bracket group", "[text `first]\n[[Code]]\nlast` [[After]]", ["After"]],
  ["container fence overrides pending inline code", "`unclosed\n> ```\n> ` [[Code]]\n> ```", []],
  ["list continuation fence cannot close on guessed dedent", "- item\n  ~~~\n~~~\n[[Code]]\n~~~", []],
  ["container-looking text inside ordinary fence", "```\n> ~~~\n[[Code]]\n```\n[[After]]", ["After"]],
]) {
  test(name, () => assert.deepEqual(titles(source), expected));
}
for (const prefix of ["> ", "> > ", "- ", "1. ", "2) ", "> 1. ", "- > ", "    ", "\t", "    - "]) {
  for (const delimiter of ["```", "~~~"]) {
    test(`opaque container suffix: ${JSON.stringify(prefix + delimiter)}`, () => {
      const source = `[[Before]]\n${prefix}${delimiter}\n- [[Code]]\n${prefix}${delimiter}\n\n[[Conservatively inert]]`;
      assert.deepEqual(titles(source), ["Before"]);
    });
  }
}
test("UTF-16 offsets still address the original text", () => {
  const source = "😀 [[β_日本語]] `start\n[[Code]]\nend` [[After]]";
  for (const range of referenceRanges(source)) {
    assert.equal(source.slice(range.start, range.end), `[[${range.title}]]`);
  }
});
