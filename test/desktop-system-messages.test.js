import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createSystemMessages, publishSystemMessage } from '../integrations/electron/system-messages.mjs';

function fixture({ url = 'http://127.0.0.1:3787/', available = true, crashed = false } = {}) {
  const events = [], fallbacks = [];
  const document = { getElementById: () => available ? {} : null, dispatchEvent: event => events.push(event) };
  const window = { isDestroyed: () => false, webContents: {
    isDestroyed: () => false, getURL: () => url,
    executeJavaScript: async script => {
      if (crashed) throw new Error('renderer gone');
      return vm.runInNewContext(script, { document, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
    },
  } };
  const notify = createSystemMessages({ getWindow: () => window, getOrigin: () => 'http://127.0.0.1:3787', fallback: value => fallbacks.push(value) });
  return { events, fallbacks, window, notify };
}

test('native messages reach only the owned editor as escaped app-scoped data', async () => {
  const h = fixture();
  const text = '</script><script>throw new Error("x")</script>\n${process.env.SECRET}';
  await h.notify({ source: 'desktop-operation', text, severity: 'warning' });
  assert.equal(h.events.length, 1); assert.equal(h.fallbacks.length, 0);
  assert.equal(h.events[0].type, 'jumpybrain-system-message');
  assert.deepEqual(JSON.parse(JSON.stringify(h.events[0].detail)), { source: 'desktop-operation', text, severity: 'warning', scope: 'app' });
});

test('startup, unavailable renderers, foreign origins and onboarding fall back to native presentation', async () => {
  for (const options of [{ available: false }, { crashed: true }, { url: 'https://example.com/' }, { url: 'http://127.0.0.1:3787/companion/state' }]) {
    const h = fixture(options);
    await h.notify({ source: 'startup', text: 'Service unavailable' });
    assert.equal(h.events.length, 0); assert.equal(h.fallbacks.length, 1);
    assert.equal(h.fallbacks[0].type, 'error');
  }
  assert.equal(await publishSystemMessage(null, undefined, { source: 'startup', text: 'x' }), false);
});
