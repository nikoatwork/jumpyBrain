import assert from "node:assert/strict";
import test from "node:test";
import { IS_BOLD, IS_ITALIC, IS_CODE } from "lexical";
import { markdownSourceMap, sourceToVisible, visibleToSource } from "../dist/adapters/http-server/editor-source-map.js";
import { participantAppearance } from "../dist/adapters/http-server/collaboration-appearance.js";

function verify(raw, visible, formats, options, expected) {
  const map = markdownSourceMap(raw, visible, formats, options);
  assert.ok(map, JSON.stringify({raw, visible}));
  for (const [source, shown] of expected) assert.equal(sourceToVisible(map, source), shown, `${raw}: source ${source}`);
  for (let shown = 0; shown <= visible.length; shown++) for (const affinity of ["left", "right"]) {
    const source = visibleToSource(map, shown, affinity);
    assert.equal(sourceToVisible(map, source), shown, `${raw}: roundtrip ${shown} ${affinity}`);
  }
  return map;
}
test("source maps distinguish structural fences from repeated code content and preserve exact CRLF offsets", () => {
  const raw = "```js\r\njs abc\r\n```";
  const map = verify(raw, "js abc", new Uint8Array(6).fill(IS_CODE), {start:7,end:14,literal:true}, [[9,2],[13,6]]);
  assert.equal(sourceToVisible(map, 3), null, "language is not editable body text");
  assert.equal(visibleToSource(map, 2), 9);
  assert.equal(visibleToSource(map, 1), 8);
  assert.equal(visibleToSource(map, 4), 11);
});
test("inline source maps retain plain, formatted, code, nested, reference and Unicode runs", () => {
  verify("hello **world**", "hello world", [...new Uint8Array(6),...new Uint8Array(5).fill(IS_BOLD)], {}, [[2,2],[8,6],[10,8],[14,11]]);
  verify("a *italic* b", "a italic b", [0,0,...new Uint8Array(6).fill(IS_ITALIC),0,0], {}, [[5,4],[10,8]]);
  verify("***both***", "both", new Uint8Array(4).fill(IS_BOLD|IS_ITALIC), {}, [[3,0],[5,2],[10,4]]);
  verify("a `*literal*` 🐐", "a *literal* 🐐", [0,0,...new Uint8Array(9).fill(IS_CODE),0,0,0], {}, [[3,2],[7,6],[13,11]]);
  verify("**bold *nested* end**", "bold nested end", [...new Uint8Array(5).fill(IS_BOLD),...new Uint8Array(6).fill(IS_BOLD|IS_ITALIC),...new Uint8Array(4).fill(IS_BOLD)], {}, [[2,0],[8,5],[13,10],[20,15]]);
  verify("\\*literal\\*", "*literal*", new Uint8Array(9), {}, [[0,0],[1,0],[2,1],[11,9]]);
  const reference = "a [[Literal ** title]] β";
  verify(reference, reference, new Uint8Array(reference.length), {}, [[14,14]]);
  verify("- [ ] **task**", "task", new Uint8Array(4).fill(IS_BOLD), {start:6}, [[8,0],[10,2]]);
  verify("## heading", "heading", new Uint8Array(7), {start:3}, [[5,2]]);
  verify("", "", [], {}, [[0,0]]);
});
test("unproven text/format mappings fail closed and large literal maps stay compact", () => {
  assert.equal(markdownSourceMap("**world**", "world", new Uint8Array(5)), null);
  assert.equal(markdownSourceMap("hello", "helo", new Uint8Array(4)), null);
  assert.equal(markdownSourceMap("*open", "open", new Uint8Array(4).fill(IS_ITALIC)), null);
  const value = "a".repeat(1_000_000), map = markdownSourceMap(value, value, new Uint8Array(value.length));
  assert.ok(map); assert.ok(map.spans.length <= 2, "one compact affine span rather than a per-character retained map");
});
test("principal appearance is stable across tabs while session and agent identity remain visible", () => {
  const first = participantAppearance({actor:JSON.stringify(["person","aaaa-tab"]),name:"Alice",kind:"human",activity:"editing"});
  const other = participantAppearance({actor:JSON.stringify(["person","bbbb-tab"]),name:"Alice",kind:"human",activity:"viewing"});
  assert.equal(first.color,other.color); assert.notEqual(first.label,other.label); assert.match(first.description,/editing, session [a-z0-9]{6}/);
  const tab0=participantAppearance({actor:'["person","cursor-human-0"]',name:"Alice",kind:"human"}),tab1=participantAppearance({actor:'["person","cursor-human-1"]',name:"Alice",kind:"human"});assert.notEqual(tab0.session,tab1.session,"shared client prefixes cannot collapse distinct tab labels");
  const agent = participantAppearance({actor:"agent",principalId:"agent-key",clientId:"stream",name:"Builder",kind:"agent",activity:"streaming"});
  assert.match(agent.label,/Agent Builder/); assert.equal(agent.activity,"generating"); assert.notEqual(agent.color,first.color);
});

test('link source maps prove rendered labels and preserve URL syntax outside edit ranges', () => {
  const raw='See [**Issue**](https://example.com/a_(b) "Details") now';
  const visible='See Issue now', formats=[0,0,0,0,...new Uint8Array(5).fill(IS_BOLD),0,0,0,0];
  const map=verify(raw,visible,formats,{links:[{from:4,to:9}]},[[7,4],[9,6],[raw.indexOf(' now'),9]]);
  assert.equal(visibleToSource(map,6),9,'An edit inside the label maps inside the label, never inside the URL.');
  assert.equal(markdownSourceMap(raw,visible,formats),null,'Hidden link syntax requires actual model link evidence.');
  assert.equal(markdownSourceMap(raw,visible,formats,{links:[{from:4,to:8}]}),null);
  verify('[A\\*\\[B](https://example.com)', 'A*[B', new Uint8Array(4), {links:[{from:0,to:4}]}, [[1,0],[3,1],[5,2],[7,4]]);
  verify('[x](https://example.com)', '[x](https://example.com)',new Uint8Array(24).fill(IS_CODE),{literal:true},[[3,3]]);
});
