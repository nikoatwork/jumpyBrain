import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoardName } from '../dist/adapters/http-server/boards-view.js';

test('board names combine a friendly mood, productivity word and animal', () => {
  for (const random of [0, 0.25, 0.5, 0.999999]) {
    assert.match(createBoardName([], () => random), /^[A-Z][a-z]+ (Focus|Task|Progress|Goal|Sprint|Plan) [A-Z][a-z]+$/);
  }
  assert.notEqual(createBoardName([], () => 0), createBoardName([], () => 0.5));
});

test('repeated random choices still produce distinct names beyond the 100-board limit', () => {
  const existing = [];
  for (let index = 0; index < 400; index++) {
    const name = createBoardName(existing, () => 0);
    assert.ok(!existing.includes(name));
    assert.ok(name.length <= 100);
    existing.push(name);
  }
});

test('name collisions ignore case and surrounding whitespace, including numbered fallbacks', () => {
  const first = createBoardName([], () => 0);
  assert.notEqual(createBoardName(['  ' + first.toUpperCase() + '  '], () => 0), first);
  const existing = [];
  for (let index = 0; index < 384; index++) existing.push(createBoardName(existing, () => 0));
  existing.push(first.toUpperCase() + ' 2');
  assert.equal(createBoardName(existing, () => 0), first + ' 3');
});
