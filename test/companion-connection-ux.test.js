import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { extractShellFunction } from '../scripts/browser-shell-test-helpers.mjs';

// Exercise the actual embedded controller functions without rebuilding installed/runtime artifacts.
const source = readFileSync(new URL('../src/adapters/http-server/companion-browser.ts', import.meta.url), 'utf8');
function runtime(names, globals = {}) {
  const context = vm.createContext(globals);
  vm.runInContext(names.map(name => extractShellFunction(source, name)).join('\n'), context);
  return context;
}
const remote = { id: 'remote', name: 'VPS brain', kind: 'remote', url: 'https://memory.example', allowWrites: false };

test('shared shell may render connection state before the companion notice is constructed', () => {
  const c = runtime(['renderCompanionAccess'], { document: { getElementById: () => null } });
  // Match the assembled shell's lexical bindings, which still have a TDZ here.
  assert.doesNotThrow(() => vm.runInContext('renderCompanionAccess(); const companionAccessNotice = {};', c));
});

test('Keychain repair and rejected keys take priority over the separate read-only setting', () => {
  const c = runtime(['companionHealthText', 'companionHealthLabel', 'companionConnectionNotice']);
  for (const code of ['credential_unavailable', 'authentication_failed']) {
    assert.doesNotMatch(c.companionHealthLabel(code), /_/);
    const notice = c.companionConnectionNotice(remote, code);
    assert.equal(notice.field, 'companion-key');
    assert.match(notice.text, /key/);
    assert.doesNotMatch(notice.text, /Editing is off/);
  }
  assert.match(c.companionConnectionNotice(remote, 'credential_unavailable').text, /macOS Keychain/);
  assert.match(c.companionConnectionNotice(remote, 'credential_unavailable').text, /app update/);
  assert.equal(c.companionHealthLabel('unknown_internal_code'), 'Connection unavailable');
});

test('Read-only notice identifies a local app preference without silently granting writes', () => {
  const c = runtime(['companionHealthText', 'companionConnectionNotice']);
  const notice = c.companionConnectionNotice(remote, 'connected');
  assert.match(notice.text, /Editing is off.*in this app/);
  assert.equal(notice.field, 'companion-writes');
  assert.equal(notice.action, 'Review editing access');
  assert.equal(remote.allowWrites, false);
  assert.equal(c.companionConnectionNotice({ ...remote, allowWrites: true }, 'connected').text, '');
  assert.equal(c.companionConnectionNotice({ ...remote, kind: 'local', allowWrites: true }, 'connected').text, '');
  assert.match(c.companionConnectionNotice(remote, 'offline').text, /internet connection and server address/);
});

function formFixture(health = 'credential_unavailable') {
  const elements = new Map(); let focused;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: false, focus() { focused = id; }, scrollIntoView() {} });
    return elements.get(id);
  };
  element('companion-kind').value = 'remote';
  const c = runtime(['companionHealthText', 'companionFormKind', 'companionFormError', 'companionEditConnection'], {
    $: element, companionState: { activeId: remote.id, active: remote, profiles: [remote], health, revision: 4 },
    companionHealth: new Map(), companionEditId: null, companionEditRevision: null, companionRemoteDestination: '',
    companionActionBusy: false, companionFrozen: false, companionSessionFailed: false, companionRegistered: true,
    document: { body: { dataset: { settingsPage: 'brains' } } }, state: { view: 'settings' },
    companionClearForm() {}, navigation: { navigate: async () => true },
  });
  return { c, element, focused: () => focused };
}

test('New, existing and broken-key edit forms provide accurate help and focus the repair field', async () => {
  const { c, element, focused } = formFixture();
  c.companionFormKind();
  assert.equal(element('companion-key').required, true);
  assert.doesNotMatch(element('companion-key-help').textContent, /blank/i);
  await c.companionEditConnection(remote.id);
  assert.equal(focused(), 'companion-key');
  assert.match(element('companion-key-help').textContent, /repair this connection/);
  assert.equal(element('companion-writes').checked, false);
  c.companionState.health = 'connected'; c.companionFormKind();
  assert.match(element('companion-key-help').textContent, /Leave blank/);
  await c.companionEditConnection(remote.id, 'companion-writes');
  assert.equal(focused(), 'companion-writes');
});

test('Repair navigation honors the existing save barrier', async () => {
  const { c, element, focused } = formFixture();
  c.state.view = 'note'; c.navigation.navigate = async () => false;
  await c.companionEditConnection(remote.id);
  assert.equal(c.companionEditId, null);
  assert.equal(focused(), undefined);
  assert.equal(element('companion-key').value, '');
});

function focusFixture() {
  const body = {}, listeners = new Set();
  const row = { dataset: { profileId: remote.id }, querySelectorAll() { return [button]; } };
  let button;
  const document = { body, documentElement: {}, querySelectorAll() { return [row]; },
    addEventListener(_, f) { listeners.add(f); }, removeEventListener(_, f) { listeners.delete(f); } };
  function makeButton() { return { disabled: false, closest(selector) { return selector === '.companion-profile' ? row : null; },
    getAttribute() { return 'Test connection'; }, focus() { document.activeElement = this; for (const f of listeners) f({ target: this }); } }; }
  button = makeButton(); document.activeElement = button;
  const c = runtime(['companionAction'], { document, companionActionBusy: false, companionFrozen: false,
    companionRegistered: true, companionSessionFailed: false, state: {}, $: () => ({}), companionMessage() {},
    renderCompanionSettings() {
      if (document.activeElement?.closest?.('.companion-profile')) document.activeElement = body;
      button = makeButton();
    },
  });
  return { c, document, listeners, current: () => button };
}

test('Test connection restores keyboard focus after its row is replaced', async () => {
  const { c, document, listeners, current } = focusFixture();
  await c.companionAction(async () => {});
  assert.equal(document.activeElement, current());
  assert.equal(listeners.size, 0);
});

test('An asynchronous connection action does not steal focus after the user moves elsewhere', async () => {
  const { c, document, listeners, current } = focusFixture();
  const target = {};
  await c.companionAction(async () => {
    document.activeElement = target;
    for (const f of listeners) f({ target });
  });
  assert.equal(document.activeElement, target);
  assert.equal(listeners.size, 0);
});

test('Failed credential saves explain a concrete repair without claiming success', () => {
  const c = runtime(['companionSaveError']);
  assert.match(c.companionSaveError({ code: 'CREDENTIALS_UNAVAILABLE' }), /Re-enter the current server key/);
  assert.match(c.companionSaveError({ code: 'CREDENTIALS_UNAVAILABLE' }), /has not changed/);
  assert.equal(c.companionSaveError({ message: 'Existing validation reason' }), 'Existing validation reason');
});


test('A failed connection form save moves focus to its actionable inline error', async () => {
  const body = {}, form = {}, listeners = new Set();
  const document = { body, documentElement: {},
    addEventListener(_, f) { listeners.add(f); }, removeEventListener(_, f) { listeners.delete(f); } };
  document.activeElement = { closest(selector) { return selector === '#companion-form' ? form : null; }, getAttribute() { return null; } };
  const error = { hidden: true, focus() { document.activeElement = this; } };
  const c = runtime(['companionAction'], { document, companionActionBusy: false, companionFrozen: false,
    companionRegistered: true, companionSessionFailed: false, state: {},
    $: id => id === 'companion-form-error' ? error : {}, companionMessage() {},
    renderCompanionSettings() { if (document.activeElement !== error) document.activeElement = body; },
  });
  await c.companionAction(async () => { error.hidden = false; });
  assert.equal(document.activeElement, error);
  assert.equal(listeners.size, 0);
});
