// Real lexical retrieval/canonical writes through the production gateway and browser.
// npm run build && npx --package=playwright node scripts/extensions-smoke.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { appendEditorText, editorMarkdown } from './editor-smoke-helpers.mjs';
import { createExtensionsFixture } from './extensions-fixture.mjs';

const fixture = await createExtensionsFixture();
const output = path.resolve('.local-pack/extensions-qa/browser'); await mkdir(output, { recursive: true });
let browser, page;
const errors = [], checks = [];
const native = async (route, body, generation = fixture.gateway.coordinator.generation) => {
  const response = await fetch(fixture.url + route, { method: body === undefined ? 'GET' : 'POST', headers: {
    Authorization: 'Bearer ' + fixture.key, 'X-Companion-Generation': String(generation), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const packet = await response.json(); assert.equal(response.status, 200, JSON.stringify(packet)); return packet;
};
try {
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.extensionPageRestored = false; window.addEventListener('pageshow', event => { window.extensionPageRestored = event.persisted; }); });
  await page.goto(fixture.url + '/?brain=' + fixture.activeId + '&note=' + fixture.ids[0] + '#companion=' + fixture.key);
  await page.waitForFunction(() => typeof companionRegistered !== 'undefined' && companionRegistered && state.editor?.state.loaded);
  await page.locator('[data-extension-slot="note.actions"]').getByRole('button', { name: 'Related notes', exact: true }).waitFor();
  const snapshot = await native('/companion/extensions');
  const related = snapshot.extensions.find(item => item.commands.some(command => command.title === 'Related notes'));
  const palette = snapshot.extensions.find(item => item.id === 'ember-plum');
  assert.ok(related && palette); assert.equal(related.status, 'active'); assert.equal(palette.status, 'active');
  const openRelated = () => page.locator('[data-extension-slot="note.actions"]').getByRole('button', { name: 'Related notes', exact: true }).click();
  const panel = page.locator('#extension-panel');
  await openRelated(); await panel.getByRole('button', { name: 'Telescope calibration checklist', exact: true }).waitFor();
  assert.equal(await panel.getByRole('button', { name: 'Telescope calibration', exact: true }).count(), 0, 'current note excluded');
  assert.equal(await page.evaluate(() => typeof require), 'undefined');
  await panel.getByLabel('Find related notes').fill('no-match-xylophoneneedle');
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'No related notes found' }).waitFor();
  await panel.getByLabel('Find related notes').fill('Telescope calibration');
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await panel.getByRole('button', { name: 'Telescope calibration checklist', exact: true }).click();
  await page.waitForFunction(id => state.editor?.state.documentId === id && state.editor.state.loaded, fixture.ids[1]);
  assert.equal(await panel.isVisible(), false, 'guarded document navigation closes stale panel');
  checks.push('real lexical results, editable query, empty state, current-note exclusion and guarded opening');

  // A contribution uses the same dispatcher as configured keyboard commands.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+r' : 'Control+Shift+r');
  await panel.waitFor(); await panel.getByRole('button', { name: 'Telescope calibration', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close extension panel', exact: true }).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('#note-search').waitFor(); await page.locator('#close-search').click();
  checks.push('extension shortcut and existing search command share dispatch');

  await appendEditorText(page, ' Extension theme preserves this draft.');
  const draft = await editorMarkdown(page);
  await page.evaluate(value => {
    window.extensionEditorBefore = richEditor;
    const select = document.getElementById('extension-theme'); select.value = value; select.dispatchEvent(new Event('change'));
  }, palette.id + ':' + palette.themes[0].id);
  assert.equal(await page.evaluate(() => richEditor === window.extensionEditorBefore), true);
  assert.equal(await editorMarkdown(page), draft);
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(33, 29, 41)');
  checks.push('executable palette changes tokens without replacing editor or draft');

  // New examples use public contributions only, with no feature-specific host branch.
  const candy = snapshot.extensions.find(item => item.id === 'candy-pink');
  assert.equal(candy.status, 'active');
  await page.evaluate(value => {
    const select = document.getElementById('extension-theme'); select.value = value; select.dispatchEvent(new Event('change'));
  }, candy.id + ':' + candy.themes[0].id);
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 241, 247)');
  const openTimer = () => page.locator('[data-extension-slot="sidebar.actions"]').getByRole('button', { name: 'Pomodoro', exact: true }).click();
  await openTimer();
  await panel.getByRole('timer').filter({ hasText: '25:00' }).waitFor();
  await panel.getByRole('button', { name: 'Start focus', exact: true }).click();
  await panel.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[role="timer"]')?.textContent !== '25:00');
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  await panel.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  const pausedTimer = await panel.getByRole('timer').innerText();
  await page.getByRole('button', { name: 'Close extension panel', exact: true }).click();
  await openTimer();
  assert.equal(await panel.getByRole('timer').innerText(), pausedTimer);
  await panel.getByRole('button', { name: 'Reset', exact: true }).click();
  await panel.getByRole('timer').filter({ hasText: '25:00' }).waitFor();
  await panel.getByRole('button', { name: 'Break · 5 min', exact: true }).click();
  await panel.getByRole('timer').filter({ hasText: '05:00' }).waitFor();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Pomodoro ${width} fits`);
    await page.screenshot({ path: path.join(output, `candy-pomodoro-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Close extension panel', exact: true }).click();
  checks.push('Candy Pink tokens and Pomodoro start/countdown/pause/reopen/reset/break, at 1280/390/320');

  // Failed canonical saves must still block extension-requested navigation.
  await page.waitForFunction(() => state.editor?.state.saveStatus === 'saved');
  await page.route('**/memories/all/documents/*', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'fixture_unavailable', message: 'Disposable save failure.' } }) }) : route.continue());
  await appendEditorText(page, ' Retain this failed extension-navigation draft.');
  await page.waitForFunction(() => state.editor?.state.saveStatus === 'failed');
  await openRelated(); await panel.getByRole('button', { name: 'Telescope calibration', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'could not open' }).waitFor();
  assert.equal(await page.evaluate(() => state.editor.state.documentId), fixture.ids[1]);
  assert.match(await editorMarkdown(page), /Retain this failed/);
  await page.getByRole('button', { name: 'Close extension panel', exact: true }).click();
  await page.unroute('**/memories/all/documents/*');
  await page.evaluate(() => state.editor.retry());
  await page.waitForFunction(() => state.editor?.state.saveStatus === 'saved' && !state.editor.state.dirty);
  assert.match(await readFile(path.join(fixture.root, 'notes/fixture-1.md'), 'utf8'), /Retain this failed/);
  checks.push('failed saves retain draft and block plugin navigation; retry publishes canonical Markdown');

  await page.evaluate(() => navigation.navigate('/settings'));
  await page.locator('#extension-settings').waitFor();
  for (const scheme of ['light', 'dark']) {
    await page.locator('#extension-theme').selectOption('');
    await page.evaluate(value => colorTheme.setPreference(value), scheme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#extension-list details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `settings ${scheme}/${width} fits`);
      await page.screenshot({ path: path.join(output, `${scheme}-${width}.png`), fullPage: true });
      await page.locator('#extension-list details').evaluateAll(nodes => nodes.forEach(node => { node.open = false; }));
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#extension-theme').selectOption(palette.id + ':' + palette.themes[0].id);
  await page.screenshot({ path: path.join(output, 'plum-settings.png'), fullPage: true });
  checks.push('Settings, palette and controls at 1280/390/320 in both built-in appearances');

  await page.goto(fixture.url + '/?brain=' + fixture.activeId + '&note=' + fixture.ids[0]);
  await page.waitForFunction(() => companionRegistered && state.editor?.state.loaded);
  await page.goto(fixture.url + '/settings?brain=' + fixture.activeId);
  await page.locator('#extension-settings').waitFor();
  await page.goBack();
  await page.waitForFunction(() => companionRegistered && state.editor?.state.loaded);
  const actualBFCacheRestored = await page.evaluate(() => window.extensionPageRestored);
  await openRelated(); await panel.getByRole('button', { name: 'Telescope calibration checklist', exact: true }).waitFor();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `panel ${width} fits`);
    await page.screenshot({ path: path.join(output, `plum-panel-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Close extension panel', exact: true }).click();
  checks.push('real Back restores working extension UI; deterministic controller smoke also covers persisted BFCache lifecycles');

  // Compilation failure preserves the previous working activation; a later reload recovers.
  const packageSource = path.join(fixture.temporary, 'packages/related-notes/main.ts');
  const goodSource = await readFile(packageSource, 'utf8');
  await writeFile(packageSource, goodSource + '\nTHIS IS INVALID TYPESCRIPT {{{\n');
  let reloaded = await native('/companion/extensions/manage', { action: 'reload' });
  assert.equal(reloaded.extensions.find(item => item.id === related.id).status, 'active');
  assert.ok(reloaded.extensions.find(item => item.id === related.id).error);
  await writeFile(packageSource, goodSource);
  reloaded = await native('/companion/extensions/manage', { action: 'reload' });
  assert.equal(reloaded.extensions.find(item => item.id === related.id).error, undefined);
  checks.push('broken reload retains usable activation and a repaired reload recovers');

  // Two registered editors participate in the real save/switch protocol.
  const second = await context.newPage(); second.on('pageerror', error => errors.push(error.message));
  await second.goto(fixture.url + '/?brain=' + fixture.activeId + '&note=' + fixture.ids[0]);
  await second.waitForFunction(() => companionRegistered && state.editor?.state.loaded);
  const oldGeneration = fixture.gateway.coordinator.generation;
  await native('/companion/switch', { id: fixture.remoteId });
  for (const tab of [page, second]) await tab.waitForFunction(generation => companionRegistered && companionState.generation !== generation && companionState.active.kind === 'remote', oldGeneration);
  await page.goto(fixture.url + '/?brain=' + fixture.remoteId + '&note=' + fixture.ids[0]);
  await page.waitForFunction(() => companionRegistered && state.editor?.state.loaded);
  await openRelated(); await panel.getByRole('button', { name: 'Telescope calibration checklist', exact: true }).waitFor();
  checks.push('two-window save barrier, stale-scope teardown and read-only remote retrieval');
  await second.close();
  await page.getByRole('button', { name: 'Close extension panel', exact: true }).click();
  await native('/companion/extensions/manage', { action: 'disable', id: related.id });
  await page.locator('[data-extension-slot="note.actions"]').getByRole('button', { name: 'Related notes', exact: true }).waitFor({ state: 'detached' });
  await native('/companion/extensions/manage', { action: 'enable', id: related.id });
  await page.locator('[data-extension-slot="note.actions"]').getByRole('button', { name: 'Related notes', exact: true }).waitFor();
  await writeFile(path.join(fixture.extensions, 'disabled'), '');
  reloaded = await native('/companion/extensions/manage', { action: 'reload' }); assert.equal(reloaded.safeMode, true);
  await page.locator('[data-extension-slot="note.actions"]').getByRole('button', { name: 'Related notes', exact: true }).waitFor({ state: 'detached' });
  await rm(path.join(fixture.extensions, 'disabled'));
  await native('/companion/extensions/manage', { action: 'reload' });
  await page.locator('[data-extension-slot="note.actions"]').getByRole('button', { name: 'Related notes', exact: true }).waitFor();
  await native('/companion/extensions/manage', { action: 'remove', id: related.id });
  await page.locator('[data-extension-slot="note.actions"]').getByRole('button', { name: 'Related notes', exact: true }).waitFor({ state: 'detached' });
  checks.push('disable, enable, safe-mode reload/recovery and uninstall remove contribution capabilities');
  assert.deepEqual(errors, []);
  await context.close();
  const result = { passed: true, checks, screenshots: output, actualBFCacheRestored, realLexicalBackend: true, source: 'current worktree', physicalDeviceOrAssistiveTechnology: 'not tested' };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
} catch (error) {
  console.error('Extension browser smoke failed:', error.message, 'Renderer errors:', errors);
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(0, 2000)); }
  throw error;
} finally { await browser?.close(); await fixture.close(); }
