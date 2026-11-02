// Production shell, HTTP/WS publication and CLI in disposable folders only.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { stampMemoryActor, currentMemoryEditor } from '../dist/core/contribution.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { installCollaborationSmokeTransport } from './collaboration-smoke-transport.mjs';
import { selectEditorText, appendEditorText } from './editor-smoke-helpers.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'jb-attribution-'));
const root = path.join(temporary, 'brain'), identityFile = path.join(temporary, 'identity.json');
const id = 'mem_80442294-1e64-4a0a-91ab-60ffadc0af53', key = 'disposable-attribution-key', controlKey = 'b'.repeat(64);
const file = path.join(root, 'notes/fixture.md');
const captures = path.resolve('.local-pack/contextual-attribution');
let server, gateway, browser;
const cli = (args, input = '') => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, JUMPYBRAIN_IDENTITY_FILE: identityFile, JUMPYBRAIN_CLIENT_NAME: 'Codex', JUMPYBRAIN_API_KEY: key, JUMPYBRAIN_CLI_CONFIG: path.join(temporary, 'cli.json') }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => error += chunk);
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)));
  child.stdin.end(input);
});
try {
  await initializeMemoryRoot(root); await mkdir(captures, { recursive: true });
  const source = stampMemoryActor(`---\nid: ${id}\ntype: note\ntitle: Attribution journey\n---\nA paragraph for selecting and writing.\n\nAnother paragraph keeps its source.\n`, { kind: 'agent', name: 'Alex · Codex' });
  await writeFile(file, source);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  const directory = path.join(temporary, 'support'); await mkdir(directory, { mode: 0o700 });
  gateway = await startCompanionGateway({ runtimeRoot: process.cwd(), directory, identityFile, initialRoot: root, port: 0, controlKey,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {} },
    localFactory: async () => ({ url: server.url, token: key, close: async () => {} }) });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await context.request.post(gateway.url + '/companion/session', { data: { token: controlKey }, headers: { Origin: gateway.url } });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const transport = await installCollaborationSmokeTransport(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const open = async () => {
    await page.goto(gateway.url + '/?brain=' + gateway.store.snapshot().activeId + '&note=' + id);
    await page.waitForFunction(() => (state.editor?.state.saveStatus === 'saved' || state.editor?.state.liveStatus === 'readonly') && !document.getElementById('note-editor').hidden);
  };
  const select = async () => { await selectEditorText(page, 2, 15); await page.locator('#note-attribution').waitFor(); };
  const saved = () => page.waitForFunction(() => state.editor?.state.saveStatus === 'saved' && !state.editor.state.dirty && !state.editor.state.saveInFlight);
  await open(); await select();
  assert.match(await page.locator('#note-attribution').innerText(), /Saved note · last editor\nAgent · Alex · Codex/);
  assert.match(await page.locator('#note-attribution').innerText(), /Whole note; section history is unavailable/);
  assert.equal(await page.locator('.sidebar-page-editor').count(), 0);
  assert.equal(await readFile(file, 'utf8'), source, 'selection never writes Markdown');
  await page.keyboard.press('Escape'); await page.locator('#note-attribution').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => getSelection().isCollapsed), false, 'dismissal preserves the selection');
  await selectEditorText(page, 3); await page.locator('#note-attribution').waitFor({ state: 'hidden' });
  for (const width of [1280, 390]) for (const scheme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(value => colorTheme.setPreference(value), scheme); await select();
    const bounds = await page.locator('#note-attribution').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 850);
    await page.screenshot({ path: path.join(captures, `selection-${width}-${scheme}.png`) });
    await selectEditorText(page, 3);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const setName = async name => {
    await page.evaluate(() => navigation.navigate('/settings?section=identity'));
    await page.locator('#identity-name').waitFor(); await page.locator('#identity-name').fill(name);
    await page.locator('#identity-form button').click();
    await page.locator('#identity-message').filter({ hasText: 'Name saved' }).waitFor();
    assert.equal(JSON.parse(await readFile(identityFile, 'utf8')).name, name);
    await page.screenshot({ path: path.join(captures, 'settings-name.png') });
  };
  await setName('Alex'); await open();
  const held = transport.holdNextRequest('edit');
  await appendEditorText(page, ' Human contribution.'); await held.arrived;
  await select(); assert.match(await page.locator('#note-attribution').innerText(), /Selection may contain unsaved edits/);
  held.release(); await saved();
  assert.equal(currentMemoryEditor(await readFile(file, 'utf8')).name, 'Alex');
  await select(); assert.match(await page.locator('#note-attribution').innerText(), /You/);
  await setName('Sam'); await open();
  await appendEditorText(page, ' Renamed contribution.'); await saved();
  assert.equal(currentMemoryEditor(await readFile(file, 'utf8')).name, 'Sam');
  // Real CLI setup uses the same file, then a guarded remote CLI write declares the agent.
  await cli(['identity', '--name', 'Alex', '--json']);
  const document = await cli(['show', '--target-url', server.url, '--id', id, '--json']);
  await cli(['update', '--target-url', server.url, '--id', id, '--if-match', document.contentHash, '--actor', 'agent', '--json'], document.content + '\nAgent contribution.\n');
  assert.equal(currentMemoryEditor(await readFile(file, 'utf8')).name, 'Alex · Codex');
  await open(); await select(); assert.match(await page.locator('#note-attribution').innerText(), /Agent · Alex · Codex/);
  // Untracked raw edits invalidate note-level attribution instead of retaining a stale name.
  await writeFile(file, (await readFile(file, 'utf8')).replace('Agent contribution.', 'External contribution.'));
  await open(); await select(); assert.match(await page.locator('#note-attribution').innerText(), /Editor unknown/);
  const current = gateway.store.snapshot();
  await gateway.store.save({ ...current.profiles.find(profile => profile.id === current.activeId), allowWrites: false }, current.revision);
  await open(); await page.waitForFunction(() => document.getElementById('note-editor').getAttribute('aria-readonly') === 'true');
  await page.locator('#note-editor').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.getElementById('note-editor'), NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode()) && node.textContent.length < 15) {}
    const range = document.createRange();
    range.setStart(node, 2); range.setEnd(node, 15); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.locator('#note-attribution').waitFor();
  assert.match(await page.locator('#note-attribution').innerText(), /Editor unknown/);
  assert.deepEqual(errors, []);
  console.log('PASS contextual attribution: selection/Escape/collapse, saved/draft scope, read-only and unknowns, responsive light/dark, Settings rename, live human saves, shared CLI setup and owner-prefixed agent write. Captures: ' + captures);
} finally {
  await browser?.close(); await gateway?.close(); await server?.close(); await rm(temporary, { recursive: true, force: true });
}
