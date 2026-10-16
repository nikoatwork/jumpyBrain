// Production shell, disposable local notes, no personal memory or email delivery.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { appendEditorText } from './editor-smoke-helpers.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-feedback-'));
const key = 'disposable-secret-feedback-key';
const id = 'mem_a0000000-0000-4000-8000-000000000001';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
let browser, server;
const errors = [];
try {
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, 'notes'), { recursive: true });
  await writeFile(path.join(root, 'notes/private.md'), `---\nid: ${id}\ntitle: Private title\ntype: note\n---\nPrivate note body.\n`);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, colorScheme: width === 390 ? 'dark' : 'light', acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await page.locator('#note-editor').filter({ hasText: 'Private note body.' }).waitFor();
    await page.locator('#open-feedback').click();
    assert.equal(await page.locator('#feedback-dialog').evaluate((el) => el.open), true);
    assert.equal(await page.locator('#feedback-include-logs').isChecked(), true);
    const log = await page.locator('#feedback-logs').inputValue();
    assert.doesNotMatch(log, /Private|disposable-secret|mem_a000|127\.0\.0\.1|private\.md/);
    assert.equal(JSON.parse(log).version, version);
    assert.ok(JSON.parse(log).events.some((event) => event.operation === 'document_read'));
    const text = 'Feedback 🐐 & details\nAnother line';
    await page.locator('#feedback-message').fill(text);
    await page.locator('#feedback-message').press('Control+Enter');
    await page.locator('#feedback-message').press('Meta+k');
    assert.equal(await page.locator('#note-search').evaluate((el) => el.open), false);
    assert.equal(new URL(page.url()).searchParams.get('note'), id);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#feedback-download').click()]);
    assert.equal(download.suggestedFilename(), 'jumpybrain-feedback.eml');
    const email = await readFile(await download.path(), 'utf8');
    assert.match(email, /To: jumpybrain@agentmail.to/);
    assert.match(email, /Content-Disposition: attachment; filename="jumpybrain-diagnostics.txt"/);
    const decoded = [...email.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]*?)\r\n--/g)].map((m) => Buffer.from(m[1], 'base64').toString('utf8'));
    assert.deepEqual(decoded, [text.replaceAll('\n', '\r\n'), log]);
    await page.locator('#feedback-include-logs').uncheck();
    assert.equal(await page.locator('#feedback-logs').inputValue(), '');
    const fallback = new URL(await page.locator('#feedback-mailto').getAttribute('href'));
    assert.equal(fallback.searchParams.get('body'), text);
    const [without] = await Promise.all([page.waitForEvent('download'), page.locator('#feedback-download').click()]);
    assert.doesNotMatch(await readFile(await without.path(), 'utf8'), /Content-Disposition: attachment/);
    await page.locator('#feedback-message').press('Escape');
    await page.waitForFunction(() => !document.querySelector('#feedback-dialog').open);
    assert.equal(await page.locator('#open-feedback').evaluate((el) => el === document.activeElement), true);
    await page.locator('#open-feedback').click();
    assert.equal(await page.locator('#feedback-message').inputValue(), text);
    await page.locator('#feedback-include-logs').check();
    await page.locator('#feedback-dialog details summary').click();
    assert.ok(await page.locator('#feedback-dialog').evaluate((el) => el.getBoundingClientRect().right <= innerWidth));
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
      await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `feedback-${width}.png`) });
    }
    await page.locator('#feedback-close').click();
    let failWithConflict = false;
    await page.route('**/memories/all/documents/*', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      if (failWithConflict) return route.fulfill({ status: 412, contentType: 'application/json', body: JSON.stringify({ error: { code: 'precondition_failed', message: 'Private failure details' } }) });
      // Commit through the real server, then lose the reply before the client
      // sees it. Feedback must say unconfirmed while preserving the draft.
      assert.equal((await route.fetch()).status(), 200);
      return route.abort('connectionrefused');
    });
    await appendEditorText(page, ' Private unsaved feedback fixture.');
    await page.waitForFunction(() => state.editor?.state.saveStatus === 'failed');
    await page.locator('#open-feedback').click();
    const failed = await page.locator('#feedback-logs').inputValue();
    assert.ok(JSON.parse(failed).events.some((event) => event.code === 'network'));
    assert.ok(JSON.parse(failed).events.some((event) => event.outcome === 'unconfirmed'));
    assert.doesNotMatch(failed, /Private|disposable-secret|private\.md/);
    assert.equal(await page.locator('#note-editor').textContent().then((text) => text.includes('Private unsaved feedback fixture.')), true);
    await page.locator('#feedback-close').click(); failWithConflict = true;
    await page.locator('#note-retry').click();
    await page.waitForFunction(() => state.editor?.state.saveErrorCode === 'precondition_failed');
    await page.locator('#open-feedback').click();
    const conflict = await page.locator('#feedback-logs').inputValue();
    assert.ok(JSON.parse(conflict).events.some((event) => event.code === 'conflict'));
    assert.doesNotMatch(conflict, /Private failure|Private unsaved/);
    assert.match(await readFile(path.join(root, 'notes/private.md'), 'utf8'), /unsaved feedback/);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Feedback smoke: PASS (desktop/narrow, light/dark, attachment/opt-out, privacy, shortcuts, focus, network loss/unconfirmed save/conflict evidence, retained draft)');
} finally {
  await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true });
}
