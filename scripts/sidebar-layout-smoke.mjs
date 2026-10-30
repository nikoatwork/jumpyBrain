// Real companion shell and native update control; all notes/settings are disposable.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { mountInlineUpdates } from '../integrations/electron/update-inline.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), 'jb-sidebar-layout-'));
const root = path.join(temp, 'memory'), support = path.join(temp, 'support');
const captures = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || '/tmp/jumpybrain-sidebar-layout-qa';
const id = n => `mem_ab000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let gateway, browser;
try {
  await initializeMemoryRoot(root);
  await mkdir(support, { mode: 0o700 }); await mkdir(captures, { recursive: true });
  for (let n = 1; n <= 24; n++) {
    await writeFile(path.join(root, 'notes', `${n}.md`), `---\nid: ${id(n)}\ntype: note\ntitle: ${JSON.stringify(n === 24 ? 'A long shared page title that should truncate cleanly' : `Shared page ${n}`)}\nupdated_at: 2026-10-29T12:00:${String(n).padStart(2, '0')}Z\n${n === 1 ? 'attention_at: null\n' : ''}---\nA preview of the latest shared context, with enough text to fill the row.\n`);
  }
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, initialRoot: root, port: 0, controlKey: 'b'.repeat(64), credentials: { get: async () => null, set: async () => {}, delete: async () => {} } });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(gateway.url + '/#companion=' + 'b'.repeat(64));
  await page.locator('#new-board').waitFor({ state: 'visible' });
  await page.locator('#sidebar-recent .sidebar-page').first().waitFor();
  await page.evaluate(mountInlineUpdates);
  await page.evaluate(() => { document.documentElement.dataset.nativeMac = 'true'; });
  await page.locator('#new-board').click();
  await page.getByRole('button',{name:'Rename board',exact:true}).click();
  await page.getByRole('textbox',{name:'Board name',exact:true}).fill('A shared board');
  await page.getByRole('textbox',{name:'Board name',exact:true}).press('Enter');
  await page.locator('#board-title').filter({ hasText: 'A shared board' }).waitFor();
  await page.locator(`#sidebar-recent [data-page-pin="${id(24)}"]`).focus(); await page.keyboard.press('Enter');
  await page.locator('#sidebar-pinned .sidebar-page').waitFor();
  await page.locator('#sidebar-recent-more').click();
  await page.waitForFunction(() => document.querySelectorAll('#sidebar-recent li').length > 8);

  const footerControls = '#graph-link, #open-connection, #open-feedback, #color-theme, #desktop-updates';
  async function checkLayout(width, height, sidebarWidth) {
    await page.setViewportSize({ width, height });
    await page.evaluate(value => document.documentElement.style.setProperty('--sidebar-width', value + 'px'), sidebarWidth);
    const geometry = await page.evaluate(selector => {
      const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const sidebar = document.querySelector('#app-sidebar');
      return {
        sidebar: box(sidebar), footer: box(document.querySelector('.nav-preferences')),
        brain: box(document.querySelector('#companion-active')),
        list: box(document.querySelector('.sidebar-attention-scroll')),
        shelf: box(document.querySelector('#sidebar-settled-section')),
        controls: [...document.querySelectorAll(selector)].map(box),
        footerSibling: document.querySelector('.nav-preferences').parentElement === sidebar,
        attentionContained: document.querySelector('.sidebar-attention-scroll').contains(document.querySelector('#sidebar-recent')),
        shelfContained: document.querySelector('.nav-library').contains(document.querySelector('#sidebar-settled-section')),
        fits: document.documentElement.scrollWidth <= innerWidth,
      };
    }, footerControls);
    assert.ok(geometry.footerSibling && geometry.attentionContained && geometry.shelfContained, 'lists, shelf and footer have separate layout owners');
    assert.ok(geometry.fits, `${width}/${height}/${sidebarWidth}: no horizontal overflow`);
    const size = width <= 680 ? 40 : 32;
    for (const [i, control] of geometry.controls.entries()) {
      assert.equal(control.height, size); assert.equal(control.width, size);
      assert.ok(Math.abs(control.y - geometry.controls[0].y) < 1, 'all five footer controls occupy ONE horizontal bar');
      assert.ok(control.x >= geometry.sidebar.x && control.right <= geometry.sidebar.right, 'footer controls stay inside sidebar');
      if (i) assert.equal(control.x - geometry.controls[i - 1].right, 8, 'footer action gaps are uniform');
    }
    assert.ok(geometry.brain.bottom <= geometry.controls[0].y, 'brain name stays above the action bar');
    assert.ok(geometry.shelf.bottom <= geometry.footer.y, 'Settled never enters the footer');
    assert.ok(geometry.footer.bottom <= height, 'footer stays reachable in short windows');
    assert.ok(geometry.list.bottom <= geometry.shelf.y + 1, 'Attention scrolls independently above Settled');
    const before = geometry.controls[0].y;
    await page.locator('.sidebar-attention-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.equal((await page.locator('#graph-link').boundingBox()).y, before, 'scrolling notes never moves the footer');
    await page.locator('.sidebar-attention-scroll').evaluate(el => { el.scrollTop = 0; });
  }
  for (const [width, height, sidebarWidth] of [[1280, 850, 224], [1280, 850, 280], [1280, 850, 480], [900, 480, 224], [390, 850, 280], [320, 650, 280]]) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { colorTheme.setPreference(theme); colorTheme.setPalette('ocean'); }, theme);
      await checkLayout(width, height, sidebarWidth);
      await page.evaluate(() => document.activeElement.blur()); await page.mouse.move(width - 20, 50);
      const pinned = page.locator('#sidebar-pinned .sidebar-page');
      if (width > 680) {
        const sidebar = await page.locator('#app-sidebar').boundingBox(), entry = await pinned.boundingBox();
        assert.equal(entry.x, sidebar.x, 'desktop row surface reaches the left sidebar edge');
        assert.equal(entry.x + entry.width, sidebar.x + sidebar.width - 1, 'desktop row surface reaches the sidebar divider');
        const title = await pinned.locator('.sidebar-page-title').boundingBox();
        const preview = await pinned.locator('.sidebar-page-preview').boundingBox();
        const age = await pinned.locator('.sidebar-page-age').boundingBox();
        assert.equal(preview.x, title.x); assert.equal(preview.width, title.width, 'title and preview share one truncated text column');
        assert.ok(title.x + title.width + 12 <= age.x, 'age has a separate right-hand lane with at least 12px clearance');
        assert.ok(sidebar.x + sidebar.width - age.x - age.width >= 24, 'age retains its right inset');
        await page.screenshot({ path: path.join(captures, `sidebar-rest-${sidebarWidth}-${theme}.png`) });
        await page.mouse.move(entry.x + 2, entry.y + entry.height / 2);
        assert.equal(await pinned.evaluate(el => el.matches(':hover')), true, 'hover includes the full-width outer edge');
        assert.notEqual(await pinned.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'whole entry paints on edge hover');
      }
      await page.locator('#sidebar-pinned .sidebar-page-link').hover({ position: { x: 8, y: 8 } });
      await page.screenshot({ path: path.join(captures, `sidebar-${width}-${height}-${sidebarWidth}-${theme}.png`) });
    }
  }
  await checkLayout(1280, 850, 280);
  // Hover/focus must keep row bounds, action targets and selection stable.
  await page.locator('#sidebar-pinned .sidebar-page-link').click({ position: { x: 8, y: 8 } });
  await page.locator('#note-editor').waitFor({ state: 'visible' });
  const row = page.locator('#sidebar-pinned .sidebar-page');
  for (const palette of ['ember', 'ocean', 'mono', 'pride']) for (const theme of ['light', 'dark']) {
    await page.evaluate(({ palette, theme }) => { colorTheme.setPalette(palette); colorTheme.setPreference(theme); document.activeElement.blur(); }, { palette, theme });
    await page.mouse.move(700, 50);
    const before = await row.boundingBox();
    const selectedFill = await row.evaluate(el => getComputedStyle(el).backgroundColor);
    await row.locator('a').hover({ position: { x: 8, y: 8 } });
    assert.deepEqual(await row.boundingBox(), before, 'hover never moves/resizes the row');
    assert.equal(await row.evaluate(el => getComputedStyle(el).backgroundColor), selectedFill, 'selection remains distinct during hover');
    assert.equal(await row.locator('a').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'selected row has a single background surface');
    const actions = await row.locator('.sidebar-page-actions').boundingBox();
    for (const selector of ['.sidebar-page-title', '.sidebar-page-preview']) {
      const text = await row.locator(selector).boundingBox();
      assert.ok(text.x + text.width <= actions.x, 'hover actions do not cover the title or preview');
    }
    assert.ok(actions.y >= before.y && actions.y + actions.height <= before.y + before.height, 'actions stay inside their row');
    await row.locator('a').focus(); await page.keyboard.press('Tab');
    assert.equal(await row.locator('[data-page-pin]').evaluate(el => document.activeElement === el), true, 'Tab reaches the first row action');
    assert.equal(await row.locator('.sidebar-page-actions').evaluate(el => getComputedStyle(el).opacity), '1', 'keyboard focus reveals row actions');
    assert.equal(await row.locator('[data-page-pin]').evaluate(el => getComputedStyle(el).outlineStyle), 'solid', 'keyboard focus is visible');
    for (const selector of ['#graph-link', '#open-connection', '#open-feedback', '#color-theme']) {
      await page.mouse.move(700, 50);
      const control = page.locator(selector);
      const style = () => control.evaluate(el => { const s = getComputedStyle(el); return [s.backgroundColor, s.borderStyle === 'none' ? 'none' : s.borderColor]; });
      const resting = await style(); await control.hover();
      assert.deepEqual(await style(), resting, 'icon hover changes glyph color only');
    }
  }
  // Settings keeps theme/update together when other footer actions are hidden.
  await page.locator('#open-connection').click();
  await page.locator('#settings-navigation').waitFor({ state: 'visible' });
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 850 });
    const theme = await page.locator('#color-theme').boundingBox(), update = await page.locator('#desktop-updates').boundingBox();
    assert.equal(theme.y, update.y); assert.equal(update.x - theme.x - theme.width, 8);
    assert.ok(update.x + update.width <= width, 'Settings utilities fit');
  }
  const touch = await browser.newPage({ viewport: { width: 390, height: 850 }, hasTouch: true, isMobile: true });
  await touch.goto(gateway.url + '/#companion=' + 'b'.repeat(64));
  await touch.locator('#sidebar-recent .sidebar-page').first().waitFor();
  const touchRow = touch.locator('#sidebar-recent .sidebar-page').first();
  const touchLink = await touchRow.locator('a').boundingBox(), touchActions = await touchRow.locator('.sidebar-page-actions').boundingBox();
  assert.ok(touchLink.x + touchLink.width <= touchActions.x, 'touch actions remain visible beside the label without hover');
  assert.equal(await touchRow.locator('.sidebar-page-actions').evaluate(el => getComputedStyle(el).opacity), '1');
  await touch.close();
  assert.deepEqual(errors, []);
  console.log('Sidebar layout PASS: companion + native update control, sections, five aligned actions, scroll isolation, 12 layouts, 8 palettes/schemes, hover/focus, Settings.');
} finally {
  await browser?.close(); await gateway?.close(); await rm(temp, { recursive: true, force: true });
}
