import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { installBackNavigation } from '../integrations/electron/back-navigation.mjs';

function fixture() {
  const window = new EventEmitter();
  const contents = window.webContents = new EventEmitter();
  const listeners = new Map();
  let backs = 0, clears = 0, removed = 0, active = 0, entries;
  let url = 'http://127.0.0.1:3787/?brain=a';
  const page = vm.createContext({ navigation: { back() { backs++; } }, window: {
    addEventListener(type, handler, capture) { assert.equal(capture, true); listeners.set(type, handler); },
  } });
  contents.getURL = () => url;
  contents.isDestroyed = () => false;
  contents.executeJavaScript = async source => vm.runInContext(source, page);
  contents.navigationHistory = {
    clear() { clears++; active = 0; },
    getActiveIndex: () => active,
    getAllEntries: () => entries ?? Array.from({ length: active + 1 }, (_, i) => ({ url: url + '&note=' + i })),
    removeEntryAtIndex(index) { assert.equal(index, 0); active--; removed++; return true; },
  };
  installBackNavigation(window, new URL(url).origin);
  return { window, contents, listeners, get backs() { return backs; }, get clears() { return clears; },
    get removed() { return removed; }, set active(value) { active = value; },
    set entries(value) { entries = value.map(url => ({ url })); active = value.length - 1; },
    navigate(value = url) { url = value; contents.emit('did-navigate-in-page', {}, url, true); },
  };
}

test('desktop mouse Back dispatches once per down/up/auxclick sequence; other input stays native', () => {
  const f = fixture();
  f.contents.emit('did-finish-load');
  for (const type of ['mousedown', 'mouseup', 'auxclick']) {
    let prevented = 0;
    const event = { button: 3, preventDefault() { prevented++; } };
    f.listeners.get(type)(event);
    assert.equal(prevented, 1);
    f.listeners.get(type)({ button: 0, preventDefault() { assert.fail('left click intercepted'); } });
  }
  assert.equal(f.backs, 1);
  const key = f.listeners.get('keydown');
  key({ metaKey: true, code: 'BracketLeft', preventDefault() {} });
  key({ metaKey: true, code: 'BracketLeft', repeat: true, preventDefault() {} });
  key({ metaKey: true, code: 'BracketLeft', isComposing: true, preventDefault() {} });
  key({ metaKey: true, shiftKey: true, code: 'BracketLeft', preventDefault() { assert.fail('other chord intercepted'); } });
  assert.equal(f.backs, 2);
});

test('Settings sections and returning to the same note do not evict app destinations', () => {
  const f = fixture();
  f.contents.emit('did-finish-load');
  const origin = 'http://127.0.0.1:3787';
  f.entries = [0, 1, 2, 3, 4].map(n => `${origin}/?brain=a&note=${n}`).concat([
    `${origin}/settings?brain=a`, `${origin}/settings?brain=a&section=appearance`,
    `${origin}/settings?brain=a&section=extensions`, `${origin}/?brain=a&note=4`,
    `${origin}/graph?brain=a`,
  ]);
  f.navigate(`${origin}/graph?brain=a`);
  assert.equal(f.removed, 0, 'all six app destinations remain reachable');
});

test('desktop history prunes only the oldest prefix and resets on reload/brain scope', () => {
  const f = fixture();
  f.contents.emit('did-finish-load');
  f.active = 8; f.navigate();
  assert.equal(f.removed, 3);
  f.active = 4; f.navigate();
  assert.equal(f.removed, 3, 'Back does not remove its forward branch');
  f.navigate('http://127.0.0.1:3787/?brain=b');
  assert.equal(f.clears, 2);
  f.contents.emit('did-finish-load');
  assert.equal(f.clears, 3);
  f.contents.emit('did-navigate-in-page', {}, 'http://127.0.0.1:3787/?brain=c', false);
  assert.equal(f.clears, 3, 'ignore subframes');
  f.navigate('https://example.com/');
  f.contents.emit('did-finish-load');
  assert.equal(f.clears, 3, 'no history or script capability for another origin');
});

test('only a rightward native swipe requests guarded renderer Back on an owned live page', () => {
  const f = fixture();
  for (const direction of ['left', 'up', 'down']) f.window.emit('swipe', {}, direction);
  assert.equal(f.backs, 0);
  f.window.emit('swipe', {}, 'right');
  assert.equal(f.backs, 1);
  f.contents.isDestroyed = () => true;
  f.window.emit('swipe', {}, 'right');
  assert.equal(f.backs, 1);
  f.contents.isDestroyed = () => false;
  f.navigate('https://example.com/');
  f.window.emit('swipe', {}, 'right');
  assert.equal(f.backs, 1);
  f.contents.emit('destroyed');
  assert.equal(f.window.listenerCount('swipe'), 0, 'window teardown releases the native callback');
});
