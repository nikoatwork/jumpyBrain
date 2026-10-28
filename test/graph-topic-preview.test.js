import assert from 'node:assert/strict';
import test from 'node:test';
import { graphTopicLinks, installGraphTopicPreview } from '../dist/adapters/http-server/graph-topic-preview.js';
const id = n => `mem_a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const topic = { id: 'unresolved:fasting', title: 'fasting', nodeKind: 'unresolved' };
const graph = { nodes: [topic, { id: 'source', documentId: id(1), title: 'Daily log', nodeKind: 'document' }], edges: [{ source: 'source', target: topic.id }] };
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  class Node extends EventTarget {
    hidden = true; open = false; children = []; textContent = ''; disabled = false;
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    getAttribute(name) { return this[name]; }
  }
  const nodes = new Map(), win = new EventTarget(), timers = [];
  Object.assign(win, { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} });
  const get = name => { if (!nodes.has(name)) nodes.set(name, new Node()); return nodes.get(name); };
  const document = { defaultView: win, getElementById: get, createElement: () => new Node() };
  let scope = 'a', enabled = true, writable = true;
  const search = [], ensure = [], navigations = [];
  const controller = installGraphTopicPreview({ document, scope: () => scope, enabled: () => enabled, canCreate: () => writable,
    search(query, signal, limit) { return new Promise((resolve, reject) => search.push({ query, signal, limit, resolve, reject })); },
    ensure(title, signal) { return new Promise((resolve, reject) => ensure.push({ title, signal, resolve, reject })); },
    href: id => '/?note=' + id, async navigate(destination) { navigations.push(typeof destination === 'function' ? await destination() : destination); controller.close(); return true; }, onCreated() {},
  });
  return { controller, search, ensure, navigations, timers, get: suffix => get('graph-topic' + suffix), scope: value => { scope = value; }, writable: value => { writable = value; }, enabled: value => { enabled = value; } };
}
test('linked topics use actual edges, valid unique IDs and a 40-note bound', () => {
  assert.deepEqual(graphTopicLinks(topic, graph), [{ id: id(1), title: 'Daily log' }]);
  assert.deepEqual(graphTopicLinks(topic, null), []);
  const nodes = Array.from({ length: 50 }, (_, n) => ({ id: 'n' + n, nodeKind: 'document', documentId: id(n), title: 'Title' }));
  nodes.push({ id: 'bad', nodeKind: 'document', documentId: 'bad' }, { ...nodes[0], id: 'dup' });
  assert.equal(graphTopicLinks(topic, { nodes, edges: nodes.map(node => ({ source: node.id, target: topic.id })) }).length, 40);
});
test('preview is read-only, linked notes survive failed search, and explicit creation retains context', async () => {
  const h = harness(); h.controller.open(topic, graph);
  assert.equal(h.ensure.length, 0);
  assert.equal(h.get('-links').children[0].children[0].textContent, 'Daily log');
  h.search[0].reject(new Error('offline')); await tick();
  assert.match(h.get('-status').textContent, /unavailable/);
  h.get('-create').dispatchEvent(new Event('click')); await tick();
  assert.equal(h.ensure[0].title, 'fasting');
  h.ensure[0].resolve({ status: 'found', id: id(2), created: true }); await tick();
  assert.deepEqual(h.navigations, ['/?note=' + id(2)]);
  assert.deepEqual(h.controller.related(id(2)), [{ id: id(1), title: 'Daily log' }]);
  h.scope('b'); assert.deepEqual(h.controller.related(id(2)), []);
});
test('read-only and unsafe titles cannot create; late search cannot cross scope or dismissal', async () => {
  const h = harness(); h.writable(false); h.controller.open(topic, graph);
  assert.equal(h.get('-create').hidden, true);
  h.get('-create').dispatchEvent(new Event('click')); assert.equal(h.ensure.length, 0);
  h.scope('b'); h.search[0].resolve({ results: [{ provenance: { metadata: { id: id(3), title: 'fasting' } } }] }); await tick();
  assert.equal(h.get('-results').children.length, 0);
  h.writable(true); h.controller.open({ ...topic, title: 'pages/missing.md' }, graph);
  assert.equal(h.get('-create').hidden, true);
  h.get('-create').dispatchEvent(new Event('click')); assert.equal(h.ensure.length, 0);
  h.controller.close(); assert.equal(h.search[1].signal.aborted, true);
  h.search[1].resolve({ results: [] }); await tick(); assert.equal(h.get('').open, false);
});
test('search timeout does not disable links or page creation; retries recheck the title', async () => {
  const h = harness(); h.controller.open(topic, graph);
  h.timers[0](); h.search[0].reject(new Error('aborted')); await tick();
  h.get('-create').dispatchEvent(new Event('click')); await tick();
  h.get('-create').dispatchEvent(new Event('click')); assert.equal(h.ensure.length, 1);
  h.ensure[0].reject(new Error('lost response')); await tick();
  assert.match(h.get('-status').textContent, /could not be confirmed/);
  h.get('-create').dispatchEvent(new Event('click')); await tick();
  h.ensure[1].resolve({ status: 'found', id: id(2), created: false }); await tick();
  assert.equal(h.navigations.length, 1);
});
test('a late creation cannot navigate after closing or changing brains', async () => {
  const h = harness(); h.controller.open(topic, graph);
  h.get('-create').dispatchEvent(new Event('click')); await tick();
  h.scope('b'); h.controller.close();
  h.ensure[0].resolve({ status: 'found', id: id(2), created: true }); await tick();
  h.search[0].resolve({ results: [] }); await tick();
  assert.deepEqual(h.navigations, []);
});
test('related search uses shared relevance, deduplicates linked notes and labels partial results', async () => {
  const h = harness(); h.controller.open(topic, graph);
  assert.equal(h.search[0].query, 'fasting'); assert.equal(h.search[0].limit, 24);
  h.search[0].resolve({ index: { stale: true }, results: [
    { provenance: { metadata: { id: id(1), title: 'fasting journal' } } },
    { provenance: { metadata: { id: id(3), title: '<fasting>' } } },
    { provenance: { metadata: { id: id(4), title: 'Unrelated' } } },
  ] }); await tick();
  assert.equal(h.get('-results').children.length, 1);
  assert.equal(h.get('-results').children[0].children[0].textContent, '<fasting>');
  assert.equal(h.get('-related').hidden, false);
  assert.match(h.get('-status').textContent, /incomplete/);
  assert.equal(h.ensure.length, 0);
});
test('late search does not erase an uncertain creation outcome', async () => {
  const h = harness(); h.controller.open(topic, graph);
  h.get('-create').dispatchEvent(new Event('click')); await tick();
  h.ensure[0].reject(new Error('lost response')); await tick();
  h.search[0].resolve({ results: [] }); await tick();
  assert.match(h.get('-status').textContent, /could not be confirmed/);
});
