import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
// Exercise current instruction output without rebuilding the shared dist directory.
const source = await read("src/cli/instructions.ts");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { agentInstructions } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const guidance = [
  ["generated instructions", agentInstructions()],
  ["distributed skill", await read("skills/jumpybrain-memory/SKILL.md")],
  ["agent workflows", await read("docs/agent-workflows.md")],
];

for (const [name, text] of guidance) {
  test(`${name}: compact economy is conditional and excerpt bounds stay separate`, () => {
    assert.match(text, /bounded, not (?:universally smaller|always smaller)/i);
    assert.match(text, /envelope, citations, hashes, and metadata/);
    assert.match(text, /(?:small|low) result counts/);
    assert.match(text, /1,000-character excerpts/);
    assert.match(text, /not longer individual excerpts/);
    assert.match(text, /serialized UTF-8 (?:bytes, not tokens|output.*not tokens)/);
    assert.match(text, /Legacy text(?:\/rich| and rich).*--json/i);
  });

  test(`${name}: text citations cannot stand in for verified expansion handles`, () => {
    assert.match(text, /(?:Plain text supplies citations, not|Plain text citations do not supply) verified ID\/hash expansion handles/);
    assert.match(text, /indexRoot/);
    assert.match(text, /without a (?:hash check|source-version check)/);
    assert.match(text, /(?:edits may shift|edited source coordinates)/i);
    assert.match(text, /(?:rerun|reacquire).*--compact/i);
    assert.match(text, /same (?:root\/target|target)/);
    assert.match(text, /expansion\.available: true/);
    assert.match(text, /expansion\.id/);
    assert.match(text, /expansion\.expectedContentHash/);
    assert.match(text, /--if-match sha256:<hash>/);
    assert.match(text, /same hash/);
    assert.match(text, /(?:never invent|do not fabricate) a hash/i);
    assert.match(text, /(?:not server paths or direct HTTP|do not read server paths or call HTTP directly)/);
    assert.match(text, /(?:no|without|never) automatic full-document fallback/);
  });

  test(`${name}: real structure does not remove whole-line limits`, () => {
    assert.match(text, /real Markdown (?:headings|structure)/i);
    assert.match(text, /(?:separate|independently useful) paragraphs/);
    assert.match(text, /inline labels/i);
    assert.match(text, /(?:not section boundaries|not inline labels posing as sections)/);
    assert.match(text, /whole lines, not substrings/);
    assert.match(text, /cannot be recovered by continuation/);
    assert.match(text, /section prefix may not reach its anchor/);
    assert.match(text, /continuationLine/);
    assert.match(text, /--end-line <requestedEndLine>/);
  });
}

test("CLI reference and source-authoring guide own detailed bounds", async () => {
  const cli = await read("docs/cli-commands.md");
  const format = await read("docs/memory-format.md");
  assert.match(cli, /bounded, not universally smaller/);
  assert.match(cli, /each bounded at 1,000 characters/);
  assert.match(cli, /increasing `--max-bytes`.*does not enlarge/i);
  assert.match(cli, /not verified ID\/hash expansion handles/);
  assert.match(cli, /Expansion never returns a substring/);
  assert.match(cli, /65536 bytes including the envelope\/escaping/);
  assert.match(cli, /memory-format\.md#structure-for-selective-retrieval/);
  assert.match(format, /## Structure for selective retrieval/);
  assert.match(format, /blank-line-separated paragraphs/);
  assert.match(format, /not a heading\/section boundary/);
  assert.match(format, /No domain-specific labels or general memory template are required/);
  assert.match(format, /strict session wrapup sections remain a separate command contract/);
  assert.match(format, /not automatic rewrites/);
});
