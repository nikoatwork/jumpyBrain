// Relative Markdown note links in the production shell, on fictional disposable data.
// npm run build && npx --package=playwright node scripts/note-link-smoke.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';
import { editorMarkdown, editorSelection, selectEditorText } from './editor-smoke-helpers.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-note-links-'));
const key = 'fictional-note-link-key';
const ids = { decision: 'mem_a0000000-0000-4000-8000-0000000000d1', page: 'mem_a0000000-0000-4000-8000-0000000000e1', sibling: 'mem_a0000000-0000-4000-8000-0000000000e2' };
// Shape of the reported agent-written metadata line (fictional names).
const metadata = 'Date: 2026-11-10 · Decided by: Sam · Supersedes: ICP and "strongest value: no CRM" in product/README.md; Retail vs Großhandel split in [ICP segmentation](../pages/icp-segmentation.md) as a strategy input';
const body = [metadata, '', 'Also see [sibling](pages/../../pages/sibling.md#notes) and [gone](../pages/missing.md).', '', 'Image stays inert: [diagram](./diagram.png).', '', 'Web: [site](https://example.com/a_b).', ''].join('\n');
const note = (id, title, text) => `---\nid: ${id}\ntype: note\ntitle: ${title}\n---\n${text}`;
let server, browser;
try {
  await initializeMemoryRoot(root);
  const decisionFile = path.join(root, 'decisions', '2026-11-10-icp.md');
  await writeFile(decisionFile, note(ids.decision, 'ICP decision', body));
  await writeFile(path.join(root, 'pages', 'icp-segmentation.md'), note(ids.page, 'ICP segmentation', 'Target page body\n'));
  await writeFile(path.join(root, 'pages', 'sibling.md'), note(ids.sibling, 'Sibling', 'Sibling page body\n'));
  let original = await readFile(decisionFile, 'utf8');
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const width of [1280, 390]) {
    original = await readFile(decisionFile, 'utf8');
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const open = async (id) => {
      await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
      await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved');
    };
    await open(ids.decision);
    const links = page.locator('#note-editor [data-note-link="true"]');
    assert.deepEqual(await links.allTextContents(), ['ICP segmentation', 'sibling', 'gone'], 'note links show their label only');
    assert.deepEqual(await links.evaluateAll((items) => items.map((item) => item.title)), ['../pages/icp-segmentation.md', 'pages/../../pages/sibling.md#notes', '../pages/missing.md'], 'the path shows on hover');
    assert.equal(await links.evaluateAll((items) => items.every((item) => !item.hasAttribute('href'))), true, 'no browser navigation target');
    assert.doesNotMatch(await page.locator('#note-editor').textContent(), /\]\(\.\.\/pages/, 'note-link paths are hidden');
    assert.match(await page.locator('#note-editor').textContent(), /\[diagram\]\(\.\/diagram\.png\)/, 'non-.md relative links stay literal');
    assert.equal(await page.locator('#note-editor [data-note-link]').filter({ hasText: 'diagram' }).count(), 0, 'non-.md relative links stay inert');
    assert.equal(await page.locator('#note-editor .markdown-literal').filter({ hasText: 'Supersedes' }).count(), 0, 'the reported metadata line renders, not raw fallback');
    assert.equal(await links.first().getAttribute('role'), 'link');
    assert.doesNotMatch(await links.first().evaluate((element) => getComputedStyle(element).fontFamily), /mono|Menlo/i, 'reads as a link, not code');
    assert.equal(await editorMarkdown(page), body, 'source spelling is unchanged');
    assert.equal(await readFile(decisionFile, 'utf8'), original, 'hydration never writes');
    original = await readFile(decisionFile, 'utf8');

    // Click opens the resolved note.
    await links.first().click();
    await page.waitForFunction((id) => new URL(location.href).searchParams.get('note') === id, ids.page);
    await page.waitForFunction(() => document.getElementById('note-editor').textContent.includes('Target page body'));
    // A missing target reports the resolved path and stays put.
    await open(ids.decision);
    await links.nth(2).click();
    await page.locator('#toast-message').filter({ hasText: 'No note exists at pages/missing.md' }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('note'), ids.decision);
    // Keyboard: Tab to a link, Enter follows it (bare path with ../ and a #fragment).
    await selectEditorText(page, 0);
    let focused = false;
    for (let i = 0; i < 6 && !focused; i++) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement?.textContent === 'sibling');
    }
    assert.ok(focused, 'Tab reaches the note link');
    await page.keyboard.press('Enter');
    await page.waitForFunction((id) => new URL(location.href).searchParams.get('note') === id, ids.sibling);
    // Editing inside a link still edits its literal source.
    await open(ids.decision);
    const visible = await page.locator('#note-editor').textContent();
    await selectEditorText(page, visible.indexOf('ICP segmentation') + 'ICP segment'.length);
    await page.keyboard.insertText('X');
    await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved');
    assert.match(await readFile(decisionFile, 'utf8'), /\[ICP segmentXation\]\(\.\.\/pages\/icp-segmentation\.md\)/);
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved');
    assert.equal((await readFile(decisionFile, 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, ''), body, 'Backspace restores the exact body (edit metadata may be added)');
    // Typing a complete note link turns it into a label-only link on the closing parenthesis.
    const end = (await page.locator('#note-editor').textContent()).indexOf('Image stays inert') + 'Image '.length;
    await selectEditorText(page, end);
    await page.keyboard.type('Typed [Sib](../pages/sibling.md) ');
    await page.locator('#note-editor [data-note-link="true"]', { hasText: 'Sib' }).first().waitFor();
    await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved');
    assert.match(await readFile(decisionFile, 'utf8'), /Image Typed \[Sib\]\(\.\.\/pages\/sibling\.md\) stays inert/);
    await page.locator('#note-editor [data-note-link="true"]', { hasText: 'Sib' }).first().click();
    await page.waitForFunction((id) => new URL(location.href).searchParams.get('note') === id, ids.sibling);
    // Live preview: the link at the caret shows its exact Markdown; leaving it renders the label again.
    await writeFile(decisionFile, note(ids.decision, 'ICP decision', body));
    await open(ids.decision);
    original = await readFile(decisionFile, 'utf8');
    const text = () => page.locator('#note-editor').textContent();
    const shows = (fragment, present = true) => page.waitForFunction(([fragment, present]) => document.getElementById('note-editor').textContent.includes(fragment) === present, [fragment, present]);
    const siblingRaw = '[sibling](pages/../../pages/sibling.md#notes)';
    await selectEditorText(page, (await text()).indexOf('sibling') + 3);
    await shows(siblingRaw);
    assert.equal((await editorSelection(page))[0], (await text()).indexOf(siblingRaw) + 4, 'the caret keeps its place inside the label');
    assert.equal(await page.locator('#note-editor [data-note-link="true"]').count(), 2, 'only the link at the caret expands');
    assert.equal(await editorMarkdown(page), body, 'revealing is not an edit');
    // Edit the path in place, then leave the link.
    const pathAt = (await text()).indexOf('sibling.md#notes');
    await selectEditorText(page, pathAt, pathAt + 'sibling'.length);
    await page.keyboard.insertText('icp-segmentation');
    await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved');
    const edited = body.replace('pages/sibling.md#notes', 'pages/icp-segmentation.md#notes');
    assert.equal((await readFile(decisionFile, 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, ''), edited, 'the path edit saves exactly');
    await selectEditorText(page, 0);
    await shows(siblingRaw.replace('sibling.md', 'icp-segmentation.md'), false);
    const moved = page.locator('#note-editor [data-note-link="true"]', { hasText: 'sibling' });
    assert.equal(await moved.getAttribute('title'), 'pages/../../pages/icp-segmentation.md#notes', 'the collapsed link carries the new path');
    assert.equal(await editorMarkdown(page), edited, 'collapsing is not an edit');
    // Undo reverts the path edit as one step and shows the original link.
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, body);
    await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved');
    assert.equal((await readFile(decisionFile, 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, ''), body, 'undo restores the exact body');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.waitForFunction((edited) => richEditor.getMarkdown() === edited, edited);
    await selectEditorText(page, 0);
    await shows('[sibling](', false);
    await page.locator('#note-editor [data-note-link="true"]', { hasText: 'sibling' }).click();
    await page.waitForFunction((id) => new URL(location.href).searchParams.get('note') === id, ids.page);
    // Arrow keys: touching a link from outside reveals it; moving away collapses it without writing.
    await writeFile(decisionFile, note(ids.decision, 'ICP decision', body));
    await open(ids.decision);
    original = await readFile(decisionFile, 'utf8');
    await selectEditorText(page, (await text()).indexOf('gone') + 'gone.'.length);
    await shows('[gone](', false);
    await page.keyboard.press('ArrowLeft');
    await shows('[gone](../pages/missing.md).');
    await page.keyboard.press('ArrowLeft');
    assert.equal((await editorSelection(page))[0], (await text()).indexOf('missing.md)') + 'missing.md'.length, 'arrow keys move through the revealed source');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await shows('[gone](', false);
    // A web link reveals its full URL (with `_`) and keeps its href once collapsed.
    await selectEditorText(page, (await text()).indexOf('site') + 2);
    await shows('[site](https://example.com/a_b)');
    assert.equal(await page.locator('#note-editor a[href]').count(), 0, 'the revealed web link is plain text');
    await page.locator('#note-name').focus();
    await shows('[site](', false); // leaving the editor (here for the title field) renders the link again
    assert.equal(await page.locator('#note-editor a[href="https://example.com/a_b"]').count(), 1);
    assert.equal(await editorMarkdown(page), body);
    await page.waitForFunction(() => state.editor?.collaboration?.state.status === 'saved');
    assert.equal(await readFile(decisionFile, 'utf8'), original, 'revealing and collapsing never write');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
    assert.deepEqual(errors, []);
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `note-links-${width}.png`) });
    await page.close();
    await writeFile(decisionFile, note(ids.decision, 'ICP decision', body)); // reset the typed link for the next width
  }
  console.log('note link smoke: PASS (label-only links with path on hover, click/Tab+Enter open resolved notes, missing target reported, inert non-.md, label edits keep exact source, typed links, in-place path editing with undo, arrow-key, web-link and blur reveal/collapse without writes, 1280/390)');
} catch (error) {
  console.error('note link smoke: FAIL - ' + (error.stack || error.message));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
