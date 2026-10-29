// Real production editor, disposable Markdown, no injected CSS or preview hooks.
// npm run build && npx --package=playwright node scripts/task-completion-smoke.mjs
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown, undoEditor } from './editor-smoke-helpers.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-task-completion-'));
const id = 'mem_95000000-0000-4000-8000-000000000001', key = 'disposable-task-completion';
const nextId = 'mem_95000000-0000-4000-8000-000000000002';
const prefix = `---\nid: ${id}\ntitle: Small wins, real progress\n---\n`;
const body = '## Today’s focus\n\n- [x] Gather the important ideas\n- [ ] Finish one meaningful thing\n  - [ ] A nested next step\n- [ ] Leave space for what comes next, including a longer line that wraps comfortably on a narrow writing surface\n';
const output = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || '/tmp/jumpybrain-task-completion-qa';
let server, browser;
const errors = [];
const active = page => page.locator('#note-editor .task-completed');
const animationNames = page => page.evaluate(() => document.getAnimations().map(a => a.animationName || '').filter(name => name.startsWith('task-quiet-')));
const settle = page => page.waitForFunction(() => !document.querySelector('#note-editor .task-completed'));
try {
  await mkdir(path.join(root, 'notes'));
  await writeFile(path.join(root, 'notes/next.md'), `---\nid: ${nextId}\ntitle: Next note\n---\n- [x] Already complete here\n`);
  await mkdir(output, { recursive: true });
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const palette of ['ember', 'ocean', 'mono']) for (const scheme of ['light', 'dark']) {
    const file = path.join(root, 'notes/focus.md');
    await writeFile(file, prefix + body);
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, colorScheme: scheme });
    await context.addInitScript(({ palette, scheme }) => {
      localStorage.setItem('jumpybrain.palette', palette);
      localStorage.setItem('jumpybrain.theme', scheme);
    }, { palette, scheme });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const puts = [];
    page.on('request', r => { if (r.method() === 'PUT') puts.push(r.postDataJSON()); });
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    const checks = page.locator('#note-editor [data-task-toggle]');
    await checks.nth(3).waitFor();
    assert.equal(await active(page).count(), 0, 'loaded checked tasks do not celebrate');
    assert.deepEqual(await animationNames(page), []);
    const rect = () => checks.nth(1).evaluate(button => {
      const { x, y, width, height } = button.parentElement.getBoundingClientRect();
      return { x, y, width, height };
    });
    const before = await rect();
    await checks.nth(1).click();
    assert.equal(await active(page).count(), 1);
    assert.ok((await animationNames(page)).includes('task-quiet-wash'));
    assert.match(await editorMarkdown(page), /- \[x\] Finish/);
    // Hold the completion moment deterministically for visual inspection.
    await page.evaluate(() => document.getAnimations().forEach(a => {
      if (a.animationName?.startsWith('task-quiet-')) { a.pause(); a.currentTime = 300; }
      else a.finish();
    }));
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(output, `${palette}-${scheme}-moment.png`) });
    await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
    await settle(page);
    assert.deepEqual(await rect(), before, 'completion has no layout shift');
    await page.waitForFunction(() => document.querySelector('#note-save-state').textContent === 'Saved');
    assert.equal((await readFile(file, 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, ''), body.replace('- [ ] Finish', '- [x] Finish'));
    assert.ok(puts.some(put => put.content.endsWith(body.replace('- [ ] Finish', '- [x] Finish'))));
    await undoEditor(page);
    assert.equal(await checks.nth(1).getAttribute('aria-checked'), 'false');
    assert.equal(await active(page).count(), 0);
    const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control');
    await page.keyboard.press(`${modifier}+Shift+z`);
    assert.equal(await checks.nth(1).getAttribute('aria-checked'), 'true');
    assert.equal(await active(page).count(), 0, 'redo restores success without a new celebration');
    await checks.nth(1).click();
    await checks.nth(1).focus();
    await checks.nth(1).press('Space');
    assert.equal(await active(page).count(), 1, 'Space completes');
    assert.equal(await checks.nth(1).evaluate(b => getComputedStyle(b).outlineStyle), 'solid');
    await checks.nth(1).press('Enter');
    assert.equal(await active(page).count(), 0, 'uncheck cancels feedback immediately');
    await checks.nth(1).press('Enter');
    assert.equal(await active(page).count(), 1, 'rapid recheck replays');
    // Inspect the adapter lock atomically: shell save renders own its permissions.
    const locked = await page.evaluate(() => {
      richEditor.setReadOnly(true);
      const button = document.querySelectorAll('#note-editor [data-task-toggle]')[1];
      const before = richEditor.getMarkdown();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return { disabled: button.disabled, active: document.querySelectorAll('#note-editor .task-completed').length, unchanged: before === richEditor.getMarkdown() };
    });
    assert.deepEqual(locked, { disabled: true, active: 0, unchanged: true }, 'locking cancels feedback and prevents even synthetic completion');
    await page.evaluate(() => richEditor.setReadOnly(false));
    // Theme changes preserve the draft and never restart completion.
    const draft = await editorMarkdown(page);
    await page.evaluate(value => colorTheme.setPalette(value), palette === 'mono' ? 'ember' : 'mono');
    assert.equal(await active(page).count(), 0);
    assert.equal(await editorMarkdown(page), draft);
    await page.evaluate(value => colorTheme.setPalette(value), palette);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await checks.nth(2).click();
    assert.equal(await checks.nth(2).getAttribute('aria-checked'), 'true');
    assert.deepEqual(await animationNames(page), [], 'Reduced Motion disables all completion animations');
    assert.notEqual(await checks.nth(2).evaluate(b => getComputedStyle(b).backgroundColor), await checks.nth(3).evaluate(b => getComputedStyle(b).backgroundColor));
    await settle(page);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `${palette}-${scheme}-${width}-done.png`) });
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await checks.nth(3).click();
    assert.equal(await active(page).count(), 1);
    await page.evaluate(value => richEditor.setMarkdown(value, true), body);
    assert.equal(await active(page).count(), 0, 'document replacement clears pending feedback');
    await page.evaluate(value => richEditor.setExternalMarkdown(value), body.replace('- [ ] Finish', '- [x] Finish'));
    assert.equal(await active(page).count(), 0, 'external checks do not celebrate');
    await checks.nth(2).click();
    assert.equal(await active(page).count(), 1);
    // Navigate through the actual sidebar/save guard while feedback is active.
    await page.locator(`[data-page-link="${nextId}"]`).click();
    await page.waitForFunction(() => document.querySelector('#note-editor').textContent.includes('Already complete here'));
    assert.equal(await active(page).count(), 0, 'navigation clears feedback');
    await page.locator(`[data-page-link="${id}"]`).click();
    await checks.nth(3).waitFor();
    assert.equal(await active(page).count(), 0, 'returning to saved checks does not replay');
    await checks.nth(3).click();
    assert.equal(await active(page).count(), 1);
    await page.evaluate(() => richEditor.destroy());
    assert.equal(await active(page).count(), 0, 'destroy clears feedback and timers');
    await context.close();
    console.log(`PASS ${palette} ${scheme}: completion/history/locks/replacement/motion and 1280/390/320px`);
  }
  assert.deepEqual(errors, []);
  console.log(`Quiet sweep: six theme combinations, zero page errors. Screenshots: ${output}`);
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
