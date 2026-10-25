import assert from 'node:assert/strict';
import test from 'node:test';
import { codeFence, exportCodeFence, inlineCodeRanges, taskMarker } from '../dist/adapters/http-server/editor-markdown.js';

test('task recognition accepts explicit dash nesting and refuses ambiguous lists/indentation', () => {
  assert.deepEqual(taskMarker('- [X] café 日本語', null), { indent: 0, checked: true, label: 'café 日本語' });
  assert.equal(taskMarker('  - [ ] child', 0)?.indent, 2);
  assert.equal(taskMarker('    - [ ] grandchild', 2)?.indent, 4);
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
