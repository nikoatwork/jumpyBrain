import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createBrowserCommands, shortcutMatches } from '../dist/adapters/http-server/browser-commands.js';
import { extensionPreferences, extensionThemeColors } from '../dist/adapters/http-server/extensions-browser.js';
import { graphPageHtml } from '../dist/adapters/http-server/graph-page.js';

const key = (value, modifiers = {}) => ({ key: value, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...modifiers });
test('one dispatcher invokes built-ins/extensions; conflicts are stable and disposers remove ownership', async () => {
  const called = [], errors = [];
  const commands = createBrowserCommands(error => errors.push(error));
  const remove = commands.register({ id: 'z:run', title: 'Z', shortcut: 'Mod+K', run: () => called.push('z') });
  commands.register({ id: 'search.open', title: 'Search', shortcut: 'Mod+K', run: () => called.push('search') });
  assert.throws(() => commands.register({ id: 'search.open', title: 'Other', run() {} }), /already/);
  assert.equal(commands.shortcut(key('k', { ctrlKey: true })), true);
  assert.deepEqual(called, ['search']);
  await commands.execute('z:run'); assert.deepEqual(called, ['search', 'z']);
  remove(); await assert.rejects(commands.execute('z:run'), /unavailable/);
  commands.register({ id: 'a:run', title: 'A', shortcut: 'Mod+Shift+R', run() { throw new Error('fixture'); } });
  assert.equal(commands.shortcut(key('R', { metaKey: true, shiftKey: true })), true);
  assert.equal(errors.length, 1);
  assert.equal(shortcutMatches(key('r', { ctrlKey: true, repeat: true }), 'Mod+R'), false);
  assert.equal(shortcutMatches(key('r', { ctrlKey: true, isComposing: true }), 'Mod+R'), false);
  assert.equal(shortcutMatches(key('r', { ctrlKey: true, altKey: true }), 'Mod+R'), false);
  assert.equal(shortcutMatches(key('k'), 'Cmd+K'), false, 'unknown modifiers cannot become plain typing shortcuts');
  assert.equal(shortcutMatches(key('r'), 'r'), false);
});
test('versioned preferences bound untrusted values and themes only override semantic hex colors', () => {
  assert.deepEqual(extensionPreferences({ version: 2, theme: 'bad', order: ['a'] }), { version: 1, order: [], shortcuts: {}, slots: {}, theme: '' });
  const prefs = extensionPreferences({ version: 1, order: ['a', 42], shortcuts: { a: 'Mod+R', b: 2 }, slots: { a: 'note.actions' }, theme: 'theme:dark' });
  assert.deepEqual(prefs.order, ['a']); assert.deepEqual(prefs.shortcuts, { a: 'Mod+R' });
  assert.deepEqual(extensionThemeColors({ surface: '#123', '--ink': '#aabbcc', accent: 'url(https://bad)', position: '#fff', '--focus-ring': '#ff000080' }), [['--surface', '#123'], ['--ink', '#aabbcc'], ['--focus-ring', '#ff000080']]);
});
test('ordinary hosted shell has no extension controls, slots, registry bootstrap or settings', () => {
  const hosted = graphPageHtml('fixture');
  for (const id of ['extension-settings', 'extension-list', 'extension-panel', 'data-extension-slot=']) assert.equal(hosted.includes('id="' + id + '"'), false);
  assert.equal(hosted.includes('extensionUI = JumpyBrainExtensionBrowser.installExtensionsBrowser('), false);
  const desktop = graphPageHtml('fixture', 'settings', { companion: true });
  for (const id of ['extension-settings', 'extension-list', 'extension-panel', 'extension-theme']) assert.ok(desktop.includes('id="' + id + '"'));
  for (const slot of ['sidebar.actions', 'note.actions']) assert.ok(desktop.includes('data-extension-slot="' + slot + '"'));
});
async function example(file) {
  const result = await build({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
test('ordinary TS example constructs bounded explicit search and excludes current/duplicate notes', async () => {
  const { default: activate, relatedQuery } = await example('examples/extensions/related-notes/main.ts');
  const commands = [], panels = [];
  activate({ registerCommand: command => commands.push(command), registerPanel: panel => panels.push(panel) });
  const controller = new AbortController();
  const searches = [];
  const context = { signal: controller.signal, document: { id: 'current', title: '  Telescope\n calibration  ' }, memory: { search: async input => { searches.push(input); return { stale: true, results: [ { id: 'current', title: 'Current', snippet: '' }, { id: 'other', title: '<img onerror=bad>', snippet: 'safe text' }, { id: 'other', title: 'Duplicate', snippet: '' } ] }; } } };
  assert.equal(relatedQuery(null, context), 'Telescope calibration');
  assert.equal(relatedQuery({ query: 'a'.repeat(1000) }, context).length, 240);
  const result = await commands[0].handler(null, context);
  assert.deepEqual(searches, [{ query: 'Telescope calibration', limit: 9 }]);
  assert.equal(result.panel.data.results.length, 1); assert.equal(result.panel.data.stale, true);
  assert.equal(result.panel.data.results[0].title, '<img onerror=bad>');
  context.memory.search = async () => { throw new Error('offline'); };
  assert.equal((await commands[0].handler(null, context)).panel.data.state, 'offline');
  assert.equal((await commands[0].handler({ query: '' }, context)).panel.data.state, 'missing');
  controller.abort(); assert.equal(await commands[0].handler(null, context), undefined);
  assert.deepEqual(panels, [{ id: 'results', title: 'Related notes' }]);
});
test('theme example activates through the same public factory and only registers valid semantic colors', async () => {
  const { default: activate } = await example('examples/extensions/ember-plum/main.ts');
  const themes = []; activate({ registerTheme: theme => themes.push(theme) });
  assert.equal(themes.length, 1); assert.equal(themes[0].appearance, 'dark');
  assert.equal(extensionThemeColors(themes[0].colors).length, Object.keys(themes[0].colors).length);
});
