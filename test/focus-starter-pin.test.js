import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installStarterPin } from '../integrations/electron/starter-pin.mjs';

test('starter pin handoff preserves existing pins and never restores a dismissed pin', () => {
  const store = new Map(), events = [];
  const context = vm.createContext({ localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    window: { dispatchEvent: event => events.push(event) }, StorageEvent: class { constructor(type, data) { Object.assign(this, { type }, data); } } });
  const page = { id: 'starter', title: 'Today', scope: 'brain:one' };
  const key = 'jumpybrain.pageNavigation.v1:' + page.scope;
  store.set(key, JSON.stringify({ pinned: [{ id: 'other', title: 'Other' }], recent: [] }));
  const run = () => vm.runInContext(`(${installStarterPin.toString()})(${JSON.stringify(page)})`, context);
  run(); assert.deepEqual(JSON.parse(store.get(key)).pinned.map(p => p.id), ['starter', 'other']);
  store.set(key, JSON.stringify({ pinned: [], recent: [] }));
  run(); assert.deepEqual(JSON.parse(store.get(key)).pinned, []); assert.equal(events.length, 1);
  assert.equal(store.has('jumpybrain.pageNavigation.v1:brain:two'), false);
});
