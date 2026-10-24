// Focused renderer lifetimes and nonce loader. No gateway, memory engine or final editor build.
// npx --package=playwright node scripts/extensions-browser-controller-smoke.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { launchPlaywrightChromium } from './playwright-runtime.mjs';

const views = await build({ entryPoints: ['src/adapters/http-server/extensions-view.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { extensionSettingsMarkup, extensionPanelMarkup } = await import('data:text/javascript;base64,' + Buffer.from(views.outputFiles[0].text).toString('base64'));
const built = await build({ stdin: { contents: 'export { installExtensionsBrowser } from "./src/adapters/http-server/extensions-browser.ts"; export { createBrowserCommands } from "./src/adapters/http-server/browser-commands.ts";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', globalName: 'Fixture', platform: 'browser', write: false });
const initialize = String.raw`
window.errors = []; window.calls = []; window.assets = []; window.stats = { factories: 0, uiDisposes: 0, factoryReturnDisposes: 0, mounts: 0, disposes: 0, aborted: 0, invocationAborts: 0, eventFailures: 0 };
window.currentScope = 'brain:1'; window.documentMeta = { id: 'note-a', title: 'Title' }; window.opened = [];
window.writable = true; window.failDescriptors = false;
window.snapshot = { apiVersion: 1, revision: 'state-1', safeMode: false, extensions: [{ id: 'fixture', name: 'Fixture', version: '1.0.0', revision: 'asset-1', enabled: true, status: 'active', capabilities: ['memory.read'], commands: [{ id: 'open', title: 'Fixture command', shortcut: 'Mod+Shift+R', slot: 'note.actions' }, { id: 'query', title: 'Query' }], panels: [{ id: 'panel', title: 'Fixture panel' }], themes: [{ id: 'plum', name: 'Plum', appearance: 'dark', colors: { surface: '#211d29', ink: '#eee4ef', 'focus-ring': '#f0af96' } }], ui: '/companion/extensions/assets/fixture/asset-1.js' }] };
window.dispatcher = Fixture.createBrowserCommands(error => errors.push(String(error)));
window.controller = Fixture.installExtensionsBrowser({ document, window, nonce: 'fixture', commands: dispatcher,
  scope: () => currentScope, currentDocument: () => documentMeta, writable: () => writable,
  openNote: async id => { opened.push(id); return true; }, restoreTheme: () => { document.documentElement.dataset.theme = 'light'; }, redrawGraph: () => {}, report: text => errors.push(text),
  request: async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null; calls.push({ url, body });
    if (url === '/companion/extensions') { if (failDescriptors) throw Error('offline'); return structuredClone(snapshot); }
    if (url.endsWith('/event')) {
      if (window.failDocumentEvent && body.event.type === 'document.changed') {
        stats.eventFailures++; snapshot.revision = 'event-error-' + stats.eventFailures;
        snapshot.extensions[0].error = 'Fixture document observer threw';
        throw Error('Fixture document observer threw');
      }
      return { ok: true };
    }
    if (url.endsWith('/manage')) { snapshot.revision += 'x'; if (body.action === 'disable') { snapshot.extensions[0].enabled = false; snapshot.extensions[0].status = 'disabled'; } return structuredClone(snapshot); }
    if (url.endsWith('/invoke')) {
      if (window.holdInvocation) return new Promise(resolve => { window.finishInvocation = () => resolve({ panel: { id: 'panel', data: 'late' } }); options.signal.addEventListener('abort', () => stats.invocationAborts++, { once: true }); });
      if (body.commandId === 'query') return { message: 'query result' };
      return { panel: { id: 'panel', data: '<img src=x onerror=alert(1)>' } };
    }
  }
});
window.sync = () => controller.sync(snapshot.revision);
`;
const ui = String.raw`
globalThis.JumpyBrainExtensions.register('fixture', async api => {
  stats.factories++; window.lastUIAPI = api; api.onDispose(() => stats.uiDisposes++);
  api.registerPanel('panel', async (container, data, ctx) => {
    stats.mounts++; window.lastPanelContext = ctx;
    ctx.signal.addEventListener('abort', () => stats.aborted++, { once: true });
    const text = document.createElement('p'); text.textContent = String(data); container.append(text);
    const query = document.createElement('button'); query.textContent = 'Execute query'; query.onclick = () => ctx.execute('query'); container.append(query);
    const open = document.createElement('button'); open.textContent = 'Open result'; open.onclick = () => ctx.openNote('note-b'); container.append(open);
    if (window.holdMount === 'never') await new Promise(() => {});
    else if (window.holdMount) await new Promise(resolve => { window.finishMount = resolve; });
    return () => { stats.disposes++; container.replaceChildren(); };
  });
  if (window.holdFactory === 'never') await new Promise(() => {});
  else if (window.holdFactory) await new Promise(resolve => { window.finishFactory = resolve; });
  return () => { stats.factoryReturnDisposes++; };
});
`;
const html = '<!doctype html><html data-theme="light"><body><button id="origin">Origin</button><button id="color-theme">Theme</button><div data-extension-slot="sidebar.actions"></div><div data-extension-slot="note.actions"></div>' + extensionSettingsMarkup + extensionPanelMarkup + '<script nonce="fixture" src="/controller.js"></script><script nonce="fixture">' + initialize + '</script></body></html>';
let assetDelay = 0;
const server = createServer((request, response) => {
  const headers = { 'Content-Type': request.url === '/' ? 'text/html' : 'application/javascript', 'Content-Security-Policy': "default-src 'none'; script-src 'nonce-fixture'; connect-src 'self'; style-src 'nonce-fixture'; base-uri 'none'" };
  response.writeHead(200, headers);
  if (request.url === '/') response.end(html);
  else if (request.url === '/controller.js') response.end(built.outputFiles[0].text);
  else if (request.url.startsWith('/companion/extensions/assets/')) setTimeout(() => response.end(ui), assetDelay);
  else response.end('');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchPlaywrightChromium();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
try {
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.evaluate(async () => {
    await controller.sync(); controller.documentChanged(); await controller.emit({ type: 'theme.changed', theme: 'light' });
    document.documentElement.dataset.theme = 'dark';
  });
  assert.deepEqual(await page.evaluate(() => calls), [], 'absent signal is silent, including lifecycle events');
  await page.evaluate(() => sync());
  await page.evaluate(async () => { for (let i = 0; i < 20; i++) await sync(); });
  assert.equal(await page.evaluate(() => calls.filter(call => call.url === '/companion/extensions').length), 1, 'healthy state polling never refetches same descriptor revision');
  assert.equal(await page.evaluate(() => calls.filter(call => call.body?.event?.type === 'document.changed').length), 1, 'initial descriptor activation delivers the current document once');
  assert.equal(await page.evaluate(() => calls.some(call => call.body?.event?.type === 'scope.changed')), false, 'tab activation cannot globally cancel another tab');
  await page.getByRole('button', { name: 'Fixture command', exact: true }).click();
  await page.getByRole('button', { name: 'Execute query' }).waitFor();
  assert.equal(await page.locator('#extension-panel-content img').count(), 0, 'panel test data is untrusted text');
  assert.match(await page.locator('#extension-panel-content').textContent(), /<img/);
  await page.getByRole('button', { name: 'Execute query' }).click();
  await page.waitForFunction(() => calls.some(call => call.body?.commandId === 'query'));
  await page.getByRole('button', { name: 'Open result' }).click();
  assert.deepEqual(await page.evaluate(() => opened), ['note-b']);
  await page.getByRole('button', { name: 'Close extension panel' }).click();
  assert.deepEqual(await page.evaluate(() => ({ ui: stats.uiDisposes, panel: stats.disposes, aborted: stats.aborted })), { ui: 1, panel: 1, aborted: 1 });
  assert.equal(await page.getByRole('button', { name: 'Fixture command', exact: true }).evaluate(el => el === document.activeElement), true, 'close restores command focus');
  assert.equal(await page.evaluate(async () => { try { await lastPanelContext.execute('query'); return false; } catch { return true; } }), true, 'closed UI cannot invoke');
  await page.getByLabel('Extension palette').selectOption('fixture:plum');
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--surface')), '#211d29');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('button', { name: 'Fixture command', exact: true }).click();
  await page.getByRole('button', { name: 'Execute query' }).waitFor();
  await page.evaluate(async () => { currentScope = null; await sync(); });
  assert.equal(await page.locator('#extension-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--surface')), '', 'freeze restores built-in theme');
  assert.equal(await page.evaluate(() => stats.aborted), 2);
  await page.evaluate(async () => { currentScope = 'brain:1'; await sync(); });
  await page.evaluate(() => { window.holdInvocation = true; window.pendingCommand = dispatcher.execute('fixture:open'); });
  await page.waitForFunction(() => typeof finishInvocation === 'function');
  await page.evaluate(() => { documentMeta = { id: 'note-b', title: 'Other' }; controller.documentChanged(); finishInvocation(); });
  await page.evaluate(() => pendingCommand);
  assert.equal(await page.evaluate(() => stats.invocationAborts), 1);
  assert.equal(await page.locator('#extension-panel').isVisible(), false, 'late document command cannot open panel');
  await page.evaluate(() => { window.holdInvocation = false; window.holdMount = true; window.mountSettled = false; window.pendingMount = dispatcher.execute('fixture:open').finally(() => { window.mountSettled = true; }); });
  await page.waitForFunction(() => typeof finishMount === 'function', null, { timeout: 5000 }).catch(async error => { console.error(await page.evaluate(() => ({ stats, errors, calls, text: document.getElementById('extension-panel-content').textContent, open: document.getElementById('extension-panel').open })), pageErrors); throw error; });
  await page.getByRole('button', { name: 'Close extension panel' }).click();
  await page.waitForFunction(() => mountSettled, null, { timeout: 2000 });
  await page.evaluate(() => { window.holdMount = false; window.reopen = dispatcher.execute('fixture:open'); });
  await page.getByRole('button', { name: 'Execute query' }).waitFor();
  const beforeLateMount = await page.evaluate(() => stats.disposes);
  await page.evaluate(async () => { finishMount(); await pendingMount; await reopen; });
  assert.equal(await page.evaluate(() => stats.disposes), beforeLateMount + 1, 'late renderer disposer runs exactly once after cancellation');
  assert.equal(await page.getByRole('button', { name: 'Execute query' }).count(), 1, 'late disposer only clears its own mount');
  await page.getByRole('button', { name: 'Close extension panel' }).click();

  const commandButton = page.locator('[data-extension-slot="note.actions"]').getByRole('button', { name: 'Fixture command', exact: true });
  // A factory or renderer that never returns must not trap the originating button.
  for (const phase of ['factory', 'renderer']) {
    const beforePhase = await page.evaluate(() => ({ factories: stats.factories, mounts: stats.mounts }));
    await page.evaluate(phase => { window.holdFactory = phase === 'factory' ? 'never' : false; window.holdMount = phase === 'renderer' ? 'never' : false; }, phase);
    await commandButton.click();
    await page.waitForFunction(({ phase, before }) => phase === 'factory' ? stats.factories > before.factories : stats.mounts > before.mounts, { phase, before: beforePhase });
    assert.equal(await commandButton.isDisabled(), true);
    await page.evaluate(() => { window.staleUIAPI = lastUIAPI; window.stalePanelContext = lastPanelContext; });
    await page.getByRole('button', { name: 'Close extension panel' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-extension-slot="note.actions"] button').disabled, null, { timeout: 2000 });
    assert.equal(await commandButton.getAttribute('aria-busy'), null, phase + ' cancellation releases button busy state');
    assert.equal(await page.evaluate(() => { try { staleUIAPI.registerPanel('panel', () => {}); return false; } catch { return true; } }), true, 'cancelled factory cannot register a renderer');
    if (phase === 'renderer') {
      assert.equal(await page.evaluate(async () => { try { await stalePanelContext.execute('query'); return false; } catch { return true; } }), true);
      assert.equal(await page.evaluate(() => stalePanelContext.openNote('note-c')), false);
    }
    await page.evaluate(() => { window.holdFactory = false; window.holdMount = false; });
    await commandButton.click();
    await page.getByRole('button', { name: 'Execute query' }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-extension-slot="note.actions"] button').disabled);
    await page.getByRole('button', { name: 'Close extension panel' }).click();
  }
  // A late factory return owns its old cleanup; it cannot replace the reopened UI.
  await page.evaluate(() => { window.holdFactory = true; window.factorySettled = false; window.pendingFactory = dispatcher.execute('fixture:open').finally(() => { window.factorySettled = true; }); });
  await page.waitForFunction(() => typeof finishFactory === 'function');
  await page.evaluate(() => { window.staleUIAPI = lastUIAPI; });
  await page.getByRole('button', { name: 'Close extension panel' }).click();
  await page.waitForFunction(() => factorySettled, null, { timeout: 2000 });
  await page.evaluate(() => { window.holdFactory = false; window.reopenedFactory = dispatcher.execute('fixture:open'); });
  await page.getByRole('button', { name: 'Execute query' }).waitFor();
  const beforeLateFactory = await page.evaluate(() => stats.factoryReturnDisposes);
  await page.evaluate(async () => { finishFactory(); await pendingFactory; await reopenedFactory; });
  assert.equal(await page.evaluate(() => stats.factoryReturnDisposes), beforeLateFactory + 1, 'late factory disposer runs exactly once');
  assert.equal(await page.getByRole('button', { name: 'Execute query' }).count(), 1);
  const beforeLateRegistration = await page.evaluate(() => stats.uiDisposes);
  await page.evaluate(() => staleUIAPI.onDispose(() => stats.uiDisposes++));
  assert.equal(await page.evaluate(() => stats.uiDisposes), beforeLateRegistration + 1, 'late cleanup registration is immediately disposed');
  await page.getByRole('button', { name: 'Close extension panel' }).click();
  assetDelay = 100;
  await page.evaluate(() => { window.lateLoad = dispatcher.execute('fixture:open'); });
  await page.locator('#extension-panel').waitFor();
  await page.evaluate(async () => { snapshot.revision = 'state-2'; await sync(); });
  await page.evaluate(() => lateLoad);
  assert.equal(await page.locator('#extension-panel').isVisible(), false, 'revision change fences a pending UI script');
  // A refused descriptor refresh does not silently retry on every companion poll.
  await page.evaluate(async () => { failDescriptors = true; snapshot.revision = 'offline'; await sync(); for (let i = 0; i < 20; i++) await sync(); });
  assert.equal(await page.evaluate(() => calls.filter(call => call.url === '/companion/extensions').length), 4);
  assetDelay = 0;
  // Simulate a throwing document observer whose host publishes a fresh error
  // revision on every delivery. The renderer must break the feedback loop even
  // without the runtime's independent identical-error revision deduplication.
  const beforeFailure = await page.evaluate(() => calls.filter(call => call.url === '/companion/extensions').length);
  await page.evaluate(async () => { failDescriptors = false; failDocumentEvent = true; documentMeta = { id: 'note-loop', title: 'Observer failure' }; controller.documentChanged(); await sync(); });
  await commandButton.click();
  await page.getByRole('button', { name: 'Execute query' }).waitFor();
  await page.evaluate(async () => { for (let i = 0; i < 30; i++) await sync(); });
  assert.equal(await page.evaluate(() => stats.eventFailures), 1, 'descriptor error revisions do not redeliver document.changed');
  assert.equal(await page.evaluate(() => calls.filter(call => call.url === '/companion/extensions').length), beforeFailure + 1, 'failure causes one descriptor refresh, then stops');
  assert.equal(await page.locator('#extension-panel').isVisible(), true, 'error polling cannot repeatedly dismiss a reopened panel');
  await page.evaluate(async () => { documentMeta = { id: 'note-loop-next', title: 'Real transition' }; controller.documentChanged(); await sync(); for (let i = 0; i < 5; i++) await sync(); failDocumentEvent = false; delete snapshot.extensions[0].error; });
  assert.equal(await page.evaluate(() => stats.eventFailures), 2, 'a real document transition still delivers once');
  assert.equal(await page.locator('#extension-panel').isVisible(), false);

  // Drive the exact persisted lifecycle events used by BFCache. Authentication
  // becomes unavailable until companion re-registration and its existing sync.
  for (let cycle = 0; cycle < 2; cycle++) {
    await commandButton.click();
    await page.getByRole('button', { name: 'Execute query' }).waitFor();
    const beforeHide = await page.evaluate(() => ({ calls: calls.length, disposes: stats.disposes, uiDisposes: stats.uiDisposes }));
    await page.evaluate(() => { window.beforeCacheController = controller; window.cachePanelContext = lastPanelContext; window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); currentScope = null; });
    assert.equal(await page.locator('#extension-panel').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => ({ disposes: stats.disposes, uiDisposes: stats.uiDisposes })), { disposes: beforeHide.disposes + 1, uiDisposes: beforeHide.uiDisposes + 1 });
    assert.equal(await page.evaluate(async () => { try { await dispatcher.execute('fixture:open'); return false; } catch { return true; } }), true, 'cached page relinquishes commands');
    await page.evaluate(async () => { await sync(); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); await sync(); });
    assert.equal(await page.evaluate(() => calls.length), beforeHide.calls, 'persisted pageshow waits for authenticated scope; no new polling');
    await page.evaluate(async () => { currentScope = 'brain:1'; await sync(); });
    assert.equal(await page.evaluate(() => controller === beforeCacheController), true, 'graph-page reference retains a live controller');
    assert.equal(await page.evaluate(async () => { try { await cachePanelContext.execute('query'); return false; } catch { return true; } }), true, 'restoration cannot revive the previous panel context');
    assert.equal(await page.evaluate(() => cachePanelContext.openNote('note-stale')), false);
    const beforeResumeAction = await page.evaluate(() => calls.filter(call => call.url.endsWith('/invoke')).length);
    await commandButton.click();
    await page.getByRole('button', { name: 'Execute query' }).waitFor();
    assert.equal(await page.evaluate(() => calls.filter(call => call.url.endsWith('/invoke')).length), beforeResumeAction + 1, 'restoration retains one command listener');
    await page.getByRole('button', { name: 'Close extension panel' }).click();
  }
  // Activation invalidation must also release unresolved contribution awaits.
  for (const phase of ['factory', 'renderer']) {
    const beforePhase = await page.evaluate(() => ({ factories: stats.factories, mounts: stats.mounts }));
    await page.evaluate(phase => {
      window.holdFactory = phase === 'factory' ? 'never' : false; window.holdMount = phase === 'renderer' ? 'never' : false;
      window.invalidatedSettled = false;
      window.invalidated = dispatcher.execute('fixture:open').finally(() => { window.invalidatedSettled = true; });
    }, phase);
    await page.waitForFunction(({ phase, before }) => phase === 'factory' ? stats.factories > before.factories : stats.mounts > before.mounts, { phase, before: beforePhase });
    await page.evaluate(async () => { snapshot.revision += '-invalidate'; await sync(); });
    await page.waitForFunction(() => invalidatedSettled, null, { timeout: 2000 });
    assert.equal(await page.locator('#extension-panel').isVisible(), false, 'revision invalidates unresolved ' + phase);
    await page.evaluate(() => { window.holdFactory = false; window.holdMount = false; });
    await commandButton.click();
    await page.getByRole('button', { name: 'Execute query' }).waitFor();
    await page.getByRole('button', { name: 'Close extension panel' }).click();
  }
  // Registration/capability fencing is independent of the UI's write confirmation.
  await page.evaluate(async () => { failDescriptors = false; snapshot.revision = 'writes'; snapshot.extensions[0].capabilities = ['memory.write']; await sync(); });
  let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; await dialog.dismiss(); });
  const before = await page.evaluate(() => calls.filter(call => call.url.endsWith('/invoke')).length);
  await page.evaluate(() => dispatcher.execute('fixture:open'));
  assert.equal(confirmations, 1);
  assert.equal(await page.evaluate(() => calls.filter(call => call.url.endsWith('/invoke')).length), before, 'declining write confirmation submits no command');
  await page.evaluate(async () => { writable = false; try { await dispatcher.execute('fixture:open'); } catch {} });
  assert.equal(confirmations, 1, 'read-only brain never prompts or sends write invocation');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  assert.equal(await page.evaluate(async () => { try { await dispatcher.execute('fixture:open'); return false; } catch { return true; } }), true, 'teardown removes commands');
  const afterDispose = await page.evaluate(() => calls.length);
  await page.evaluate(async () => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); await sync(); controller.dispose(); });
  assert.equal(await page.evaluate(() => calls.length), afterDispose, 'permanent teardown cannot resume');
  assert.deepEqual(pageErrors, []);
  console.log('Extension renderer: document failure-loop prevention, cancellable/late factory and panel cleanup, BFCache suspend/restoration, silent legacy bootstrap, nonce IIFE, scoped execute/open, text safety, focus, revision fencing, theme fallback, and write confirmation passed.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
