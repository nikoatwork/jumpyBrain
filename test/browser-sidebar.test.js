import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { sidebarBootstrap, sidebarScript } from '../dist/adapters/http-server/browser-sidebar.js';

function harness({ stored = null, blocked = false } = {}) {
  const listeners = {}, values = new Map(stored === null ? [] : [['jumpybrain.sidebarCollapsed', stored]]);
  const root = { dataset: {} };
  let mounted = false, document;
  const button = { attributes: {}, parentElement: null, setAttribute(key, value) { this.attributes[key] = value; },
    focus() { document.activeElement = this; }, addEventListener(type, callback) { listeners[type] = callback; } };
  const home = { prepend(element) { element.parentElement = this; document.activeElement = null; } };
  const toolbar = { prepend(element) { element.parentElement = this; document.activeElement = null; } };
  const sidebar = { contains(element) { return element === button && button.parentElement === home || element === sidebar; } };
  document = { documentElement: root, body: { dataset: {} }, activeElement: null,
    getElementById(id) { return !mounted ? null : id === 'toggle-sidebar' ? button : sidebar; },
    querySelector(selector) { return selector === '.nav-brand' ? home : toolbar; } };
  const context = vm.createContext({ document, window: { addEventListener(type, callback) { listeners[type] = callback; } },
    localStorage: { getItem(key) { if (blocked) throw Error('blocked'); return values.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error('blocked'); values.set(key, value); } } });
  vm.runInContext(sidebarBootstrap, context);
  assert.equal(root.dataset.sidebarCollapsed, String(stored === 'true'), 'head bootstrap restores preference before DOM mount');
  mounted = true; button.parentElement = home;
  vm.runInContext(sidebarScript, context);
  return { root, button, home, toolbar, document, sidebar, values,
    sync() { vm.runInContext("sidebarPreference.sync()", context); },
    toggle() { listeners.click(); }, storage(newValue, key = 'jumpybrain.sidebarCollapsed') { listeners.storage({ key, newValue }); } };
}

test('collapse moves the same focused toggle outside the hidden sidebar and restores it on expand', () => {
  const h = harness(); h.button.focus(); h.toggle();
  assert.equal(h.button.parentElement, h.toolbar);
  assert.equal(h.button.attributes['aria-expanded'], 'false');
  assert.equal(h.button.attributes['aria-label'], 'Expand sidebar');
  assert.equal(h.document.activeElement, h.button, 'DOM reparenting preserves keyboard focus');
  assert.equal(h.values.get('jumpybrain.sidebarCollapsed'), 'true');
  h.toggle();
  assert.equal(h.button.parentElement, h.home);
  assert.equal(h.document.activeElement, h.button);
  assert.equal(h.button.attributes['aria-expanded'], 'true');
  assert.equal(h.values.get('jumpybrain.sidebarCollapsed'), 'false');
});

test('reload, cross-tab collapse, cleared storage and blocked storage keep the toggle reachable', () => {
  const restored = harness({ stored: 'true' });
  assert.equal(restored.button.parentElement, restored.toolbar);
  restored.storage('false'); assert.equal(restored.button.parentElement, restored.home);
  restored.document.activeElement = restored.sidebar;
  restored.storage('true'); assert.equal(restored.document.activeElement, restored.button, 'collapsing from another tab recovers hidden-sidebar focus');
  restored.storage('false', 'unrelated'); assert.equal(restored.button.parentElement, restored.toolbar);
  restored.storage(null, null); assert.equal(restored.button.parentElement, restored.home);
  const blocked = harness({ blocked: true });
  assert.doesNotThrow(() => blocked.toggle());
  assert.equal(blocked.button.parentElement, blocked.toolbar);
});

// Settings has its own navigation even when the ordinary sidebar is collapsed.
test('Settings temporarily expands navigation without changing the stored notes preference', () => {
  const h = harness({ stored: 'true' });
  h.document.body.dataset.view = 'settings'; h.sync();
  assert.equal(h.root.dataset.sidebarCollapsed, 'false');
  assert.equal(h.values.get('jumpybrain.sidebarCollapsed'), 'true');
  h.document.activeElement = h.sidebar;
  h.storage('true');
  assert.equal(h.document.activeElement, h.sidebar, 'storage sync must not focus the hidden Settings toggle');
  h.document.body.dataset.view = 'note'; h.sync();
  assert.equal(h.root.dataset.sidebarCollapsed, 'true');
  assert.equal(h.button.parentElement, h.toolbar);
});
