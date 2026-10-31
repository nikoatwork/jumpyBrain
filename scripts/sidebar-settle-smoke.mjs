// Confirmed saves, real row animation and recovery in the Mac companion shell.
// Uses only disposable Markdown and browser storage.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), 'jb-sidebar-settle-'));
const root = path.join(temp, 'memory'), support = path.join(temp, 'support');
const id = n => `mem_ac000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let gateway, browser;
try {
  await initializeMemoryRoot(root); await mkdir(support, { mode: 0o700 });
  for (let n = 1; n <= 12; n++) await writeFile(path.join(root, 'notes', `${n}.md`), `---\nid: ${id(n)}\ntitle: Page ${n} with a long title that should never enter action tooltips\nupdated_at: 2026-10-29T12:00:${String(n).padStart(2, '0')}Z\n---\nKeep this page content.\n`);
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, initialRoot: root, port: 0, controlKey: 'b'.repeat(64), credentials: { get: async () => null, set: async () => {}, delete: async () => {} } });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(gateway.url + '/#companion=' + 'b'.repeat(64));
  const rows = page.locator('#sidebar-recent > li');
  const row = n => page.locator(`#sidebar-recent li:has([data-page-link="${id(n)}"])`);
  const settledRow = n => page.locator(`#sidebar-settled li:has([data-page-link="${id(n)}"])`);
  const idle = () => page.waitForFunction(() => !noteAttention.isBusy());
  async function action(n, name, settled = false) {
    const target = settled ? settledRow(n) : row(n);
    await target.locator('a').focus();
    await target.locator(`[data-attention-action="${name}"]`).focus();
    await page.keyboard.press('Enter');
  }
  await rows.first().waitFor(); assert.equal(await rows.count(), 8);
  assert.equal(await page.locator('#sidebar-pinned, #sidebar-pinned-heading').count(), 0);
  assert.equal(await page.locator('.nav-tools #new-board').isVisible(), true);
  assert.equal(await page.locator('.nav-footer #companion-active').count(), 1);
  // Tooltip is action-only; state is visible both at rest and on the action.
  await row(12).locator('a').focus();
  await row(12).locator('[data-page-pin]').focus();
  await page.locator('#control-label').filter({ hasText: /^Pin$/ }).waitFor();
  await page.keyboard.press('Enter');
  assert.equal(await row(12).evaluate(el => el.classList.contains('is-pinned') ? 'true' : 'false'), 'true');
  await row(12).locator('a').focus();
  await row(12).locator('[data-page-pin]').focus();
  await page.locator('#control-label').filter({ hasText: /^Unpin$/ }).waitFor();
  assert.equal(await row(12).locator('[data-page-pin]').getAttribute('aria-pressed'), 'true');
  assert.equal(await row(12).locator('[data-page-pin] path').last().evaluate(el => getComputedStyle(el).fill === getComputedStyle(el).color), true);
  await page.locator('#notes-link').focus(); await page.mouse.move(700, 50);
  assert.equal(await row(12).locator('.sidebar-page-pin-mark').isVisible(), true);

  // A rejected save leaves the pin, row and list length intact; no exit animation.
  const beforeFailure = await rows.count();
  await page.route('**/memories/all/documents/**', route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 412, contentType: 'application/json', body: '{"error":{"message":"Fixture conflict"}}' }) : route.continue());
  await action(12, 'settle');
  await page.locator('#toast-message').filter({ hasText: 'The note changed.' }).waitFor(); await idle();
  assert.equal(await rows.count(), beforeFailure);
  assert.equal(await row(12).evaluate(el => el.classList.contains('is-pinned') ? 'true' : 'false'), 'true');
  assert.equal(await page.locator('[data-settling]').count(), 0);
  await page.unroute('**/memories/all/documents/**');

  // Freeze the actual Web Animation at known frames to inspect its geometry.
  await row(12).evaluate(el => {
    const animate = el.animate.bind(el);
    el.animate = (...args) => { const animation = animate(...args); animation.pause(); window.settleAnimation = animation; return animation; };
  });
  const initialHeight = (await row(12).boundingBox()).height;
  const nextY = (await row(11).boundingBox()).y;
  await action(12, 'settle');
  await page.waitForFunction(() => window.settleAnimation);
  await page.evaluate(() => { window.settleAnimation.currentTime = 80; });
  assert.ok(Number(await row(12).evaluate(el => getComputedStyle(el).opacity)) < 1, 'row visibly fades out');
  assert.notEqual(await row(12).evaluate(el => getComputedStyle(el).transform), 'none', 'row moves out');
  await page.evaluate(() => { window.settleAnimation.currentTime = 200; });
  assert.ok((await row(12).boundingBox()).height < initialHeight / 2, 'row gap visibly closes');
  assert.ok((await row(11).boundingBox()).y < nextY, 'remaining rows move up');
  await page.evaluate(() => window.settleAnimation.finish()); await idle();
  assert.equal(await rows.count(), beforeFailure - 1, 'pinned settle shrinks the unified list');
  assert.equal(await row(12).count(), 0);
  assert.equal(await row(11).locator('a').evaluate(el => el === document.activeElement), true, 'focus follows the next row');
  await page.locator('#toast-action').click(); await idle();
  assert.equal(await row(12).evaluate(el => el.classList.contains('is-pinned') ? 'true' : 'false'), 'true', 'Undo restores the pin');

  // Unpinned settling also shortens a paged list, without instantly backfilling it.
  const count = await rows.count();
  await action(11, 'settle'); await idle();
  assert.equal(await rows.count(), count - 1);
  await page.evaluate(() => sidebarPages.reloadAttention());
  await page.waitForFunction(() => !document.querySelector('#sidebar-recent-empty').textContent.includes('Loading'));
  assert.equal(await rows.count(), count - 1, 'polling does not immediately refill the gap');
  await page.locator('#sidebar-recent-more').click(); assert.ok(await rows.count() > count - 1);
  await page.locator('#sidebar-settled-section summary').click();
  await action(11, 'reactivate', true); await idle();
  await row(11).waitFor(); assert.equal(await row(11).evaluate(el => el.classList.contains('is-pinned') ? 'true' : 'false'), 'false');

  // Narrow lists close the horizontal gap; focus moved elsewhere is not stolen.
  await page.setViewportSize({ width: 390, height: 850 });
  await row(11).evaluate(el => {
    const animate = el.animate.bind(el);
    el.animate = (...args) => { const animation = animate(...args); animation.pause(); window.narrowExit = animation; return animation; };
  });
  const narrowWidth = (await row(11).boundingBox()).width;
  await action(11, 'settle'); await page.waitForFunction(() => window.narrowExit);
  await page.evaluate(() => { window.narrowExit.currentTime = 200; });
  assert.ok((await row(11).boundingBox()).width < narrowWidth / 2, 'horizontal row gap closes');
  await page.locator('#notes-link').focus();
  await page.evaluate(() => window.narrowExit.finish()); await idle();
  assert.equal(await page.locator('#notes-link').evaluate(el => el === document.activeElement), true, 'settle does not steal new user focus');
  await action(11, 'reactivate', true); await idle(); await row(11).waitFor();

  // Repeated actions, reduced motion and the final row leave a coherent empty list.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.settleAnimations = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) { if (this.matches('.sidebar-page')) window.settleAnimations++; return animate.apply(this, args); };
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    const n = width === 1280 ? 12 : 11;
    await action(n, 'settle'); await idle(); assert.equal(await row(n).count(), 0);
  }
  assert.equal(await page.evaluate(() => window.settleAnimations), 0, 'Reduced Motion avoids travel/collapse animation');
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.locator('#sidebar-settled-section summary').click();
  for (let n = 10; n >= 1; n--) { await action(n, 'settle'); await idle(); }
  assert.equal(await rows.count(), 0);
  assert.equal(await page.locator('#sidebar-settled-count').textContent(), '12');
  assert.equal(await page.locator('#sidebar-settled-section summary').evaluate(el => el === document.activeElement), true);
  await page.reload(); await page.locator('#sidebar-settled-count').filter({ hasText: '12' }).waitFor();
  assert.equal(await rows.count(), 0, 'settled and unpinned state survives reload');
  await page.locator('#sidebar-settled-section summary').click();
  await action(12, 'reactivate', true); await idle();
  await row(12).waitFor(); assert.equal(await row(12).evaluate(el => el.classList.contains('is-pinned') ? 'true' : 'false'), 'false');
  assert.deepEqual(errors, []);
  console.log('Sidebar settle PASS: action tooltips, filled/resting pins, rejected saves, actual exit/gap geometry, focus, Undo, paged-list shrink, Bring back, Reduced Motion, repeated/final-row settle and reload.');
} finally {
  await browser?.close(); await gateway?.close(); await rm(temp, { recursive: true, force: true });
}
