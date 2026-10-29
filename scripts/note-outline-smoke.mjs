// Real production Markdown editor and HTTP transport, disposable memory only.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown, editorSelection, selectEditorText, replaceEditorText, undoEditor } from './editor-smoke-helpers.mjs';
const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-outline-'));
const output = path.resolve('.local-pack/desktop/note-outline');
const id = 'mem_95000000-0000-4000-8000-000000000002', key = 'disposable-outline-key';
const prefix = `---\nid: ${id}\ntitle: A quieter place to think\ncustom: retained\n---\n`;
const headings = ['The idea', 'What matters', 'Decisions', 'Small details', 'Decisions', 'Questions & answers', 'Next steps', 'Keep learning'];
const body = headings.map((heading, index) => `${'#'.repeat(index % 6 + 1)} ${heading}\n\n${'Make space for focused work. Keep useful context nearby and return to it when it matters.\n\n'.repeat(4)}`).join('') + '```md\n# Not a heading\n```\n\n> ## Literal quote\n';
let server, browser;
try {
  await mkdir(path.join(root, 'notes')); await mkdir(output, { recursive: true });
  const file = path.join(root, 'notes/outline.md');
  const original = (prefix + body).replace(/\n/g, '\r\n');
  await writeFile(file, original);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'PUT') writes.push(request); });
  await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
  const rail = page.locator('#note-outline-control'), preview = page.locator('#note-outline-preview');
  await rail.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.note-outline-tick').length === 8);
  const hover = async index => {
    const box = await rail.boundingBox();
    await page.mouse.move(box.x + 16, box.y + (index + .5) / 8 * box.height);
    await preview.waitFor();
  };
  const aligned = async index => page.waitForFunction(index => {
    const heading = document.querySelectorAll('#note-editor > :is(h1,h2,h3,h4,h5,h6)')[index];
    return Math.abs(heading.getBoundingClientRect().top - document.getElementById('note-panel').getBoundingClientRect().top - 40) < 2;
  }, index);
  await selectEditorText(page, 2, 7);
  const selection = await editorSelection(page);
  await hover(4);
  assert.equal(await page.locator('#note-outline-title').innerText(), 'Decisions');
  await page.mouse.click((await rail.boundingBox()).x + 16, (await rail.boundingBox()).y + 4.5 / 8 * (await rail.boundingBox()).height);
  await aligned(4);
  assert.deepEqual(await editorSelection(page), selection, 'pointer jump retains live selection');
  await page.waitForFunction(() => document.querySelectorAll('.note-outline-tick')[4].dataset.current === 'true');
  assert.equal(await editorMarkdown(page), body);
  await hover(5);
  assert.equal(await preview.locator('img').count(), 0, 'headings are text only');
  assert.equal(await page.locator('#note-outline-title').textContent(), headings[5]);
  await page.keyboard.press('Escape'); await preview.waitFor({ state: 'hidden' });
  await rail.focus(); await rail.press('End'); await rail.press('Enter'); await aligned(7);
  await rail.press('Home'); await rail.press('Space'); await aligned(0);
  await rail.press('ArrowDown'); await rail.press('Enter'); await aligned(1);
  await rail.press('ArrowUp'); await rail.press('Enter'); await aligned(0);
  await rail.press('Escape'); await preview.waitFor({ state: 'hidden' });
  assert.equal(writes.length, 0, 'navigation never saves');
  assert.equal(await readFile(file, 'utf8'), original, 'canonical CRLF bytes unchanged');
  await page.evaluate(() => document.activeElement.blur());

  // Manual scroll follows the section; theme/resize/collapse keep controls in their gutter.
  for (const width of [1440, 1280, 900, 681, 390, 320]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.nativeMac = 'true'; }, theme);
    if (width > 680) {
      await rail.waitFor();
      await hover(3);
      const bounds = await preview.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 900);
      const geometry = await page.evaluate(() => ({ rail: document.getElementById('note-outline-control').getBoundingClientRect().right, text: document.getElementById('note-editor').getBoundingClientRect().left }));
      assert.ok(geometry.rail <= geometry.text, 'rail does not overlap writing');
    } else assert.equal(await rail.isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `${width}-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#toggle-sidebar').click(); await rail.waitFor(); await hover(2);
  await page.screenshot({ path: path.join(output, 'collapsed.png') });
  await page.evaluate(() => { const panel = document.getElementById('note-panel'), h = document.querySelectorAll('#note-editor > :is(h1,h2,h3,h4,h5,h6)')[6]; panel.scrollTop += h.getBoundingClientRect().top - panel.getBoundingClientRect().top - 40; });
  await page.waitForFunction(() => document.querySelectorAll('.note-outline-tick')[6].dataset.current === 'true');

  // Real typing updates labels without replacing the heading/tick, and undo restores it.
  await selectEditorText(page, 0, 8); await page.keyboard.insertText('New idea');
  await hover(0); await page.waitForFunction(() => document.getElementById('note-outline-title').textContent === 'New idea');
  await undoEditor(page); await hover(0);
  await page.waitForFunction(() => document.getElementById('note-outline-title').textContent === 'The idea');
  await selectEditorText(page, 0, 8); await page.keyboard.insertText('<img src=x onerror=alert(1)>');
  await hover(0);
  await page.waitForFunction(() => document.getElementById('note-outline-title').textContent.includes('<img'));
  assert.equal(await preview.locator('img').count(), 0, 'live untrusted heading text cannot become markup');
  await undoEditor(page);
  await replaceEditorText(page, '# Only heading\n\nText'); await rail.waitFor({ state: 'hidden' });
  await undoEditor(page); await rail.waitFor();
  await page.evaluate(() => state.editor.flush());
  await page.waitForFunction(() => document.querySelector('#note-save-state').textContent === 'Saved');

  // External reconciliation rebuilds the outline without an echo save.
  await page.mouse.move(800, 10); await rail.focus();
  await page.evaluate(() => getSelection().removeAllRanges());
  const beforeExternal = writes.length;
  const remote = body + '\n## External heading\n\nA new section.';
  await writeFile(file, prefix + remote);
  await page.waitForFunction(() => document.querySelectorAll('.note-outline-tick').length === 9);
  assert.equal(writes.length, beforeExternal);
  await page.evaluate(() => richEditor.setReadOnly(true));
  await rail.focus(); await rail.press('End'); await rail.press('Enter');
  assert.match(await rail.getAttribute('aria-label'), /External heading/);
  assert.equal(writes.length, beforeExternal, 'read-only navigation does not write');
  await page.evaluate(() => richEditor.setReadOnly(false));

  await replaceEditorText(page, Array.from({ length: 300 }, (_, i) => `## Section ${i}\n\nBody`).join('\n\n'));
  await page.waitForFunction(() => document.querySelectorAll('.note-outline-tick').length === 300);
  await rail.focus(); await rail.press('End'); await rail.press('Enter');
  assert.match(await rail.getAttribute('aria-label'), /300 of 300: Section 299/);
  assert.equal(await rail.evaluate(e => e.scrollHeight <= e.clientHeight + 2), true, 'dense outline remains bounded');
  await page.screenshot({ path: path.join(output, 'dense.png') });
  await page.locator('#toggle-sidebar').click();
  await page.locator('#home-link').click(); await rail.waitFor({ state: 'hidden' }); await preview.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('PASS heading rail: pointer/keyboard/scroll, duplicates/literal/code, safe previews, live edit/undo/external refresh, read-only, exact CRLF/caret preservation, lifecycle, 300 headings, themes and responsive geometry. Screenshots: ' + output);
} finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }); }
