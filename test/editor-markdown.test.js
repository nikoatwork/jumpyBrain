import assert from 'node:assert/strict';
import test from 'node:test';
import { codeFence, exportCodeFence, inlineCodeRanges, markdownTable, taskMarker } from '../dist/adapters/http-server/editor-markdown.js';

test('task recognition accepts explicit dash nesting and refuses ambiguous lists/indentation', () => {
  assert.deepEqual(taskMarker('- [X] café 日本語', null), { indent: 0, checked: true, label: 'café 日本語' });
  assert.equal(taskMarker('  - [ ] child', 0)?.indent, 2);
  assert.equal(taskMarker('    - [ ] grandchild', 2)?.indent, 4);
  assert.equal(taskMarker('        - [ ] deeper child', 6)?.indent, 8);
  for (const line of ['+ [ ] task', '1. [x] task', '- [y] task', '- [ ]', '\t- [ ] task', ' - [ ] task', '    - [ ] code']) assert.equal(taskMarker(line, null), null, line);
  assert.equal(taskMarker('      - [ ] skipped level', 0), null);
});

test('code fence recognition is closed, column-zero and deliberately bounded', () => {
  const lines = ['````c++', '\tα', '', '```', '[[inert]] <b> @title', '`````   ', 'after'];
  assert.deepEqual(codeFence(lines, 0), { end: 5, language: 'c++', text: '\tα\n\n```\n[[inert]] <b> @title' });
  for (const lines of [['```js', 'unclosed'], [' ```', 'x', '```'], ['~~~', 'x', '~~~'], ['```js attr', 'x', '```'], ['> ```', 'x', '> ```']]) assert.equal(codeFence(lines, 0), null);
  const exported = exportCodeFence('x\n````\n\t y\n', 'ts');
  assert.equal(exported, '`````ts\nx\n````\n\t y\n\n`````');
  assert.equal(codeFence(exported.split('\n'), 0).text, 'x\n````\n\t y\n');
});

test('inline backtick spans match equal maximal runs and preserve escaped/malformed syntax', () => {
  for (const value of ['`[[title]]`', '``a ` b``', '```a `` b```', '`<b> **x** @title`']) assert.deepEqual(inlineCodeRanges(value), [{ start: 0, end: value.length }]);
  assert.deepEqual(inlineCodeRanges('\\`escaped`'), []);
  assert.deepEqual(inlineCodeRanges('`unclosed'), []);
  assert.deepEqual(inlineCodeRanges('`a``b`'), [{ start: 0, end: 6 }]);
});

// A large code sample must not exhaust V8's argument stack during a save.
test('fence serialization handles many literal backtick lines without spreading arguments', () => {
  const payload = '`\n'.repeat(160_000);
  const exported = exportCodeFence(payload, '');
  assert.equal(exported, '```\n' + payload + '\n```');
});

test('pipe tables retain escaped/code pipes and alignment with strict literal fallback', () => {
  assert.deepEqual(markdownTable(['| Name | Value |', '| :--- | ---: |', '| a\\|b | `x|y` |', '', 'after']), {
    end: 2, rows: [['Name', 'Value'], ['a\\|b', '`x|y`']], align: ['left', 'right'],
  });
  assert.equal(markdownTable(['Name | Value', ':---: | ---', 'one | two']).align[0], 'center');
  for (const source of [
    ['| a | b |', '| -- | --- |'], ['| a | b |', '| --- | --- |', '| missing |'],
    ['| a | b |', '| --- | --- | --- |'], ['    | a | b |', '    | --- | --- |'],
    ['a | b'], ['| one |', '| --- |'], [' \t| a | b |', '| --- | --- |'],
    ['> a | b', '--- | ---'], ['# a | b', '--- | ---'], ['- a | b', '--- | ---'],
  ]) assert.equal(markdownTable(source), null, source.join('\n'));
});

test('external link grammar accepts labeled HTTP(S) and retains unsafe/ambiguous forms literally', async () => {
  const {externalLinkMatch} = await import('../dist/adapters/http-server/editor-markdown.js');
  for (const source of ['[Issue](https://example.com/issue/1145)', '[AI\\*\\[test\\]](https://example.com/)', '[**Issue**](https://example.com/a_(b))', '[Issue](https://example.com/a\\(b\\) "Details")', '[café 日本語](HTTP://example.com/?a=1&b=2#part)']) assert.ok(externalLinkMatch(source), source);
  for (const source of ['![image](https://example.com/a.png)', '\\[escaped](https://example.com/)', '[[nested](https://example.com/)]', '[x](javascript:alert(1))', '[x](data:text/html,x)', '[x](file:///tmp/x)', '[x](https://user:secret@example.com)', '[x](/relative)', '[x](https://)', '[x](https://example.com/\u0000)']) assert.equal(externalLinkMatch(source), null, source);
});

test('ordinary bullets accept basic top-level markers without stealing tasks or containers', async () => {
  const {bulletMarker,relativeLinkPattern}=await import('../dist/adapters/http-server/editor-markdown.js');
  for(const marker of ['-','+','*']) assert.deepEqual(bulletMarker(`${marker} **Label** rest`),{marker,label:'**Label** rest'});
  assert.ok(bulletMarker('- [External](https://example.invalid)'));
  for(const line of ['  - child',' - shifted','-  padded','-','- ','- - -','* * *','- > quote','- # Heading']) assert.equal(bulletMarker(line),null,line);
  for(const source of ['[Decision](../decisions/example_note.md)','[Source](./sample.md#section)']) assert.equal(relativeLinkPattern.exec(source)?.[0],source);
  for(const source of ['![Image](../image.png)','\\[escaped](../sample.md)','[**Rich**](../sample.md)','[x](javascript:alert(1))','[x](file:///tmp/a)','[x](/absolute)','[x](//host/a)','[x](../bad path.md)']) assert.equal(relativeLinkPattern.exec(source),null,source);
});
