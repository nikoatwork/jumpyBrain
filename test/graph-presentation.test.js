import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutGraph } from '../dist/adapters/http-server/graph-layout.js';
import { placeGraphLabels } from '../dist/adapters/http-server/graph-labels.js';

const measure = text => Array.from(text).length * 6;
const labels = (nodes, overrides = {}) => placeGraphLabels(nodes, { width: 1000, height: 650, measure, ...overrides });
const candidate = (id, x, y, overrides = {}) => ({ id, x, y, radius: 7, title: `Note ${id}`, ...overrides });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function bounds(label) {
  const left = label.x - (label.anchor === 'end' ? label.width : label.anchor === 'middle' ? label.width / 2 : 0);
  return { left, right: left + label.width, top: label.y - 11, bottom: label.y - 11 + label.height };
}
function overlaps(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }

test('connection-aware layout groups weak components and places isolates separately', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));
  const positions = layoutGraph(nodes, [{ source: 'a', target: 'b' }, { source: 'c', target: 'd' }], 1000, 650);
  assert.equal(positions.size, 5);
  assert.ok(distance(positions.get('a'), positions.get('b')) < distance(positions.get('a'), positions.get('c')));
  for (const position of positions.values()) {
    assert.ok(Number.isFinite(position.x) && position.x > 0 && position.x < 1000);
    assert.ok(Number.isFinite(position.y) && position.y > 0 && position.y < 650);
  }
  assert.ok(!['a', 'b', 'c', 'd'].some(id => distance(positions.get('e'), positions.get(id)) < 1));
});

test('layout is deterministic across packet ordering and reversed link directions', () => {
  const nodes = Array.from({ length: 30 }, (_, index) => ({ id: `n${index}`, degree: index % 5 }));
  const edges = nodes.slice(1).map((node, index) => ({ source: nodes[Math.floor(index / 3)].id, target: node.id }));
  const a = layoutGraph(nodes, edges, 900, 600);
  const b = layoutGraph([...nodes].reverse(), [...edges].reverse().map(edge => ({ source: edge.target, target: edge.source })), 900, 600);
  assert.deepEqual([...a].sort(), [...b].sort());
});

test('adjacent topic views preserve surviving coordinates and release absent identities', () => {
  const nodes = ['a', 'b', 'c', 'd'].map(id => ({ id }));
  const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
  const previous = layoutGraph(nodes, edges, 1000, 650);
  const next = layoutGraph(nodes.slice(1), edges, 390, 700, previous);
  assert.equal(next.has('a'), false);
  for (const node of nodes.slice(1)) assert.deepEqual(next.get(node.id), previous.get(node.id));
  assert.notEqual(next.get('b'), previous.get('b'));
});

test('layout handles ten thousand disconnected or chained nodes without recursion or simulation', () => {
  const nodes = Array.from({ length: 10000 }, (_, index) => ({ id: `n${index}` }));
  const edges = nodes.slice(1).map((node, index) => ({ source: nodes[index].id, target: node.id }));
  assert.equal(layoutGraph(nodes, [], 1000, 650).size, 10000);
  const positions = layoutGraph(nodes, edges, 1000, 650);
  assert.equal(positions.size, 10000);
  assert.ok([...positions.values()].every(position => Number.isFinite(position.x) && Number.isFinite(position.y)));
});

test('sparse desktop and narrow views expose all titles where geometry permits', () => {
  const desktop = Array.from({ length: 12 }, (_, index) => candidate(String(index), 110 + index % 4 * 230, 110 + Math.floor(index / 4) * 190));
  const mobile = Array.from({ length: 6 }, (_, index) => candidate(String(index), 65 + index % 2 * 230, 100 + Math.floor(index / 2) * 190));
  assert.equal(labels(desktop).length, 12);
  assert.equal(labels(mobile, { width: 390 }).length, 6);
});

test('labels stay within the viewport and never collide, with bounded long-title wrapping', () => {
  const nodes = Array.from({ length: 100 }, (_, index) => candidate(String(index), 10 + index % 10 * 105, 12 + Math.floor(index / 10) * 65, { title: 'A long title about health sleep and a connected daily journal entry' }));
  const placed = labels(nodes);
  assert.ok(placed.length > 0);
  for (let index = 0; index < placed.length; index++) {
    const box = bounds(placed[index]);
    assert.ok(box.left >= 4 && box.right <= 996 && box.top >= 4 && box.bottom <= 646);
    assert.ok(placed[index].lines.length <= 2);
    for (const other of placed.slice(index + 1)) assert.equal(overlaps(box, bounds(other)), false);
    for (const node of nodes) if (node.id !== placed[index].id) {
      assert.equal(overlaps(box, { left: node.x - node.radius, right: node.x + node.radius, top: node.y - node.radius, bottom: node.y + node.radius }), false);
    }
  }
});

test('active and direct-ranked labels take precedence over collocated context', () => {
  const nodes = [candidate('context', 500, 300, { priority: 1000 }), candidate('match', 500, 300, { priority: 0 }), candidate('focus', 500, 300, { priority: -1 })];
  const placed = labels(nodes);
  assert.equal(placed[0].id, 'focus');
  const ranked = labels(nodes.slice(0, 2));
  assert.equal(ranked[0].id, 'match');
});

test('screen-space zoom reveals more titles while label font measurements remain fixed', () => {
  const nodes = Array.from({ length: 64 }, (_, index) => candidate(String(index), 400 + index % 8 * 18, 230 + Math.floor(index / 8) * 18, { title: `Health ${index}` }));
  const overview = labels(nodes);
  const zoomed = labels(nodes, { scale: 3, pan: { x: -900, y: -550 } });
  assert.ok(zoomed.length > overview.length, `${zoomed.length} labels after zoom, ${overview.length} before`);
  assert.ok(zoomed.every(label => label.height === 14 && label.width === measure(label.text)));
});

test('offscreen labels do not trigger text measurements and identities break equal-rank ties', () => {
  let calls = 0;
  const result = labels([candidate('outside', -100, -100), candidate('z', 500, 300), candidate('a', 500, 300)], { measure(text) { calls++; assert.ok(!text.includes('outside')); return measure(text); } });
  assert.ok(calls > 0);
  assert.equal(result[0].id, 'a');
});
