// Build once before running. Production shells, disposable canonical notes; search alone uses a deterministic transport packet.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-chrome-')));
const screenshots = path.resolve('.local-pack/window-chrome-ui');
let gateway, server, browser, child;
try {
  const root = path.join(temporary, 'memory');
  await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  const ids = Array.from({ length: 10 }, (_, n) => `mem_a0000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`);
  for (const [index, id] of ids.entries()) await writeFile(path.join(root, `notes/fixture-${index}.md`),
    `---\nid: ${id}\ntype: note\ntitle: ${index ? 'Window fixture ' + index : 'Outside sidebar'}\nupdated_at: 2026-10-27T00:00:${String(index).padStart(2, '0')}Z\n---\n\nWindow fixture body ${index}.\n`);
  const search = { results: [{ provenance: { file: 'notes/fixture-0.md', metadata: { id: ids[0], title: 'Outside sidebar' } }, snippet: 'A global match absent from sidebar navigation.' }], index: { stale: false }, recognition: { version: 1 } };
  await mkdir(screenshots, { recursive: true });
  server = await startJumpyBrainHttpServer({ root, apiKeys: ['chrome-fixture-key'], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/memories/all/search', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(search) }));
  await page.goto(`${server.url}/#apiKey=chrome-fixture-key`);
  await page.locator('#sidebar-recent a').first().waitFor();
  assert.equal(await page.locator(`[data-page-link="${ids[0]}"]`).count(), 0);
  const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => colorTheme.setPreference(theme), theme);
      assert.equal(await page.locator('html').getAttribute('data-native-mac'), null, 'hosted shell has no native inset');
      assert.ok((await page.locator('#toggle-sidebar').boundingBox()).x < 24, 'hosted header begins at normal inset');
      assert.equal(await page.locator('#home-link').innerText(), 'jumpyBrain');
      assert.equal(await page.locator('#home-link').evaluate(el => getComputedStyle(el).fontWeight), '400');
      assert.equal(await page.locator('.workspace-brand').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(screenshots, `hosted-${theme}-${width}.png`) });
      await page.locator('#toggle-sidebar').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#app-sidebar').isVisible(), false);
      assert.equal(await page.locator('#toggle-sidebar').evaluate(el => document.activeElement === el), true);
      await page.keyboard.press(modifier + '+k');
      await page.locator('#note-search').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#toggle-sidebar').click();
    }
  }
  await page.locator('#open-search').click();
  await page.locator('#note-search-input').fill('Outside sidebar');
  await page.locator('#search-results [role="option"]').first().waitFor();
  assert.match(await page.locator('#search-results').innerText(), /Outside sidebar/);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#note-name')?.value === 'Outside sidebar');
  assert.deepEqual(errors, []);
  await browser.close(); browser = null;
  if (process.platform === 'darwin') {
    const directory = path.join(temporary, 'support'); await mkdir(directory, { mode: 0o700 });
    const key = randomBytes(32).toString('hex');
    gateway = await startCompanionGateway({ runtimeRoot: repo, directory, initialRoot: root, port: 0, controlKey: key,
      credentials: { get: async () => null, set: async () => {}, delete: async () => {}, selectFolder: async () => null } });
    const config = { origin: gateway.url, key, ids, search, screenshots, inspect: process.argv.includes('--inspect'), userData: path.join(temporary, 'electron'), result: path.join(temporary, 'result.json') };
    const fixture = path.join(temporary, 'fixture.json'); await writeFile(fixture, JSON.stringify(config), { mode: 0o600 });
    const entry = path.join(temporary, 'app'); await mkdir(entry);
    await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-chrome-smoke', type: 'module', main: path.join(repo, 'integrations/electron/smoke-window-chrome.mjs') }));
    const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
    const env = { ...process.env, JUMPYBRAIN_CHROME_FIXTURE: fixture }; delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; });
    const timeout = setTimeout(() => child.kill('SIGKILL'), config.inspect ? 900000 : 120000);
    const code = await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timeout);
    assert.equal(code, 0, output.split(key).join('[redacted]'));
    const result = JSON.parse(await readFile(config.result, 'utf8')); assert.equal(result.ok, true, result.error);
    console.log(JSON.stringify(result));
  }
  console.log('Window chrome smoke: PASS (hosted 1280/390/320, themes, collapse/focus, global search; native checks on macOS). Screenshots: ' + screenshots);
} finally {
  if (child?.exitCode === null) child.kill('SIGKILL');
  await browser?.close(); await server?.close(); await gateway?.close();
  await rm(temporary, { recursive: true, force: true });
}
